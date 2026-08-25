/**
 * Automated Verification Suite - Cryptographic Commit-Reveal Protocol
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSalt,
  generateCommitment,
  verifyCommitment,
  createDraftCommitment,
  createDraftReveal
} from '../src/crypto/commit.js';

describe('WebCrypto Salt Generation', () => {
  test('Generates 64-character hexadecimal salt (32 bytes)', () => {
    const salt = generateSalt(32);
    assert.equal(typeof salt, 'string');
    assert.equal(salt.length, 64);
    assert.match(salt, /^[0-9a-f]{64}$/i);
  });

  test('Subsequent salts are distinct with high cryptographic entropy', () => {
    const salt1 = generateSalt(32);
    const salt2 = generateSalt(32);
    const salt3 = generateSalt(32);

    assert.notEqual(salt1, salt2);
    assert.notEqual(salt2, salt3);
    assert.notEqual(salt1, salt3);
  });
});

describe('SHA-256 Commitment Generation & Verification', () => {
  test('Generates deterministic 64-char SHA-256 digest', async () => {
    const dieId = 'ruby-a';
    const salt = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const hash1 = await generateCommitment(dieId, salt);
    const hash2 = await generateCommitment(dieId, salt);

    assert.equal(typeof hash1, 'string');
    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2, 'Identical die and salt must produce identical commitment');
  });

  test('Verifies valid commitment with correct die and salt', async () => {
    const dieId = 'cyan-b';
    const salt = generateSalt(32);
    const commitment = await generateCommitment(dieId, salt);

    const isValid = await verifyCommitment(commitment, dieId, salt);
    assert.equal(isValid, true, 'Valid die and salt must verify successfully');
  });

  test('Rejects tampered die selection (anti-snooping protection)', async () => {
    const honestDie = 'ruby-a';
    const tamperedDie = 'amber-c';
    const salt = generateSalt(32);

    const commitment = await generateCommitment(honestDie, salt);

    // Player attempts to reveal a different die with same salt
    const isValid = await verifyCommitment(commitment, tamperedDie, salt);
    assert.equal(isValid, false, 'Tampered die choice must fail verification');
  });

  test('Rejects altered salt or malformed inputs', async () => {
    const dieId = 'amber-c';
    const realSalt = generateSalt(32);
    const fakeSalt = generateSalt(32);

    const commitment = await generateCommitment(dieId, realSalt);

    const isFakeSaltValid = await verifyCommitment(commitment, dieId, fakeSalt);
    assert.equal(isFakeSaltValid, false, 'Mismatched salt must fail verification');

    const isNullValid = await verifyCommitment(commitment, null, realSalt);
    assert.equal(isNullValid, false);
  });
});

describe('Draft Commit-Reveal Action Helpers', () => {
  test('createDraftCommitment and createDraftReveal full round-trip', async () => {
    const seat = 'ruby';
    const dieId = 'ruby-a';

    const { action: commitAction, secret } = await createDraftCommitment(seat, dieId);

    assert.equal(commitAction.type, 'DRAFT_COMMIT');
    assert.equal(commitAction.seat, 'ruby');
    assert.equal(commitAction.commitment, secret.commitment);

    // Later in clash phase
    const revealAction = createDraftReveal(seat, secret.dieId, secret.salt);
    assert.equal(revealAction.type, 'DRAFT_REVEAL');
    assert.equal(revealAction.seat, 'ruby');
    assert.equal(revealAction.die, 'ruby-a');

    // Peer node verifies
    const verified = await verifyCommitment(commitAction.commitment, revealAction.die, revealAction.salt);
    assert.equal(verified, true, 'Peer verification of reveal must succeed');
  });
});
