/**
 * TRIARCH: Cyclic Edge - NATS WebSocket Transport Adapter (Synadia Cloud / NATS.ws)
 * Implements high-performance cloud pub/sub signaling across the NATS namespace:
 *  - Broadcast: triarch.rooms.<ROOM_CODE>.broadcast
 *  - Unicast:   triarch.rooms.<ROOM_CODE>.peer.<TARGET_PEER_ID>
 *  - Presence:  triarch.rooms.<ROOM_CODE>.presence.<PEER_ID>
 */

import { BaseTransport } from './base-transport.js';

export const NATS_DEFAULT_SERVERS = [
  'wss://connect.ngs.global',
  'wss://demo.nats.io:8443'
];

export class NatsSignalingTransport extends BaseTransport {
  /**
   * @param {string} roomCode
   * @param {string} peerId
   * @param {Object} [options={}]
   */
  constructor(roomCode, peerId, options = {}) {
    super(roomCode, peerId, options);

    this.serverUrls = options.servers || (options.serverUrl ? [options.serverUrl] : NATS_DEFAULT_SERVERS);
    this.nc = null; // NATS connection instance
    this.jc = null; // JSON codec
    this.subscriptions = [];
    this.peerLastSeen = new Map(); // peerId -> timestamp

    this._heartbeatTimer = null;
    this._gcTimer = null;
    this.isConnected = false;

    // Direct injection of connection for unit testing / mock environments
    if (options.natsClient) {
      this.nc = options.natsClient;
      this._initCodec();
      this._initSubscriptions();
      this._startHeartbeat();
    }
  }

  /* ---------------- Subject Namespace Mapping Helpers ---------------- */

  static getBroadcastSubject(roomCode) {
    return `triarch.rooms.${roomCode.toUpperCase()}.broadcast`;
  }

  static getPeerSubject(roomCode, peerId) {
    return `triarch.rooms.${roomCode.toUpperCase()}.peer.${peerId}`;
  }

  static getPresenceSubject(roomCode, peerId) {
    return `triarch.rooms.${roomCode.toUpperCase()}.presence.${peerId}`;
  }

  static getPresenceWildcardSubject(roomCode) {
    return `triarch.rooms.${roomCode.toUpperCase()}.presence.*`;
  }

  get broadcastSubject() {
    return NatsSignalingTransport.getBroadcastSubject(this.roomCode);
  }

  get peerSubject() {
    return NatsSignalingTransport.getPeerSubject(this.roomCode, this.peerId);
  }

  get presenceSubject() {
    return NatsSignalingTransport.getPresenceSubject(this.roomCode, this.peerId);
  }

  get presenceWildcardSubject() {
    return NatsSignalingTransport.getPresenceWildcardSubject(this.roomCode);
  }

  /* ---------------- Connection & Codec Setup ---------------- */

  _initCodec(natsWsModule = null) {
    if (natsWsModule && natsWsModule.JSONCodec) {
      this.jc = natsWsModule.JSONCodec();
    } else {
      // Robust pure JS JSON codec fallback
      const te = new TextEncoder();
      const td = new TextDecoder();
      this.jc = {
        encode: (d) => te.encode(JSON.stringify(d)),
        decode: (b) => JSON.parse(td.decode(b))
      };
    }
  }

  /**
   * Initializes WebSocket connection to NATS / Synadia Cloud.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.nc || this.isConnected) return;

    try {
      // Dynamic import of nats.ws via CDN
      const natsWs = await import('https://esm.sh/nats.ws@1.30.2');
      this._initCodec(natsWs);

      const connectOpts = {
        servers: this.serverUrls,
        name: `triarch_${this.peerId}`,
        timeout: this.options.timeout || 10000,
        ...this.options.connectionOptions
      };

      if (this.options.user && this.options.pass) {
        connectOpts.user = this.options.user;
        connectOpts.pass = this.options.pass;
      }
      if (this.options.token) {
        connectOpts.token = this.options.token;
      }
      if (this.options.authenticator) {
        connectOpts.authenticator = this.options.authenticator;
      }

      this.nc = await natsWs.connect(connectOpts);
      this.isConnected = true;

      await this._initSubscriptions();
      this._startHeartbeat();

      console.log(`[NATS Transport] Connected to ${this.nc.getServer()} for room ${this.roomCode}`);
    } catch (err) {
      console.warn('[NATS Transport] Connection failed, falling back:', err);
      this.isConnected = false;
      throw err;
    }
  }

  /* ---------------- Subscriptions & Heartbeat Tracking ---------------- */

  async _initSubscriptions() {
    if (!this.nc) return;

    // 1. Subscribe to Broadcast Channel
    const subBroadcast = this.nc.subscribe(this.broadcastSubject);
    this.subscriptions.push(subBroadcast);
    this._consumeMessages(subBroadcast);

    // 2. Subscribe to Direct Unicast Peer Channel
    const subPeer = this.nc.subscribe(this.peerSubject);
    this.subscriptions.push(subPeer);
    this._consumeMessages(subPeer);

    // 3. Subscribe to Presence Wildcard
    const subPresence = this.nc.subscribe(this.presenceWildcardSubject);
    this.subscriptions.push(subPresence);
    this._consumePresence(subPresence);
  }

  async _consumeMessages(subscription) {
    try {
      for await (const msg of subscription) {
        try {
          const data = this.jc.decode(msg.data);
          if (data && data.from && data.from !== this.peerId) {
            if (data.payload !== undefined) {
              for (const cb of this.handlers.message) {
                cb(data.payload, data.from);
              }
            }
          }
        } catch (decodeErr) {
          console.warn('[NATS Transport] Error decoding payload:', decodeErr);
        }
      }
    } catch (err) {
      // Subscription closed or drained
    }
  }

  async _consumePresence(subscription) {
    try {
      for await (const msg of subscription) {
        try {
          const data = this.jc.decode(msg.data);
          this.handlePresenceMessage(data);
        } catch (err) {
          console.warn('[NATS Transport] Error in presence decode:', err);
        }
      }
    } catch (err) {
      // Subscription closed
    }
  }

  /**
   * Handles incoming presence and heartbeat packets.
   * @param {Object} data
   */
  handlePresenceMessage(data) {
    if (!data || !data.from || data.from === this.peerId) return;

    const fromPeerId = data.from;

    if (data._sys === 'LEAVE') {
      if (this.peerLastSeen.has(fromPeerId)) {
        this.peerLastSeen.delete(fromPeerId);
        for (const cb of this.handlers.peerLeave) cb(fromPeerId);
      }
      return;
    }

    // Heartbeat or Hello
    const isNewPeer = !this.peerLastSeen.has(fromPeerId);
    this.peerLastSeen.set(fromPeerId, Date.now());

    if (isNewPeer) {
      for (const cb of this.handlers.peerJoin) cb(fromPeerId);
      // Send presence announcement immediately in response
      this._publishPresence();
    }
  }

  _startHeartbeat() {
    this._publishPresence();

    if (!this._heartbeatTimer) {
      this._heartbeatTimer = setInterval(() => this._publishPresence(), 3000);
    }

    if (!this._gcTimer) {
      // Check for peer timeouts every 2 seconds
      this._gcTimer = setInterval(() => this._purgeInactivePeers(), 2000);
    }
  }

  _publishPresence(sysAction = null) {
    if (!this.nc || !this.jc) return;
    try {
      const data = {
        from: this.peerId,
        t: Date.now(),
        _sys: sysAction || 'HEARTBEAT'
      };
      this.nc.publish(this.presenceSubject, this.jc.encode(data));
    } catch (err) {
      console.warn('[NATS Transport] Error publishing presence:', err);
    }
  }

  _purgeInactivePeers(timeoutMs = 7000) {
    const now = Date.now();
    for (const [peerId, lastSeen] of this.peerLastSeen.entries()) {
      if (now - lastSeen > timeoutMs) {
        this.peerLastSeen.delete(peerId);
        for (const cb of this.handlers.peerLeave) cb(peerId);
      }
    }
  }

  /* ---------------- Public Transport Operations ---------------- */

  broadcast(payload) {
    if (!this.nc || !this.jc) return;
    const packet = { from: this.peerId, payload };
    this.nc.publish(this.broadcastSubject, this.jc.encode(packet));
  }

  send(payload, targetPeerId) {
    if (!this.nc || !this.jc || !targetPeerId) return;
    const targetSubject = NatsSignalingTransport.getPeerSubject(this.roomCode, targetPeerId);
    const packet = { from: this.peerId, to: targetPeerId, payload };
    this.nc.publish(targetSubject, this.jc.encode(packet));
  }

  getConnectedPeers() {
    return Array.from(this.peerLastSeen.keys());
  }

  async leave() {
    // Send graceful leave announcement
    this._publishPresence('LEAVE');

    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._gcTimer) {
      clearInterval(this._gcTimer);
      this._gcTimer = null;
    }

    if (this.nc) {
      try {
        for (const sub of this.subscriptions) {
          sub.unsubscribe();
        }
        if (typeof this.nc.drain === 'function') {
          await this.nc.drain();
        } else if (typeof this.nc.close === 'function') {
          await this.nc.close();
        }
      } catch (err) {
        console.warn('[NATS Transport] Error during leave cleanup:', err);
      }
      this.nc = null;
    }

    this.subscriptions = [];
    this.peerLastSeen.clear();
    this.isConnected = false;
    super.leave();
  }
}
