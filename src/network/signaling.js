/**
 * TRIARCH: Cyclic Edge - Zero-Backend Serverless Signaling Adapter
 * Coordinates WebRTC DataChannels / NATS WebSocket mesh with pluggable transport backends.
 */

import { createTransport, TRANSPORT_TYPES } from './transports/index.js';

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
 * Factory function creating the appropriate Signaling Transport.
 * Routes to selected transport: 'broadcast' (default zero-config) or 'nats' (Synadia Cloud).
 * @param {string} roomCode
 * @param {string} [peerId]
 * @param {Object} [options={}]
 * @returns {import('./transports/base-transport.js').BaseTransport}
 */
export function createSignalingTransport(roomCode, peerId = generatePeerId(), options = {}) {
  const transportType = options.transportType || TRANSPORT_TYPES.BROADCAST;
  return createTransport(transportType, roomCode, peerId, options);
}

export { TRANSPORT_TYPES };
