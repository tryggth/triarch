/**
 * TRIARCH: Cyclic Edge - BroadcastChannel Signaling Transport
 * Provides zero-configuration, instant local multi-tab and same-origin P2P transport.
 */

import { BaseTransport } from './base-transport.js';

export class BroadcastSignalingTransport extends BaseTransport {
  /**
   * @param {string} roomCode
   * @param {string} peerId
   * @param {Object} [options={}]
   */
  constructor(roomCode, peerId, options = {}) {
    super(roomCode, peerId, options);

    this.channelName = `triarch-mesh-${this.roomCode}`;
    this.peers = new Set();
    this._heartbeatTimer = null;

    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel(this.channelName);
      this.bc.onmessage = (event) => this._handleMessage(event.data);
    } else {
      this.bc = null;
    }

    this.connect();
  }

  connect() {
    this._announcePresence();
    if (!this._heartbeatTimer) {
      this._heartbeatTimer = setInterval(() => this._announcePresence(), 3000);
      if (this._heartbeatTimer && typeof this._heartbeatTimer.unref === 'function') {
        this._heartbeatTimer.unref();
      }
    }
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
        console.warn('[BroadcastTransport] Post error:', err);
      }
    }
  }

  _handleMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.from === this.peerId) return; // Ignore own echoes

    if (data._sys === 'HELLO') {
      if (!this.peers.has(data.from)) {
        this.peers.add(data.from);
        // Reply with welcome so newcomer discovers us
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
    if (data.payload !== undefined) {
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

  getConnectedPeers() {
    return Array.from(this.peers);
  }

  leave() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    this._post({ _sys: 'LEAVE', from: this.peerId });
    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }
    this.peers.clear();
    super.leave();
  }
}
