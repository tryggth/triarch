/**
 * TRIARCH: Cyclic Edge - Network Transports Registry & Factory
 */

import { BaseTransport } from './base-transport.js';
import { BroadcastSignalingTransport } from './broadcast-transport.js';
import { NatsSignalingTransport } from './nats-transport.js';

export * from './base-transport.js';
export * from './broadcast-transport.js';
export * from './nats-transport.js';

export const TRANSPORT_TYPES = Object.freeze({
  BROADCAST: 'broadcast',
  NATS: 'nats'
});

/**
 * Transport Factory creating the appropriate network adapter.
 * @param {string} type - 'broadcast' | 'nats'
 * @param {string} roomCode
 * @param {string} peerId
 * @param {Object} [options={}]
 * @returns {BaseTransport}
 */
export function createTransport(type = TRANSPORT_TYPES.BROADCAST, roomCode, peerId, options = {}) {
  const normType = (type || '').toLowerCase();

  switch (normType) {
    case TRANSPORT_TYPES.NATS:
      return new NatsSignalingTransport(roomCode, peerId, options);

    case TRANSPORT_TYPES.BROADCAST:
    default:
      return new BroadcastSignalingTransport(roomCode, peerId, options);
  }
}
