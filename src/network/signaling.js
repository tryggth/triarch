/**
 * TRIARCH: Cyclic Edge - Zero-Backend Serverless Signaling Adapter
 * Coordinates WebRTC DataChannels / NATS WebSocket mesh with pluggable transport backends.
 */

import { createTransport, TRANSPORT_TYPES } from './transports/index.js';
import { loadNatsConfig } from './nats-config.js';

// Unique persistent peer ID generator (reconnects with same ID across refreshes)
export function generatePeerId() {
  if (typeof localStorage !== 'undefined') {
    try {
      const existing = localStorage.getItem('triarch_client_id');
      if (existing && typeof existing === 'string' && existing.trim()) {
        return existing.trim();
      }
      const newId = 'client_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem('triarch_client_id', newId);
      return newId;
    } catch (e) {
      // Fallback for private browsing or restricted environments
    }
  }
  return 'client_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
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
  const activeType = options.transportType || loadNatsConfig().activeTransport || TRANSPORT_TYPES.BROADCAST;
  return createTransport(activeType, roomCode, peerId, options);
}

export { TRANSPORT_TYPES };
