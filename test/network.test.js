/**
 * Automated Verification Suite - Network Protocol, Message Serialization & State Checksums
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_TYPES,
  PROTOCOL_VERSION,
  createActionEnvelope,
  validateActionEnvelope,
  serializeAction,
  deserializeAction,
  computeStateChecksum
} from '../src/network/protocol.js';
import { PeerMeshManager } from '../src/network/peer-mesh.js';
import { GameStateManager } from '../src/game/state.js';

describe('Network Protocol & Action Envelopes', () => {
  test('Creates valid action envelope with default parameters', () => {
    const env = createActionEnvelope(ACTION_TYPES.DRAFT_SELECT, 'ruby', { dieId: 'ruby-a' });

    assert.equal(env.version, PROTOCOL_VERSION);
    assert.equal(env.type, 'DRAFT_SELECT');
    assert.equal(env.seat, 'ruby');
    assert.equal(env.payload.dieId, 'ruby-a');
    assert.equal(typeof env.timestamp, 'number');
  });

  test('Validates compliant action envelopes', () => {
    const validCommit = createActionEnvelope(ACTION_TYPES.DRAFT_COMMIT, 'cyan', {
      commitment: 'a'.repeat(64)
    });
    const res1 = validateActionEnvelope(validCommit);
    assert.equal(res1.valid, true);
    assert.equal(res1.error, null);

    const validReveal = createActionEnvelope(ACTION_TYPES.DRAFT_REVEAL, 'amber', {
      die: 'amber-c',
      salt: 'b'.repeat(64)
    });
    const res2 = validateActionEnvelope(validReveal);
    assert.equal(res2.valid, true);
  });

  test('Rejects malformed or tampered action envelopes', () => {
    // Unknown action type
    assert.throws(() => createActionEnvelope('UNKNOWN_ACTION_TYPE'));

    // Invalid seat
    assert.throws(() => createActionEnvelope(ACTION_TYPES.DRAFT_SELECT, 'emerald'));

    // Invalid commitment length
    const badCommit = {
      version: PROTOCOL_VERSION,
      type: ACTION_TYPES.DRAFT_COMMIT,
      seat: 'ruby',
      round: 1,
      payload: { commitment: 'too_short' },
      timestamp: Date.now()
    };
    const resBad = validateActionEnvelope(badCommit);
    assert.equal(resBad.valid, false);
    assert.match(resBad.error, /64-char hex commitment/);
  });

  test('Round-trip serialization and deserialization preserves payload integrity', () => {
    const original = createActionEnvelope(ACTION_TYPES.SHARD_USE, 'ruby', {
      shardId: 'MIGHT'
    }, { peerId: 'peer_123', round: 3 });

    const jsonStr = serializeAction(original);
    const deserialized = deserializeAction(jsonStr);

    assert.deepEqual(deserialized, original);
  });
});

describe('State Checksum Generator', () => {
  test('Produces deterministic 16-char hex checksum for identical state', () => {
    const game1 = new GameStateManager();
    const game2 = new GameStateManager();

    const sum1 = computeStateChecksum(game1);
    const sum2 = computeStateChecksum(game2);

    assert.equal(typeof sum1, 'string');
    assert.equal(sum1.length, 16);
    assert.equal(sum1, sum2);
  });

  test('Detects state desynchronization (score or round change)', () => {
    const game = new GameStateManager();
    const baselineSum = computeStateChecksum(game);

    // Modify state
    game.players.ruby.score += 1;
    const modifiedSum = computeStateChecksum(game);

    assert.notEqual(baselineSum, modifiedSum, 'Checksum must change when game score differs');
  });
});

describe('Peer Mesh Seating Negotiation', () => {
  test('Host initializes with default AI seats and can toggle AI archetypes', () => {
    const mesh = new PeerMeshManager({ peerId: 'host_001', peerName: 'HostPlayer' });
    mesh.connect('TEST', true, 'HostPlayer');

    assert.equal(mesh.isHost, true);
    assert.equal(mesh.localSeat, 'G1');
    assert.equal(mesh.seats.G1.isAI, false);
    assert.equal(mesh.seats.G2.isAI, true);
    assert.equal(mesh.seats.G3.isAI, true);

    // Toggle G2 to human open seat
    mesh.setSeatAI('G2', false);
    assert.equal(mesh.seats.G2.isAI, false);

    // Toggle G3 to Tactician AI
    mesh.setSeatAI('G3', true, 'SHARD_TACTICIAN');
    assert.equal(mesh.seats.G3.isAI, true);
    assert.equal(mesh.seats.G3.aiType, 'SHARD_TACTICIAN');

    mesh.disconnect();
  });
});
