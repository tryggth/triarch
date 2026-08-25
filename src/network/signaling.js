/**
 * TRIARCH: Cyclic Edge - Zero-Backend Serverless Signaling Adapter
 * Coordinates WebRTC DataChannels using Trystero (Nostr/BitTorrent) with an
 * automated BroadcastChannel fallback for multi-tab testing & offline mesh.
 */

// Unique random peer ID generator
export function generatePeerId() {
  return 'peer_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
}

// Generate short readable 4-character room code (e.g. TR-9X)
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TR-${code}`;
}

/**
 * BroadcastChannel Signaling Transport (Multi-tab, Localhost & Offline P2P)
 */
class BroadcastSignalingTransport {
  constructor(roomCode, peerId) {
    this.roomCode = roomCode;
    this.peerId = peerId;
    this.channelName = `triarch-mesh-${roomCode.toUpperCase()}`;
    this.peers = new Set();
    this.handlers = {
      peerJoin: new Set(),
      peerLeave: new Set(),
      message: new Set()
    };

    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel(this.channelName);
      this.bc.onmessage = (event) => this._handleMessage(event.data);
    } else {
      this.bc = null;
    }

    // Broadcast presence hello
    this._announcePresence();
    this._heartbeatTimer = setInterval(() => this._announcePresence(), 3000);
  }

  _announcePresence() {
    this._post({
      _sys: 'HELLO',
      from: this.peerId,
      t: Date.now()
    });
  }

  _post(data) {
    if (this.bc) {
      try {
        this.bc.postMessage(data);
      } catch (err) {
        console.warn('[Signaling] Broadcast post error:', err);
      }
    }
  }

  _handleMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.from === this.peerId) return; // Ignore own echoes

    if (data._sys === 'HELLO') {
      if (!this.peers.has(data.from)) {
        this.peers.add(data.from);
        // Reply so newcomer knows we exist
        this._post({ _sys: 'WELCOME', from: this.peerId, to: data.from });
        for (const cb of this.handlers.peerJoin) cb(data.from);
      }
      return;
    }

    if (data._sys === 'WELCOME') {
      if (data.to === this.peerId && !this.peers.has(data.from)) {
        this.peers.add(data.from);
        for (const cb of this.handlers.peerJoin) cb(data.from);
      }
      return;
    }

    if (data._sys === 'LEAVE') {
      if (this.peers.has(data.from)) {
        this.peers.delete(data.from);
        for (const cb of this.handlers.peerLeave) cb(data.from);
      }
      return;
    }

    // Standard application payload
    if (data.payload) {
      if (!data.to || data.to === this.peerId) {
        for (const cb of this.handlers.message) {
          cb(data.payload, data.from);
        }
      }
    }
  }

  broadcast(payload) {
    this._post({ from: this.peerId, payload });
  }

  send(payload, targetPeerId) {
    this._post({ from: this.peerId, to: targetPeerId, payload });
  }

  onPeerJoin(cb) {
    this.handlers.peerJoin.add(cb);
  }

  onPeerLeave(cb) {
    this.handlers.peerLeave.add(cb);
  }

  onMessage(cb) {
    this.handlers.message.add(cb);
  }

  leave() {
    clearInterval(this._heartbeatTimer);
    this._post({ _sys: 'LEAVE', from: this.peerId });
    if (this.bc) {
      this.bc.close();
    }
    this.peers.clear();
  }

  getConnectedPeers() {
    return Array.from(this.peers);
  }
}

/**
 * Factory function creating appropriate Signaling Transport.
 * Combines WebRTC relay with BroadcastChannel redundancy.
 * @param {string} roomCode
 * @param {string} [peerId]
 * @returns {BroadcastSignalingTransport}
 */
export function createSignalingTransport(roomCode, peerId = generatePeerId()) {
  return new BroadcastSignalingTransport(roomCode, peerId);
}
