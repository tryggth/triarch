/**
 * Automated Verification Suite - Peer Failover, Telemetry Export & Haptics (100% In-Memory)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateManager } from '../src/game/state.js';
import { NetworkGameStateAdapter } from '../src/game/network-state.js';
import { PeerMeshManager } from '../src/network/peer-mesh.js';
import { haptics } from '../src/audio/haptics.js';
import { TRIARCH_STANDARD } from '../src/math/dice.js';

describe('Peer Disconnect Fallback & Autonomous Bot Takeover', () => {
  test('Seamlessly converts dropped player seat to AI Bot without resetting scores', () => {
    const game = new GameStateManager();
    const mesh = new PeerMeshManager();
    const net = new NetworkGameStateAdapter(game, mesh);

    // Setup 3-player match with a remote peer in Cyan seat
    mesh.isHost = true;
    mesh.localSeat = 'ruby';
    mesh.seats.cyan = {
      peerId: 'peer_remote_cyan',
      name: 'CyanPlayer',
      isAI: false,
      aiType: null,
      ready: true
    };
    game.players.cyan.isAI = false;
    game.players.cyan.score = 3;
    game.players.cyan.shards = 4;

    // Simulate peer disconnect
    net.handlePeerDisconnect('peer_remote_cyan');

    // Asserts
    assert.equal(mesh.seats.cyan.isAI, true);
    assert.equal(mesh.seats.cyan.peerId, null);
    assert.ok(mesh.seats.cyan.aiType);
    assert.equal(game.players.cyan.isAI, true);
    assert.equal(game.players.cyan.score, 3, 'Player score must be preserved during failover');
    assert.equal(game.players.cyan.shards, 4, 'Player shards must be preserved during failover');
  });

  test('Auto-reveals unrevealed commitments on disconnect to prevent round deadlock', () => {
    const game = new GameStateManager();
    const mesh = new PeerMeshManager();
    const net = new NetworkGameStateAdapter(game, mesh);

    mesh.isHost = true;
    mesh.seats.amber = {
      peerId: 'peer_amber_ghost',
      name: 'AmberGhost',
      isAI: false,
      ready: true
    };

    // Amber player created an unrevealed SHA-256 stance commitment
    net.peerCommitments.set('amber', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(net.peerReveals.has('amber'), false);

    // Amber peer disconnects before submitting salt/reveal
    net.handlePeerDisconnect('peer_amber_ghost');

    // Failover must resolve the reveal automatically using faction die
    assert.equal(net.peerReveals.has('amber'), true);
    const reveal = net.peerReveals.get('amber');
    assert.equal(reveal.verified, true);
    assert.ok(reveal.dieId);
    assert.equal(game.players.amber.isAI, true);
  });
});

describe('Match Telemetry Export Integrity', () => {
  test('Generates complete, structured telemetry report with checksums', () => {
    const game = new GameStateManager();

    // Play 2 rounds
    game.executeClash();
    game.nextRound();
    game.executeClash();

    const telemetry = game.exportTelemetry({
      roomCode: 'TR-7X',
      transportType: 'nats'
    });

    assert.equal(telemetry.game, 'TRIARCH: Cyclic Edge');
    assert.equal(telemetry.matchMetadata.roomCode, 'TR-7X');
    assert.equal(telemetry.matchMetadata.transportType, 'nats');
    assert.equal(telemetry.matchMetadata.totalRoundsPlayed, 2);
    assert.equal(telemetry.roundHistory.length, 2);
    assert.ok(telemetry.stateChecksum.startsWith('R2:'));
    assert.ok(telemetry.players.ruby.finalScore >= 0);
    assert.ok(telemetry.players.cyan.finalScore >= 0);
    assert.ok(telemetry.players.amber.finalScore >= 0);
  });
});

describe('Mobile Tactile Haptics Engine', () => {
  test('Executes vibration patterns safely with graceful fallback', () => {
    // Should safely no-op in test/Node environment without throwing
    haptics.light();
    haptics.roll();
    haptics.impact();
    haptics.victory();
    haptics.error();

    const initial = haptics.enabled;
    const toggled = haptics.toggle();
    assert.equal(toggled, !initial);

    // Restore
    haptics.toggle();
  });
});
