/**
 * TRIARCH: Cyclic Edge - Network Protocol & Action Envelope Specification
 * Standardized message serialization, typed action schemas, envelope validation,
 * and state checksum calculation for 3-node P2P mesh synchronization.
 */

export const PROTOCOL_VERSION = 'triarch-p2p-v1.0';

export const ACTION_TYPES = Object.freeze({
  PEER_HELLO: 'PEER_HELLO',
  SEAT_CLAIM: 'SEAT_CLAIM',
  SEAT_STATE: 'SEAT_STATE',
  PING: 'PING',
  PONG: 'PONG',
  GAME_START: 'GAME_START',
  DRAFT_COMMIT: 'DRAFT_COMMIT',
  DRAFT_REVEAL: 'DRAFT_REVEAL',
  DRAFT_SELECT: 'DRAFT_SELECT',
  SHARD_USE: 'SHARD_USE',
  CLASH_ROLL: 'CLASH_ROLL',
  ROUND_RESOLVE: 'ROUND_RESOLVE',
  STATE_SYNC: 'STATE_SYNC',
  CHAT_MESSAGE: 'CHAT_MESSAGE'
});

export const SEATS = Object.freeze(['ruby', 'cyan', 'amber']);

/**
 * Creates a standardized network action envelope.
 * @param {string} type - ACTION_TYPES
 * @param {string|null} seat - 'ruby', 'cyan', 'amber', or null
 * @param {Object} payload - Action-specific payload data
 * @param {Object} [options={}] - Additional metadata (peerId, round, sig)
 * @returns {Object} Action Envelope
 */
export function createActionEnvelope(type, seat = null, payload = {}, options = {}) {
  if (!ACTION_TYPES[type]) {
    throw new Error(`Invalid action type: ${type}`);
  }
  if (seat && !SEATS.includes(seat)) {
    throw new Error(`Invalid seat: ${seat}. Must be one of: ${SEATS.join(', ')}`);
  }

  return {
    version: PROTOCOL_VERSION,
    type,
    seat,
    round: typeof options.round === 'number' ? options.round : 1,
    payload: payload || {},
    timestamp: options.timestamp || Date.now(),
    peerId: options.peerId || null,
    sig: options.sig || null
  };
}

/**
 * Validates the schema of an incoming action envelope.
 * @param {any} envelope
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateActionEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, error: 'Envelope must be a non-null object.' };
  }

  if (envelope.version !== PROTOCOL_VERSION) {
    return { valid: false, error: `Protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${envelope.version}` };
  }

  if (!envelope.type || !ACTION_TYPES[envelope.type]) {
    return { valid: false, error: `Unrecognized action type: ${envelope.type}` };
  }

  if (envelope.seat && !SEATS.includes(envelope.seat)) {
    return { valid: false, error: `Invalid seat in envelope: ${envelope.seat}` };
  }

  if (typeof envelope.timestamp !== 'number' || isNaN(envelope.timestamp)) {
    return { valid: false, error: 'Invalid or missing envelope timestamp.' };
  }

  if (!envelope.payload || typeof envelope.payload !== 'object') {
    return { valid: false, error: 'Payload must be an object.' };
  }

  // Type-specific payload validations
  switch (envelope.type) {
    case ACTION_TYPES.DRAFT_COMMIT:
      if (!envelope.payload.commitment || typeof envelope.payload.commitment !== 'string' || envelope.payload.commitment.length !== 64) {
        return { valid: false, error: 'DRAFT_COMMIT payload must include a 64-char hex commitment.' };
      }
      break;

    case ACTION_TYPES.DRAFT_REVEAL:
      if (!envelope.payload.die || typeof envelope.payload.die !== 'string') {
        return { valid: false, error: 'DRAFT_REVEAL payload must include die string.' };
      }
      if (!envelope.payload.salt || typeof envelope.payload.salt !== 'string' || envelope.payload.salt.length !== 64) {
        return { valid: false, error: 'DRAFT_REVEAL payload must include a 64-char hex salt.' };
      }
      break;

    case ACTION_TYPES.DRAFT_SELECT:
      if (!envelope.payload.dieId || typeof envelope.payload.dieId !== 'string') {
        return { valid: false, error: 'DRAFT_SELECT payload must include dieId string.' };
      }
      break;

    case ACTION_TYPES.SHARD_USE:
      if (!envelope.payload.shardId || typeof envelope.payload.shardId !== 'string') {
        return { valid: false, error: 'SHARD_USE payload must include shardId string.' };
      }
      break;

    case ACTION_TYPES.SEAT_CLAIM:
      if (!envelope.payload.peerId || typeof envelope.payload.peerId !== 'string') {
        return { valid: false, error: 'SEAT_CLAIM payload must include peerId.' };
      }
      break;
  }

  return { valid: true, error: null };
}

/**
 * Serializes an action envelope to JSON string.
 * @param {Object} envelope
 * @returns {string}
 */
export function serializeAction(envelope) {
  const validation = validateActionEnvelope(envelope);
  if (!validation.valid) {
    throw new Error(`Cannot serialize invalid action envelope: ${validation.error}`);
  }
  return JSON.stringify(envelope);
}

/**
 * Deserializes and validates a raw JSON string into an Action Envelope.
 * @param {string} rawString
 * @returns {Object} Deserialized envelope
 */
export function deserializeAction(rawString) {
  let parsed;
  try {
    parsed = JSON.parse(rawString);
  } catch (err) {
    throw new Error(`JSON parse error in action deserialization: ${err.message}`);
  }

  const validation = validateActionEnvelope(parsed);
  if (!validation.valid) {
    throw new Error(`Action validation error: ${validation.error}`);
  }

  return parsed;
}

/**
 * Computes a deterministic state checksum to detect desynchronization between peers.
 * Checksum incorporates round number, player scores, shards, and completed clash outcomes.
 * @param {import('../game/state.js').GameStateManager|Object} gameState
 * @returns {string} Short 16-character hex checksum
 */
export function computeStateChecksum(gameState) {
  const payload = {
    r: gameState.roundNumber,
    p: gameState.phase,
    scores: {
      ruby: gameState.players?.ruby?.score || 0,
      cyan: gameState.players?.cyan?.score || 0,
      amber: gameState.players?.amber?.score || 0
    },
    shards: {
      ruby: gameState.players?.ruby?.shards || 0,
      cyan: gameState.players?.cyan?.shards || 0,
      amber: gameState.players?.amber?.shards || 0
    },
    historyLen: (gameState.roundHistory || []).length
  };

  const str = JSON.stringify(payload);
  // Fast 32-bit FNV-1a hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  const hex1 = (hash >>> 0).toString(16).padStart(8, '0');
  // Second pass for 64-bit style 16-char checksum
  let hash2 = 0x9e3779b9;
  for (let i = str.length - 1; i >= 0; i--) {
    hash2 ^= str.charCodeAt(i);
    hash2 = Math.imul(hash2, 0x5bd1e995);
  }
  const hex2 = (hash2 >>> 0).toString(16).padStart(8, '0');

  return `${hex1}${hex2}`;
}
