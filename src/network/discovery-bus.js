/**
 * TRIARCH: Cyclic Edge - Global Lobby Discovery Bus
 * Manages cross-tab and cross-device room advertising, presence query-response,
 * and live synchronization for the multiplayer lobby.
 */

export const LOBBY_GLOBAL_CHANNEL = 'triarch-lobby-global';
export const LOCAL_STORAGE_REGISTRY_KEY = 'triarch_public_rooms_v1';

export const DISCOVERY_ACTIONS = Object.freeze({
  LOBBY_QUERY: 'LOBBY_QUERY',
  ROOM_ADVERTISE: 'ROOM_ADVERTISE',
  ROOM_REMOVED: 'ROOM_REMOVED'
});

export class LobbyDiscoveryBus {
  /**
   * @param {Object} [options={}]
   * @param {any} [options.nc] - Optional NATS connection instance
   */
  constructor(options = {}) {
    this.nc = options.nc || null;
    this.listeners = new Set();
    this._advertiseTimers = new Map(); // roomCode -> setInterval timer
    this._activeDescriptors = new Map(); // roomCode -> descriptor

    this.bc = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.bc = new BroadcastChannel(LOBBY_GLOBAL_CHANNEL);
        this.bc.onmessage = (event) => this._handleMessage(event.data);
      } catch (e) {
        this.bc = null;
      }
    }

    // Storage event listener for cross-tab synchronization fallback
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._storageListener = (e) => {
        if (e.key === LOCAL_STORAGE_REGISTRY_KEY) {
          if (e.newValue) {
            try {
              const parsed = JSON.parse(e.newValue);
              for (const desc of Object.values(parsed)) {
                if (desc && desc.roomCode) {
                  for (const cb of this.listeners) {
                    cb(DISCOVERY_ACTIONS.ROOM_ADVERTISE, desc);
                  }
                }
              }
            } catch (err) {}
          } else {
            // Cleared storage
            for (const cb of this.listeners) {
              cb(DISCOVERY_ACTIONS.ROOM_REMOVED, null);
            }
          }
        }
      };
      window.addEventListener('storage', this._storageListener);
    }
  }

  _post(data) {
    if (this.bc) {
      try {
        this.bc.postMessage(data);
      } catch (err) {
        console.warn('[DiscoveryBus] BC post error:', err);
      }
    }

    if (this.nc && typeof this.nc.publish === 'function' && typeof this.nc.stringCodec === 'function') {
      try {
        const sc = this.nc.stringCodec();
        this.nc.publish('triarch.lobby.global', sc.encode(JSON.stringify(data)));
      } catch (err) {}
    }
  }

  _handleMessage(data) {
    if (!data || typeof data !== 'object' || !data.type) return;

    // 1. Inbound query: If we are currently hosting/advertising rooms, immediately reply with ROOM_ADVERTISE
    if (data.type === DISCOVERY_ACTIONS.LOBBY_QUERY) {
      for (const descriptor of this._activeDescriptors.values()) {
        this._post({
          type: DISCOVERY_ACTIONS.ROOM_ADVERTISE,
          descriptor,
          t: Date.now()
        });
      }
      return;
    }

    // 2. Inbound advertisement
    if (data.type === DISCOVERY_ACTIONS.ROOM_ADVERTISE && data.descriptor) {
      this._saveToLocalStorage(data.descriptor);
      for (const cb of this.listeners) {
        cb(DISCOVERY_ACTIONS.ROOM_ADVERTISE, data.descriptor);
      }
      return;
    }

    // 3. Inbound room removed
    if (data.type === DISCOVERY_ACTIONS.ROOM_REMOVED && data.roomCode) {
      this._removeFromLocalStorage(data.roomCode);
      for (const cb of this.listeners) {
        cb(DISCOVERY_ACTIONS.ROOM_REMOVED, data.roomCode);
      }
      return;
    }
  }

  /**
   * Dispatches a LOBBY_QUERY to solicit instant advertisements from all active hosts.
   */
  queryLobby() {
    this._post({
      type: DISCOVERY_ACTIONS.LOBBY_QUERY,
      t: Date.now()
    });
  }

  /**
   * Starts periodic and on-demand advertisement for a hosted waiting room.
   * @param {Object} descriptor - RoomDescriptor
   */
  startAdvertising(descriptor) {
    if (!descriptor || !descriptor.roomCode) return;
    const code = descriptor.roomCode.toUpperCase();

    this._activeDescriptors.set(code, descriptor);
    this._saveToLocalStorage(descriptor);

    // Immediate announcement
    this._post({
      type: DISCOVERY_ACTIONS.ROOM_ADVERTISE,
      descriptor,
      t: Date.now()
    });

    // 3-second heartbeat broadcast
    if (this._advertiseTimers.has(code)) {
      clearInterval(this._advertiseTimers.get(code));
    }

    const timer = setInterval(() => {
      const live = this._activeDescriptors.get(code);
      if (live) {
        this._post({
          type: DISCOVERY_ACTIONS.ROOM_ADVERTISE,
          descriptor: live,
          t: Date.now()
        });
      }
    }, 3000);

    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }

    this._advertiseTimers.set(code, timer);
  }

  /**
   * Updates the in-memory descriptor being advertised.
   * @param {string} roomCode
   * @param {Object} updatedDescriptor
   */
  updateDescriptor(roomCode, updatedDescriptor) {
    const code = roomCode.toUpperCase();
    if (this._activeDescriptors.has(code)) {
      this._activeDescriptors.set(code, updatedDescriptor);
      this._saveToLocalStorage(updatedDescriptor);
      this._post({
        type: DISCOVERY_ACTIONS.ROOM_ADVERTISE,
        descriptor: updatedDescriptor,
        t: Date.now()
      });
    }
  }

  /**
   * Stops advertising a room and notifies peers of removal.
   * @param {string} roomCode
   */
  stopAdvertising(roomCode) {
    const code = roomCode.toUpperCase();

    if (this._advertiseTimers.has(code)) {
      clearInterval(this._advertiseTimers.get(code));
      this._advertiseTimers.delete(code);
    }

    this._activeDescriptors.delete(code);
    this._removeFromLocalStorage(code);

    this._post({
      type: DISCOVERY_ACTIONS.ROOM_REMOVED,
      roomCode: code,
      t: Date.now()
    });
  }

  onRoomUpdate(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _saveToLocalStorage(descriptor) {
    if (typeof localStorage === 'undefined' || !descriptor) return;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_REGISTRY_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[descriptor.roomCode] = descriptor;
      localStorage.setItem(LOCAL_STORAGE_REGISTRY_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  _removeFromLocalStorage(roomCode) {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_REGISTRY_KEY);
      if (raw) {
        const map = JSON.parse(raw);
        delete map[roomCode];
        localStorage.setItem(LOCAL_STORAGE_REGISTRY_KEY, JSON.stringify(map));
      }
    } catch (e) {}
  }

  destroy() {
    for (const timer of this._advertiseTimers.values()) {
      clearInterval(timer);
    }
    this._advertiseTimers.clear();
    this._activeDescriptors.clear();
    this.listeners.clear();

    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }
    if (typeof window !== 'undefined' && this._storageListener) {
      window.removeEventListener('storage', this._storageListener);
    }
  }
}

export const globalDiscoveryBus = new LobbyDiscoveryBus();
