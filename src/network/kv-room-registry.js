/**
 * TRIARCH: Cyclic Edge - Unified Room Registry
 * Single source of truth for public room discovery and Go-First die matchmaking.
 * Operates across local tabs via localStorage ('triarch_public_rooms_v1') and Synadia JetStream KV ('TRIARCH_ROOMS').
 */

import { GO_FIRST_TO_FACTION, FACTION_TO_GO_FIRST } from './protocol.js';

export const KV_BUCKET_NAME = 'TRIARCH_ROOMS';
export const KV_ROOM_TTL_SECONDS = 3600; // 1 hour auto-expiry in NATS KV
export const KV_MAX_VALUE_SIZE = 2048; // Compact room descriptor limit (bytes)
export const ROOM_STALE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes stale pruning in lobby
export const LOCAL_STORAGE_ROOMS_KEY = 'triarch_public_rooms_v1';

export class KvRoomRegistry {
  /**
   * @param {Object} [options={}]
   * @param {any} [options.nc] - Optional NATS connection instance
   * @param {any} [options.kvStore] - Optional direct KV mock or instance
   */
  constructor(options = {}) {
    this.nc = options.nc || null;
    this.kv = options.kvStore || null;
    this.isAvailable = !!this.kv;
    this.localFallbackRooms = new Map(); // roomCode -> RoomDescriptor
    this._updateListeners = new Set();
    this._hostedWaitingRooms = new Set();

    this._initCodec();
    this._loadFromLocalStorage();
    this._initLocalStorageListener();
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

  _initLocalStorageListener() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key === LOCAL_STORAGE_ROOMS_KEY) {
          this._loadFromLocalStorage();
          this._notifyUpdate();
        }
      });

      window.addEventListener('beforeunload', () => {
        for (const code of this._hostedWaitingRooms) {
          this.deleteRoom(code);
        }
      });
    }
  }

  _saveToLocalStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        const obj = {};
        for (const [code, desc] of this.localFallbackRooms.entries()) {
          obj[code] = desc;
        }
        localStorage.setItem(LOCAL_STORAGE_ROOMS_KEY, JSON.stringify(obj));
      } catch (err) {
        // Fallback for private browsing or quota limits
      }
    }
  }

  _loadFromLocalStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_ROOMS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const currentCodes = new Set(Object.keys(parsed).map((k) => k.toUpperCase()));
            for (const code of Array.from(this.localFallbackRooms.keys())) {
              if (!currentCodes.has(code) && !this._hostedWaitingRooms.has(code)) {
                this.localFallbackRooms.delete(code);
              }
            }
            for (const [code, desc] of Object.entries(parsed)) {
              if (desc && desc.roomCode) {
                this.localFallbackRooms.set(code.toUpperCase(), this.formatDescriptor(desc));
              }
            }
          }
        } else {
          for (const code of Array.from(this.localFallbackRooms.keys())) {
            if (!this._hostedWaitingRooms.has(code)) {
              this.localFallbackRooms.delete(code);
            }
          }
        }
      } catch (err) {}
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
   * Refreshes rooms from storage and notifies listeners.
   */
  broadcastLobbyQuery() {
    this._loadFromLocalStorage();
    this._notifyUpdate();
  }

  static getRoomKey(roomCode) {
    if (!roomCode || typeof roomCode !== 'string') return '';
    return `room.${roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '')}`;
  }

  /**
   * Initializes or binds to the JetStream KV bucket.
   * @param {any} nc - NATS connection instance
   * @returns {Promise<boolean>}
   */
  async init(nc = null) {
    if (nc) {
      this.nc = nc;
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
          try {
            this.kv = await js.views.kv(KV_BUCKET_NAME);
            this.isAvailable = true;
            return true;
          } catch (bindErr) {
            try {
              this.kv = await js.views.createKv(KV_BUCKET_NAME, {
                ttl: KV_ROOM_TTL_SECONDS * 1000,
                history: 1,
                max_value_size: 8192
              });
              this.isAvailable = true;
              return true;
            } catch (createErr) {
              this.isAvailable = false;
              return false;
            }
          }
        }
      }
    } catch (err) {
      this.isAvailable = false;
    }
    return false;
  }

  /**
   * Normalizes and validates a room descriptor to unified G1/G2/G3 schema.
   * @param {Object} rawData
   * @returns {Object} RoomDescriptor
   */
  formatDescriptor(rawData) {
    const rawSeats = rawData.seats || {};

    const buildSeat = (dieKey, factionKey, defaultName) => {
      const src = rawSeats[dieKey] || rawSeats[factionKey] || {};
      const claimed = !!(src.claimed || src.peerId);
      return {
        peerId: src.peerId || null,
        name: src.name || (claimed ? defaultName : null),
        claimed,
        isAI: !!src.isAI,
        die: dieKey,
        faction: factionKey
      };
    };

    const g1 = buildSeat('G1', 'ruby', 'Ruby Archon');
    const g2 = buildSeat('G2', 'cyan', 'Cyan Sentinel');
    const g3 = buildSeat('G3', 'amber', 'Amber Keeper');

    const seats = {
      G1: g1,
      G2: g2,
      G3: g3
    };

    const count = Object.values(seats).filter((s) => s && s.claimed).length || 1;
    const isFull = count >= 3;
    const status = isFull ? 'ACTIVE' : (rawData.status || 'WAITING');
    const roomCode = (rawData.roomCode || 'TR-XXXX').toUpperCase();
    const now = Date.now();
    const createdAt = rawData.createdAt || now;
    const updatedAt = rawData.updatedAt || createdAt;
    const lastSeen = rawData.lastSeen || updatedAt;

    return {
      roomCode,
      gameName: rawData.gameName || `${roomCode} Arena`,
      hostPeerId: rawData.hostPeerId || 'peer_host',
      round: rawData.round || 1,
      phase: rawData.phase || 'INITIATIVE',
      status,
      playerCount: count,
      isFull,
      createdAt,
      updatedAt,
      lastSeen,
      seats
    };
  }

  /**
   * Creates and registers a new room.
   * @param {string} roomCode
   * @param {string} hostPeerId
   * @param {Object} [initialData={}]
   * @returns {Promise<Object>}
   */
  async createRoom(roomCode, hostPeerId, initialData = {}) {
    const code = roomCode.toUpperCase();
    const hostDie = initialData.hostDie || 'G1';
    const hostName = initialData.hostName || initialData.seats?.ruby?.name || initialData.seats?.G1?.name || 'Player 1 (Host)';

    const seatsInit = {
      ...(initialData.seats || {}),
      [hostDie]: {
        peerId: hostPeerId,
        name: hostName,
        claimed: true,
        isAI: false,
        ...(initialData.seats?.[hostDie] || initialData.seats?.ruby || {})
      }
    };

    const descriptor = this.formatDescriptor({
      ...initialData,
      roomCode: code,
      hostPeerId,
      status: 'WAITING',
      seats: seatsInit,
      createdAt: initialData.createdAt || Date.now(),
      updatedAt: initialData.updatedAt || Date.now(),
      lastSeen: initialData.lastSeen || Date.now()
    });

    const key = KvRoomRegistry.getRoomKey(code);

    if (this.kv && typeof this.kv.put === 'function') {
      try {
        await this.kv.put(key, this.jc.encode(descriptor));
      } catch (err) {
        console.warn('[KV Registry] Put error:', err.message);
      }
    }

    this.localFallbackRooms.set(code, descriptor);
    this._hostedWaitingRooms.add(code);
    this._saveToLocalStorage();
    this._notifyUpdate();

    return descriptor;
  }

  /**
   * Debounced room state updater to protect quota limits.
   * @param {string} roomCode
   * @param {Object} updates
   * @param {boolean} [immediate=false]
   * @returns {Promise<Object|void>}
   */
  async updateRoomDebounced(roomCode, updates, immediate = false) {
    const code = roomCode.toUpperCase();
    if (!this._pendingUpdates) this._pendingUpdates = new Map();
    if (!this._debounceTimers) this._debounceTimers = new Map();

    const current = this._pendingUpdates.get(code) || {};
    const merged = { ...current, ...updates };
    this._pendingUpdates.set(code, merged);

    if (this._debounceTimers.has(code)) {
      clearTimeout(this._debounceTimers.get(code));
      this._debounceTimers.delete(code);
    }

    if (immediate) {
      this._pendingUpdates.delete(code);
      return await this._flushRoomUpdate(code, merged);
    }

    const timer = setTimeout(() => {
      this._debounceTimers.delete(code);
      const pending = this._pendingUpdates.get(code);
      if (pending) {
        this._pendingUpdates.delete(code);
        this._flushRoomUpdate(code, pending);
      }
    }, 400);

    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
    this._debounceTimers.set(code, timer);
  }

  async _flushRoomUpdate(roomCode, updates) {
    const code = roomCode.toUpperCase();
    const current = await this.getRoom(code);
    if (!current) return null;

    const formatted = this.formatDescriptor({ ...current, ...updates, lastSeen: Date.now() });
    const key = KvRoomRegistry.getRoomKey(code);

    if (this.kv && typeof this.kv.put === 'function') {
      try {
        if (formatted.isFull && typeof this.kv.delete === 'function') {
          await this.kv.delete(key);
        } else {
          await this.kv.put(key, this.jc.encode(formatted));
        }
      } catch (err) {}
    }

    this.localFallbackRooms.set(code, formatted);
    if (formatted.isFull) {
      this._hostedWaitingRooms.delete(code);
    }

    this._saveToLocalStorage();
    this._notifyUpdate();
    return formatted;
  }

  /**
   * Retrieves a single room descriptor.
   * @param {string} roomCode
   * @returns {Promise<Object|null>}
   */
  async getRoom(roomCode) {
    const code = roomCode.toUpperCase();
    const key = KvRoomRegistry.getRoomKey(code);

    if (this.kv && typeof this.kv.get === 'function') {
      try {
        const entry = await this.kv.get(key);
        if (entry && entry.value) {
          const parsed = this.jc.decode(entry.value);
          const formatted = this.formatDescriptor(parsed);
          this.localFallbackRooms.set(code, formatted);
          return formatted;
        }
      } catch (err) {}
    }

    if (!this.localFallbackRooms.has(code)) {
      this._loadFromLocalStorage();
    }

    return this.localFallbackRooms.get(code) || null;
  }

  /**
   * Lists all active waiting rooms, pruning stale rooms older than maxStaleMs (default: 15 minutes).
   * @param {Object} [options={}]
   * @param {boolean} [options.onlyWaiting=false]
   * @param {number} [options.maxStaleMs=900000]
   * @returns {Promise<Object[]>}
   */
  async listActiveRooms(options = {}) {
    const onlyWaiting = options.onlyWaiting ?? false;
    const maxStaleMs = options.maxStaleMs || ROOM_STALE_TIMEOUT_MS;
    const now = Date.now();
    const roomMap = new Map();

    // 1. Query NATS KV if active
    if (this.kv && typeof this.kv.keys === 'function') {
      try {
        const keyWatcher = await this.kv.keys();
        for await (const k of keyWatcher) {
          if (k && k.startsWith('room.')) {
            try {
              const entry = await this.kv.get(k);
              if (entry && entry.value) {
                const descriptor = this.jc.decode(entry.value);
                const formatted = this.formatDescriptor(descriptor);
                if (now - formatted.lastSeen <= maxStaleMs) {
                  if (!onlyWaiting || (formatted.status === 'WAITING' && !formatted.isFull)) {
                    roomMap.set(formatted.roomCode, formatted);
                  }
                }
              }
            } catch (e) {}
          }
        }
      } catch (err) {}
    }

    // 2. Query in-memory and localStorage rooms
    this._loadFromLocalStorage();
    for (const [code, desc] of this.localFallbackRooms.entries()) {
      if (desc && now - desc.lastSeen <= maxStaleMs) {
        const formatted = this.formatDescriptor(desc);
        if (!onlyWaiting || (formatted.status === 'WAITING' && !formatted.isFull)) {
          if (!roomMap.has(formatted.roomCode)) {
            roomMap.set(formatted.roomCode, formatted);
          }
        }
      } else if (desc && now - desc.lastSeen > maxStaleMs) {
        // Prune stale room
        this.localFallbackRooms.delete(code);
        this._hostedWaitingRooms.delete(code);
      }
    }

    return Array.from(roomMap.values()).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  }

  /**
   * Deletes a room entry from the registry.
   * @param {string} roomCode
   * @returns {Promise<void>}
   */
  async deleteRoom(roomCode) {
    const code = roomCode.toUpperCase();
    const key = KvRoomRegistry.getRoomKey(code);

    if (this.kv && typeof this.kv.delete === 'function') {
      try {
        await this.kv.delete(key);
      } catch (err) {}
    }

    this.localFallbackRooms.delete(code);
    this._hostedWaitingRooms.delete(code);
    this._saveToLocalStorage();
    this._notifyUpdate();
  }
}

export const globalKvRegistry = new KvRoomRegistry();
