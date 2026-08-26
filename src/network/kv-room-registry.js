/**
 * TRIARCH: Cyclic Edge - Synadia JetStream KV Room Registry
 * Manages global public room discovery, Go-First die-driven matchmaking,
 * and state rehydration with free-tier quota guards:
 *  - Bucket: TRIARCH_ROOMS (TTL: 3600s, History: 1, MaxValueSize: 8192)
 *  - Key: room.<ROOM_CODE>
 *  - Throttled / debounced writes (max 1 write per 2000ms)
 *  - Real-time global discovery bus integration (BroadcastChannel & NATS)
 *  - Graceful degradation to in-memory / local fallback when JetStream is unavailable
 */

import { GO_FIRST_TO_FACTION, FACTION_TO_GO_FIRST } from './protocol.js';
import { globalDiscoveryBus, DISCOVERY_ACTIONS, LOCAL_STORAGE_REGISTRY_KEY } from './discovery-bus.js';

export const KV_BUCKET_NAME = 'TRIARCH_ROOMS';
export const KV_ROOM_TTL_SECONDS = 3600; // 1 hour auto-expiry
export const KV_MAX_VALUE_SIZE = 8192; // 8 KB compact limit
export const KV_WRITE_DEBOUNCE_MS = 2000; // 2s rate limit

/**
 * @typedef {Object} RoomDescriptor
 * @property {string} roomCode
 * @property {string} gameName
 * @property {string} hostPeerId
 * @property {string} status - 'WAITING' | 'ACTIVE'
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number} round
 * @property {string} phase
 * @property {Object} seats
 * @property {number} playerCount
 * @property {boolean} isFull
 */

export class KvRoomRegistry {
  /**
   * @param {Object} [options={}]
   * @param {any} [options.nc] - NATS connection instance
   * @param {any} [options.kvStore] - Direct KV store instance (for testing/mocking)
   * @param {any} [options.discoveryBus] - Custom discovery bus instance
   */
  constructor(options = {}) {
    this.nc = options.nc || null;
    this.kv = options.kvStore || null;
    this.bus = options.discoveryBus || globalDiscoveryBus;
    this.jc = null;

    this.isAvailable = false;
    this.localFallbackRooms = new Map(); // In-memory fallback map: roomKey -> RoomDescriptor
    this._debounceTimers = new Map(); // roomCode -> timeout
    this._pendingWrites = new Map(); // roomCode -> data
    this._updateListeners = new Set();

    this._initCodec();
    this._initBus();
  }

  _initCodec() {
    const te = new TextEncoder();
    const td = new TextDecoder();
    this.jc = {
      encode: (d) => te.encode(JSON.stringify(d)),
      decode: (b) => {
        if (typeof b === 'string') return JSON.parse(b);
        return JSON.parse(td.decode(b));
      }
    };
  }

  _initBus() {
    if (this.bus && typeof this.bus.onRoomUpdate === 'function') {
      this.bus.onRoomUpdate((action, payload) => {
        if (action === DISCOVERY_ACTIONS.ROOM_ADVERTISE && payload && payload.roomCode) {
          const key = KvRoomRegistry.getRoomKey(payload.roomCode);
          this.localFallbackRooms.set(key, this.formatDescriptor(payload));
          this._notifyUpdate();
        } else if (action === DISCOVERY_ACTIONS.ROOM_REMOVED && payload) {
          const key = KvRoomRegistry.getRoomKey(payload);
          this.localFallbackRooms.delete(key);
          this._notifyUpdate();
        }
      });
    }
  }

  _notifyUpdate() {
    for (const cb of this._updateListeners) {
      try { cb(); } catch (e) {}
    }
  }

  /**
   * Subscribes to live room listing updates.
   * @param {() => void} cb
   * @returns {() => void} Unsubscribe function
   */
  onRoomsUpdate(cb) {
    this._updateListeners.add(cb);
    return () => this._updateListeners.delete(cb);
  }

  /**
   * Solicits instant room announcements from all active hosts.
   */
  broadcastLobbyQuery() {
    if (this.bus) {
      this.bus.queryLobby();
    }
  }

  static getRoomKey(roomCode) {
    if (!roomCode || typeof roomCode !== 'string') return '';
    return `room.${roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '')}`;
  }

  /**
   * Initializes or binds to the JetStream KV bucket.
   * Gracefully degrades to local in-memory fallback if JetStream is disabled.
   * @param {any} nc - NATS connection instance
   * @returns {Promise<boolean>} Whether JetStream KV is active
   */
  async init(nc = null) {
    if (nc) {
      this.nc = nc;
      if (this.bus) this.bus.nc = this.nc;
    }
    if (this.kv) {
      this.isAvailable = true;
      return true;
    }

    if (!this.nc) {
      this.isAvailable = false;
      return false;
    }

    try {
      if (typeof this.nc.jetstream === 'function') {
        const js = this.nc.jetstream();
        if (js && js.views && typeof js.views.kv === 'function') {
          // Attempt to bind or create TRIARCH_ROOMS bucket
          try {
            this.kv = await js.views.kv(KV_BUCKET_NAME);
            this.isAvailable = true;
            console.log(`[KV Registry] Bound to JetStream KV Bucket: ${KV_BUCKET_NAME}`);
            return true;
          } catch (bindErr) {
            // Attempt to create bucket if permitted
            try {
              if (typeof js.views.createKv === 'function') {
                this.kv = await js.views.createKv(KV_BUCKET_NAME, {
                  ttl: KV_ROOM_TTL_SECONDS * 1000,
                  history: 1,
                  maxValueSize: KV_MAX_VALUE_SIZE
                });
                this.isAvailable = true;
                return true;
              }
            } catch (createErr) {
              console.warn('[KV Registry] JetStream KV creation skipped (fallback mode active):', createErr.message);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[KV Registry] JetStream unavailable, using fallback:', err.message);
    }

    this.isAvailable = false;
    return false;
  }

  /**
   * Sanitizes and formats a RoomDescriptor for compact JSON serialization.
   * Indexes seats strictly by Go-First dice (G1, G2, G3) with faction duality.
   * @param {Object} rawData
   * @returns {RoomDescriptor}
   */
  formatDescriptor(rawData) {
    const rawSeats = rawData.seats || {};

    const getSeat = (dieKey, factionKey, defaultName) => {
      const src = rawSeats[dieKey] || rawSeats[factionKey] || {};
      const claimed = src.claimed ?? !!src.peerId ?? false;
      return {
        peerId: src.peerId || null,
        name: src.name || (claimed ? defaultName : null),
        claimed: !!claimed,
        faction: factionKey,
        isAI: !!src.isAI
      };
    };

    const g1 = getSeat('G1', 'ruby', 'Ruby Archon');
    const g2 = getSeat('G2', 'cyan', 'Cyan Sentinel');
    const g3 = getSeat('G3', 'amber', 'Amber Keeper');

    const seats = {
      G1: g1,
      G2: g2,
      G3: g3,
      ruby: g1,
      cyan: g2,
      amber: g3
    };

    let playerCount = 0;
    if (g1.claimed) playerCount++;
    if (g2.claimed) playerCount++;
    if (g3.claimed) playerCount++;
    if (playerCount === 0) playerCount = 1;

    const isFull = playerCount >= 3;
    const status = isFull ? 'ACTIVE' : (rawData.status === 'ACTIVE' && isFull ? 'ACTIVE' : 'WAITING');

    return {
      roomCode: (rawData.roomCode || 'TR-XXXX').toUpperCase(),
      gameName: rawData.gameName || `${(rawData.roomCode || 'TR-XXXX').toUpperCase()} Arena`,
      hostPeerId: rawData.hostPeerId || 'peer_host',
      status,
      createdAt: rawData.createdAt || Date.now(),
      updatedAt: Date.now(),
      round: rawData.round || 1,
      phase: rawData.phase || 'DEPLOY',
      seats: {
        G1: g1,
        G2: g2,
        G3: g3,
        ruby: g1,
        cyan: g2,
        amber: g3
      },
      playerCount,
      isFull
    };
  }

  /**
   * Immediately registers a newly created room.
   * @param {string} roomCode
   * @param {string} hostPeerId
   * @param {Object} [initialData={}]
   * @returns {Promise<RoomDescriptor>}
   */
  async createRoom(roomCode, hostPeerId, initialData = {}) {
    const hostDie = initialData.hostDie || 'G1';
    const hostFaction = GO_FIRST_TO_FACTION[hostDie] || 'ruby';
    const hostName = initialData.hostName || 'Player 1 (Host)';

    const seatsInit = initialData.seats || {
      [hostDie]: { peerId: hostPeerId, name: hostName, claimed: true, faction: hostFaction, isAI: false }
    };

    const descriptor = this.formatDescriptor({
      ...initialData,
      roomCode,
      hostPeerId,
      status: 'WAITING',
      seats: seatsInit,
      createdAt: Date.now()
    });

    const key = KvRoomRegistry.getRoomKey(roomCode);
    const encoded = this.jc.encode(descriptor);

    // Guard max payload size
    if (encoded.length > KV_MAX_VALUE_SIZE) {
      throw new Error(`Room payload exceeds max size limit (${encoded.length} > ${KV_MAX_VALUE_SIZE})`);
    }

    if (this.kv && typeof this.kv.put === 'function') {
      try {
        await this.kv.put(key, encoded);
      } catch (err) {
        console.warn('[KV Registry] Write error, saved to local cache:', err.message);
      }
    }

    this.localFallbackRooms.set(key, descriptor);

    // Start live discovery advertising
    if (this.bus) {
      this.bus.startAdvertising(descriptor);
    }

    this._notifyUpdate();
    return descriptor;
  }

  /**
   * Claims a specific Go-First die seat in a room.
   * @param {string} roomCode
   * @param {string} dieKey - 'G1', 'G2', 'G3' (or 'ruby', 'cyan', 'amber')
   * @param {string} peerId
   * @param {string} peerName
   * @returns {Promise<RoomDescriptor>}
   */
  async claimSeat(roomCode, dieKey, peerId, peerName) {
    const code = roomCode.toUpperCase();
    const normalizedDie = dieKey.startsWith('G') ? dieKey : (FACTION_TO_GO_FIRST[dieKey] || 'G1');
    const faction = GO_FIRST_TO_FACTION[normalizedDie] || 'ruby';

    const current = await this.getRoom(code);
    if (!current) {
      throw new Error(`Room ${code} does not exist`);
    }

    const currentSeat = current.seats[normalizedDie];
    if (currentSeat && currentSeat.claimed && currentSeat.peerId && currentSeat.peerId !== peerId) {
      throw new Error(`Go-First Die ${normalizedDie} is already claimed by ${currentSeat.name || 'another player'}`);
    }

    // Update seat
    const updatedSeats = { ...current.seats };
    updatedSeats[normalizedDie] = {
      peerId,
      name: peerName || `Archon_${normalizedDie}`,
      claimed: true,
      faction,
      isAI: false
    };

    let count = 0;
    if (updatedSeats.G1?.claimed) count++;
    if (updatedSeats.G2?.claimed) count++;
    if (updatedSeats.G3?.claimed) count++;

    const isFull = count >= 3;
    const status = isFull ? 'ACTIVE' : current.status;

    const descriptor = this.formatDescriptor({
      ...current,
      seats: updatedSeats,
      status,
      playerCount: count,
      isFull
    });

    const key = KvRoomRegistry.getRoomKey(code);
    const encoded = this.jc.encode(descriptor);

    if (this.kv && typeof this.kv.put === 'function') {
      try {
        await this.kv.put(key, encoded);
      } catch (err) {
        console.warn('[KV Registry] Claim write error:', err.message);
      }
    }

    this.localFallbackRooms.set(key, descriptor);

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_REGISTRY_KEY);
        const map = raw ? JSON.parse(raw) : {};
        map[code] = descriptor;
        localStorage.setItem(LOCAL_STORAGE_REGISTRY_KEY, JSON.stringify(map));
      } catch (e) {}
    }

    if (this.bus) {
      if (isFull) {
        this.bus.stopAdvertising(code);
      } else {
        this.bus.updateDescriptor(code, descriptor);
      }
    }

    this._notifyUpdate();
    return descriptor;
  }

  /**
   * Debounced state update (max 1 write per 400ms) to conserve cloud quota.
   * @param {string} roomCode
   * @param {Object} patchData
   * @param {boolean} [immediate=false]
   */
  updateRoomDebounced(roomCode, patchData, immediate = false) {
    const code = roomCode.toUpperCase();
    const existing = this._pendingWrites.get(code) || {};
    this._pendingWrites.set(code, { ...existing, ...patchData });

    if (immediate) {
      if (this._debounceTimers.has(code)) {
        clearTimeout(this._debounceTimers.get(code));
        this._debounceTimers.delete(code);
      }
      const data = this._pendingWrites.get(code);
      this._pendingWrites.delete(code);
      if (data) {
        this._flushRoomUpdate(code, data);
      }
      return;
    }

    if (this._debounceTimers.has(code)) {
      return;
    }

    const timer = setTimeout(() => {
      this._debounceTimers.delete(code);
      const data = this._pendingWrites.get(code);
      this._pendingWrites.delete(code);
      if (data) {
        this._flushRoomUpdate(code, data);
      }
    }, 400);

    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }

    this._debounceTimers.set(code, timer);
  }

  async _flushRoomUpdate(roomCode, patchData) {
    const key = KvRoomRegistry.getRoomKey(roomCode);
    let current = await this.getRoom(roomCode);
    if (!current) {
      current = { roomCode, hostPeerId: 'peer_host', createdAt: Date.now() };
    }

    const descriptor = this.formatDescriptor({
      ...current,
      ...patchData,
      roomCode
    });

    const encoded = this.jc.encode(descriptor);

    if (this.kv && typeof this.kv.put === 'function') {
      try {
        await this.kv.put(key, encoded);
      } catch (err) {
        console.warn('[KV Registry] Update write error:', err.message);
      }
    }

    this.localFallbackRooms.set(key, descriptor);

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_REGISTRY_KEY);
        const map = raw ? JSON.parse(raw) : {};
        if (descriptor.isFull || descriptor.status === 'ACTIVE') {
          delete map[roomCode];
        } else {
          map[roomCode] = descriptor;
        }
        localStorage.setItem(LOCAL_STORAGE_REGISTRY_KEY, JSON.stringify(map));
      } catch (e) {}
    }

    if (this.bus) {
      if (descriptor.isFull || descriptor.status === 'ACTIVE') {
        this.bus.stopAdvertising(roomCode);
      } else {
        this.bus.updateDescriptor(roomCode, descriptor);
      }
    }

    this._notifyUpdate();
    return descriptor;
  }

  /**
   * Retrieves a single room descriptor.
   * @param {string} roomCode
   * @returns {Promise<RoomDescriptor|null>}
   */
  async getRoom(roomCode) {
    const key = KvRoomRegistry.getRoomKey(roomCode);

    if (this.kv && typeof this.kv.get === 'function') {
      try {
        const entry = await this.kv.get(key);
        if (entry && entry.value) {
          const parsed = this.jc.decode(entry.value);
          const formatted = this.formatDescriptor(parsed);
          this.localFallbackRooms.set(key, formatted);
          return formatted;
        }
      } catch (err) {
        // Fallback to local map
      }
    }

    const cached = this.localFallbackRooms.get(key);
    return cached ? this.formatDescriptor(cached) : null;
  }

  /**
   * Lists all active public rooms, filtering out expired ones (> 1 hour).
   * @param {Object} [options={}]
   * @param {boolean} [options.onlyWaiting=false] - Only return rooms in WAITING status
   * @returns {Promise<RoomDescriptor[]>}
   */
  async listActiveRooms(options = {}) {
    const now = Date.now();
    const maxAgeMs = KV_ROOM_TTL_SECONDS * 1000;
    const roomMap = new Map();

    // 1. Fetch from JetStream KV if available
    if (this.kv && typeof this.kv.keys === 'function') {
      try {
        const keyWatcher = await this.kv.keys();
        for await (const k of keyWatcher) {
          if (k && k.startsWith('room.')) {
            try {
              const entry = await this.kv.get(k);
              if (entry && entry.value) {
                const descriptor = this.jc.decode(entry.value);
                if (descriptor && (now - descriptor.updatedAt) < maxAgeMs) {
                  const formatted = this.formatDescriptor(descriptor);
                  if (!options.onlyWaiting || (formatted.status === 'WAITING' && !formatted.isFull)) {
                    roomMap.set(formatted.roomCode, formatted);
                  }
                }
              }
            } catch (e) {}
          }
        }
      } catch (err) {
        // Use local fallback
      }
    }

    // 2. Merge local fallback rooms
    for (const desc of this.localFallbackRooms.values()) {
      if (desc && (now - desc.updatedAt) < maxAgeMs) {
        const formatted = this.formatDescriptor(desc);
        if (!options.onlyWaiting || (formatted.status === 'WAITING' && !formatted.isFull)) {
          if (!roomMap.has(formatted.roomCode)) {
            roomMap.set(formatted.roomCode, formatted);
          }
        }
      }
    }

    // 3. Merge localStorage rooms (cross-tab fallback)
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_REGISTRY_KEY);
        if (raw) {
          const storedMap = JSON.parse(raw);
          for (const desc of Object.values(storedMap)) {
            if (desc && (now - desc.updatedAt) < maxAgeMs) {
              const formatted = this.formatDescriptor(desc);
              if (!options.onlyWaiting || (formatted.status === 'WAITING' && !formatted.isFull)) {
                if (!roomMap.has(formatted.roomCode)) {
                  roomMap.set(formatted.roomCode, formatted);
                }
              }
            }
          }
        }
      } catch (e) {}
    }

    return Array.from(roomMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Deletes a room entry from the registry (e.g. host leaves or match concludes).
   * @param {string} roomCode
   * @returns {Promise<void>}
   */
  async deleteRoom(roomCode) {
    const code = roomCode.toUpperCase();
    const key = KvRoomRegistry.getRoomKey(code);

    if (this._debounceTimers.has(code)) {
      clearTimeout(this._debounceTimers.get(code));
      this._debounceTimers.delete(code);
    }
    this._pendingWrites.delete(code);

    if (this.kv && typeof this.kv.delete === 'function') {
      try {
        await this.kv.delete(key);
      } catch (err) {
        console.warn('[KV Registry] Delete error:', err.message);
      }
    }

    this.localFallbackRooms.delete(key);

    if (this.bus) {
      this.bus.stopAdvertising(code);
    }

    this._notifyUpdate();
  }
}

export const globalKvRegistry = new KvRoomRegistry();
