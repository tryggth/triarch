/**
 * TRIARCH: Cyclic Edge - Base Network Transport Interface
 * Defines the unified contract that all P2P / WebSocket signaling adapters must satisfy.
 */

export class BaseTransport {
  /**
   * @param {string} roomCode - The room identifier (e.g. 'TR-9X')
   * @param {string} peerId - The local peer unique ID
   * @param {Object} [options={}] - Additional transport-specific options
   */
  constructor(roomCode, peerId, options = {}) {
    if (!roomCode || typeof roomCode !== 'string') {
      throw new Error('BaseTransport requires a non-empty string roomCode.');
    }
    if (!peerId || typeof peerId !== 'string') {
      throw new Error('BaseTransport requires a non-empty string peerId.');
    }

    this.roomCode = roomCode.toUpperCase();
    this.peerId = peerId;
    this.options = options || {};

    this.handlers = {
      peerJoin: new Set(),
      peerLeave: new Set(),
      message: new Set()
    };
  }

  /**
   * Connects/initializes the underlying network medium.
   * @returns {Promise<void>|void}
   */
  connect() {
    // Override in subclass
  }

  /**
   * Broadcasts a payload to all peers connected to the room.
   * @param {any} payload
   */
  broadcast(payload) {
    throw new Error('broadcast() must be implemented by subclass.');
  }

  /**
   * Sends a unicast payload directly to a specific target peer.
   * @param {any} payload
   * @param {string} targetPeerId
   */
  send(payload, targetPeerId) {
    throw new Error('send() must be implemented by subclass.');
  }

  /**
   * Registers a listener for newcomer peer discovery.
   * @param {function(string): void} callback - (peerId) => void
   */
  onPeerJoin(callback) {
    if (typeof callback === 'function') {
      this.handlers.peerJoin.add(callback);
    }
  }

  /**
   * Registers a listener for peer departure or disconnection.
   * @param {function(string): void} callback - (peerId) => void
   */
  onPeerLeave(callback) {
    if (typeof callback === 'function') {
      this.handlers.peerLeave.add(callback);
    }
  }

  /**
   * Registers a listener for incoming messages.
   * @param {function(any, string): void} callback - (payload, fromPeerId) => void
   */
  onMessage(callback) {
    if (typeof callback === 'function') {
      this.handlers.message.add(callback);
    }
  }

  /**
   * Returns a list of currently active and verified peer IDs in the room.
   * @returns {string[]}
   */
  getConnectedPeers() {
    throw new Error('getConnectedPeers() must be implemented by subclass.');
  }

  /**
   * Gracefully leaves the room, cancels timers, and closes subscriptions.
   */
  leave() {
    this.handlers.peerJoin.clear();
    this.handlers.peerLeave.clear();
    this.handlers.message.clear();
  }
}
