/**
 * TRIARCH: Cyclic Edge - Cryptographic Commit-Reveal Protocol
 * Implements a zero-knowledge commitment scheme using the native Web Crypto API (SHA-256).
 * Used for Stance Concealment (hidden die selection) during the Draft phase.
 */

// Cross-environment WebCrypto reference (Browser & Node.js 18+)
const cryptoSubtle = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
  ? globalThis.crypto.subtle
  : null;

/**
 * Generates a cryptographically secure random hexadecimal salt.
 * @param {number} [byteLength=32] - Number of random bytes (default 32 = 256 bits)
 * @returns {string} Hex-encoded salt string (64 characters)
 */
export function generateSalt(byteLength = 32) {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for pseudo-random environments
  let str = '';
  for (let i = 0; i < byteLength * 2; i++) {
    str += Math.floor(Math.random() * 16).toString(16);
  }
  return str;
}

/**
 * Converts a Uint8Array or ArrayBuffer to a lowercase hexadecimal string.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function bufferToHex(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Computes the SHA-256 commitment hash of a die selection and secret salt.
 * Commitment = SHA-256(dieId + ":" + salt)
 * @param {string} dieId - Identifier or name of the chosen die (e.g. 'ruby-a')
 * @param {string} salt - Secret 32-byte hex salt
 * @returns {Promise<string>} 64-character SHA-256 hex digest
 */
export async function generateCommitment(dieId, salt) {
  if (!dieId || typeof dieId !== 'string') {
    throw new Error('Invalid dieId for commitment generation.');
  }
  if (!salt || typeof salt !== 'string') {
    throw new Error('Invalid salt for commitment generation.');
  }

  const payload = `${dieId}:${salt}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);

  if (!cryptoSubtle) {
    throw new Error('WebCrypto subtle API is not available in this runtime.');
  }

  const hashBuffer = await cryptoSubtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

/**
 * Verifies that a revealed die selection and salt match a prior SHA-256 commitment.
 * @param {string} commitment - The original 64-character SHA-256 commitment hash
 * @param {string} dieId - The revealed die identifier
 * @param {string} salt - The revealed secret salt
 * @returns {Promise<boolean>} True if valid, false if tampered or mismatched
 */
export async function verifyCommitment(commitment, dieId, salt) {
  if (!commitment || !dieId || !salt) {
    return false;
  }
  try {
    const computedHash = await generateCommitment(dieId, salt);
    // Constant time comparison
    if (computedHash.length !== commitment.length) return false;
    let result = 0;
    for (let i = 0; i < computedHash.length; i++) {
      result |= computedHash.charCodeAt(i) ^ commitment.charCodeAt(i);
    }
    return result === 0;
  } catch (err) {
    console.warn('[Commitment] Verification failed with error:', err);
    return false;
  }
}

/**
 * Helper to construct a complete DRAFT_COMMIT action envelope.
 * @param {string} seat - Player seat ('ruby', 'cyan', 'amber')
 * @param {string} dieId - Chosen die ID
 * @returns {Promise<{ action: Object, secret: { dieId: string, salt: string, commitment: string } }>}
 */
export async function createDraftCommitment(seat, dieId) {
  const salt = generateSalt(32);
  const commitment = await generateCommitment(dieId, salt);

  return {
    action: {
      type: 'DRAFT_COMMIT',
      seat,
      commitment,
      timestamp: Date.now()
    },
    secret: {
      seat,
      dieId,
      salt,
      commitment
    }
  };
}

/**
 * Helper to construct a complete DRAFT_REVEAL action envelope.
 * @param {string} seat - Player seat
 * @param {string} dieId - Revealed die ID
 * @param {string} salt - Secret salt used in commit phase
 * @returns {{ type: string, seat: string, die: string, salt: string, timestamp: number }}
 */
export function createDraftReveal(seat, dieId, salt) {
  return {
    type: 'DRAFT_REVEAL',
    seat,
    die: dieId,
    salt,
    timestamp: Date.now()
  };
}
