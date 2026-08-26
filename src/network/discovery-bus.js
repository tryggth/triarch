/**
 * TRIARCH: Cyclic Edge - Global Lobby Discovery Bus
 * Lightweight in-memory room discovery over BroadcastChannel ('triarch-lobby') and NATS ('triarch.lobby').
 * Zero localStorage dependency, 2-second host pulse, and instant query-response.
 */

export const LOBBY_GLOBAL_CHANNEL = 'triarch-lobby';
export const DISCOVERY_ACTIONS = Object.freeze({
  LOBBY_QUERY: 'LOBBY_QUERY',
  ROOM_ANNOUNCE: 'ROOM_ANNOUNCE',
  ROOM_CLOSED: 'ROOM_CLOSED'
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
        if (typeof this.bc.unref === 'function') {
          this.bc.unref();
        }
      } catch (e) {
        this.bc = null;
      }
    }

    // Host beforeunload guard: automatically announce room closure on window close/refresh
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._unloadListener = () => {
        for (const code of this._activeDescriptors.keys()) {
          this.stopAdvertising(code);
        }
      };
      window.addEventListener('beforeunload', this._unloadListener);
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
        this.nc.publish('triarch.lobby', sc.encode(JSON.stringify(data)));
      } catch (err) {}
    }
  }

  _handleMessage(data) {
    if (!data || typeof data !== 'object' || !data.type) return;

    // 1. Inbound query: Active hosts immediately respond with current descriptor
    if (data.type === DISCOVERY_ACTIONS.LOBBY_QUERY) {
      for (const descriptor of this._activeDescriptors.values()) {
        this._post({
          type: DISCOVERY_ACTIONS.ROOM_ANNOUNCE,
          descriptor: { ...descriptor, lastSeen: Date.now() },
          t: Date.now()
        });
      }
      return;
    }

    // 2. Inbound room announcement / pulse
    if (data.type === DISCOVERY_ACTIONS.ROOM_ANNOUNCE && data.descriptor) {
      const desc = { ...data.descriptor, lastSeen: Date.now() };
      for (const cb of this.listeners) {
        try { cb(DISCOVERY_ACTIONS.ROOM_ANNOUNCE, desc); } catch (e) {}
      }
      return;
    }

    // 3. Inbound room closed / cancelled
    if (data.type === DISCOVERY_ACTIONS.ROOM_CLOSED && data.roomCode) {
      for (const cb of this.listeners) {
        try { cb(DISCOVERY_ACTIONS.ROOM_CLOSED, data.roomCode); } catch (e) {}
      }
      return;
    }
  }

  /**
   * Dispatches a LOBBY_QUERY to solicit instant announcements from active hosts.
   */
  queryLobby() {
    this._post({
      type: DISCOVERY_ACTIONS.LOBBY_QUERY,
      t: Date.now()
    });
  }

  /**
   * Starts periodic 2-second heartbeat pulse for a hosted waiting room.
   * @param {Object} descriptor - RoomDescriptor
   */
  startAdvertising(descriptor) {
    if (!descriptor || !descriptor.roomCode) return;
    const code = descriptor.roomCode.toUpperCase();
    const liveDesc = { ...descriptor, lastSeen: Date.now() };

    this._activeDescriptors.set(code, liveDesc);

    // Immediate pulse
    this._post({
      type: DISCOVERY_ACTIONS.ROOM_ANNOUNCE,
      descriptor: liveDesc,
      t: Date.now()
    });

    // 2-second heartbeat pulse
    if (this._advertiseTimers.has(code)) {
      clearInterval(this._advertiseTimers.get(code));
    }

    const timer = setInterval(() => {
      const live = this._activeDescriptors.get(code);
      if (live) {
        live.lastSeen = Date.now();
        this._post({
          type: DISCOVERY_ACTIONS.ROOM_ANNOUNCE,
          descriptor: live,
          t: Date.now()
        });
      }
    }, 2000);

    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }

    this._advertiseTimers.set(code, timer);
  }

  /**
   * Updates the in-memory descriptor and immediately broadcasts an announcement.
   * @param {string} roomCode
   * @param {Object} updatedDescriptor
   */
  updateDescriptor(roomCode, updatedDescriptor) {
    const code = roomCode.toUpperCase();
    const liveDesc = { ...updatedDescriptor, lastSeen: Date.now() };

    if (this._activeDescriptors.has(code)) {
      this._activeDescriptors.set(code, liveDesc);
    }

    this._post({
      type: DISCOVERY_ACTIONS.ROOM_ANNOUNCE,
      descriptor: liveDesc,
      t: Date.now()
    });
  }

  /**
   * Stops advertising a room and broadcasts ROOM_CLOSED.
   * @param {string} roomCode
   */
  stopAdvertising(roomCode) {
    const code = roomCode.toUpperCase();

    if (this._advertiseTimers.has(code)) {
      clearInterval(this._advertiseTimers.get(code));
      this._advertiseTimers.delete(code);
    }

    this._activeDescriptors.delete(code);

    this._post({
      type: DISCOVERY_ACTIONS.ROOM_CLOSED,
      roomCode: code,
      t: Date.now()
    });
  }

  /**
   * Subscribes to room announcements and closures.
   * @param {(action: string, payload: any) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onRoomUpdate(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
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
    if (typeof window !== 'undefined' && this._unloadListener) {
      window.removeEventListener('beforeunload', this._unloadListener);
    }
  }
}

export const globalDiscoveryBus = new LobbyDiscoveryBus();
