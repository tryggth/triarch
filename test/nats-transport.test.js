/**
 * Automated Verification Suite - Transport Abstraction & NATS WebSocket Adapter
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BaseTransport,
  BroadcastSignalingTransport,
  NatsSignalingTransport,
  createTransport,
  TRANSPORT_TYPES
} from '../src/network/transports/index.js';
import {
  createActionEnvelope,
  ACTION_TYPES
} from '../src/network/protocol.js';

describe('Transport Interface Compliance', () => {
  const roomCode = 'TR-9X';
  const peerId = 'peer_test_001';

  test('BroadcastSignalingTransport implements all BaseTransport methods', () => {
    const transport = new BroadcastSignalingTransport(roomCode, peerId);

    assert.ok(transport instanceof BaseTransport);
    assert.equal(typeof transport.broadcast, 'function');
    assert.equal(typeof transport.send, 'function');
    assert.equal(typeof transport.onPeerJoin, 'function');
    assert.equal(typeof transport.onPeerLeave, 'function');
    assert.equal(typeof transport.onMessage, 'function');
    assert.equal(typeof transport.getConnectedPeers, 'function');
    assert.equal(typeof transport.leave, 'function');

    transport.leave();
  });

  test('NatsSignalingTransport implements all BaseTransport methods', () => {
    const transport = new NatsSignalingTransport(roomCode, peerId);

    assert.ok(transport instanceof BaseTransport);
    assert.equal(typeof transport.broadcast, 'function');
    assert.equal(typeof transport.send, 'function');
    assert.equal(typeof transport.onPeerJoin, 'function');
    assert.equal(typeof transport.onPeerLeave, 'function');
    assert.equal(typeof transport.onMessage, 'function');
    assert.equal(typeof transport.getConnectedPeers, 'function');
    assert.equal(typeof transport.leave, 'function');

    transport.leave();
  });
});

describe('NATS Subject Namespace Construction', () => {
  const room = 'TR-7K';
  const peer = 'peer_archon_42';

  test('Generates standard subject hierarchy matching specification', () => {
    const broadcastSubj = NatsSignalingTransport.getBroadcastSubject(room);
    const peerSubj = NatsSignalingTransport.getPeerSubject(room, peer);
    const presenceSubj = NatsSignalingTransport.getPresenceSubject(room, peer);
    const wildcardSubj = NatsSignalingTransport.getPresenceWildcardSubject(room);

    assert.equal(broadcastSubj, 'triarch.rooms.TR-7K.broadcast');
    assert.equal(peerSubj, 'triarch.rooms.TR-7K.peer.peer_archon_42');
    assert.equal(presenceSubj, 'triarch.rooms.TR-7K.presence.peer_archon_42');
    assert.equal(wildcardSubj, 'triarch.rooms.TR-7K.presence.*');
  });

  test('Instance getters match static helpers', () => {
    const transport = new NatsSignalingTransport(room, peer);

    assert.equal(transport.broadcastSubject, 'triarch.rooms.TR-7K.broadcast');
    assert.equal(transport.peerSubject, 'triarch.rooms.TR-7K.peer.peer_archon_42');
    assert.equal(transport.presenceSubject, 'triarch.rooms.TR-7K.presence.peer_archon_42');
    assert.equal(transport.presenceWildcardSubject, 'triarch.rooms.TR-7K.presence.*');

    transport.leave();
  });
});

describe('Payload Codec & Serialization Integrity', () => {
  test('Action envelopes serialize and deserialize losslessly via NATS codec', () => {
    const transport = new NatsSignalingTransport('TR-TEST', 'peer_sender');
    transport._initCodec();

    const originalEnvelope = createActionEnvelope(ACTION_TYPES.DRAFT_COMMIT, 'ruby', {
      commitment: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    }, { peerId: 'peer_sender', round: 2 });

    const encoded = transport.jc.encode({ from: 'peer_sender', payload: originalEnvelope });
    assert.ok(encoded instanceof Uint8Array || typeof encoded === 'object');

    const decoded = transport.jc.decode(encoded);
    assert.equal(decoded.from, 'peer_sender');
    assert.deepEqual(decoded.payload, originalEnvelope);

    transport.leave();
  });
});

describe('Presence Tracking & Heartbeat Timeout', () => {
  test('Discovers newcomer peer and triggers onPeerJoin listener', () => {
    const transport = new NatsSignalingTransport('TR-9X', 'peer_local');
    const joinedPeers = [];

    transport.onPeerJoin((pId) => joinedPeers.push(pId));

    // Simulate incoming heartbeat from peer_remote_1
    transport.handlePresenceMessage({
      from: 'peer_remote_1',
      t: Date.now(),
      _sys: 'HEARTBEAT'
    });

    assert.equal(joinedPeers.length, 1);
    assert.equal(joinedPeers[0], 'peer_remote_1');
    assert.deepEqual(transport.getConnectedPeers(), ['peer_remote_1']);

    // Subsequent heartbeat from same peer does not duplicate join event
    transport.handlePresenceMessage({
      from: 'peer_remote_1',
      t: Date.now() + 100,
      _sys: 'HEARTBEAT'
    });
    assert.equal(joinedPeers.length, 1);

    transport.leave();
  });

  test('Graceful LEAVE event purges peer and triggers onPeerLeave', () => {
    const transport = new NatsSignalingTransport('TR-9X', 'peer_local');
    const leftPeers = [];

    transport.onPeerLeave((pId) => leftPeers.push(pId));

    // Join peer
    transport.handlePresenceMessage({ from: 'peer_remote_2', t: Date.now() });
    assert.equal(transport.getConnectedPeers().includes('peer_remote_2'), true);

    // Leave peer
    transport.handlePresenceMessage({ from: 'peer_remote_2', _sys: 'LEAVE', t: Date.now() });
    assert.equal(transport.getConnectedPeers().includes('peer_remote_2'), false);
    assert.equal(leftPeers.length, 1);
    assert.equal(leftPeers[0], 'peer_remote_2');

    transport.leave();
  });

  test('Inactive peer timeout purges stale peer after threshold', () => {
    const transport = new NatsSignalingTransport('TR-9X', 'peer_local');
    const leftPeers = [];
    transport.onPeerLeave((pId) => leftPeers.push(pId));

    // Add peer seen 8000ms ago
    transport.peerLastSeen.set('peer_stale_1', Date.now() - 8000);
    assert.equal(transport.getConnectedPeers().length, 1);

    // Run purge with 7000ms timeout threshold
    transport._purgeInactivePeers(7000);

    assert.equal(transport.getConnectedPeers().length, 0);
    assert.equal(leftPeers.length, 1);
    assert.equal(leftPeers[0], 'peer_stale_1');

    transport.leave();
  });
});

describe('Transport Factory Routing', () => {
  test('Factory instantiates requested transport type', () => {
    const bcTransport = createTransport(TRANSPORT_TYPES.BROADCAST, 'TR-11', 'peer_a');
    assert.ok(bcTransport instanceof BroadcastSignalingTransport);
    bcTransport.leave();

    const natsTransport = createTransport(TRANSPORT_TYPES.NATS, 'TR-22', 'peer_b');
    assert.ok(natsTransport instanceof NatsSignalingTransport);
    natsTransport.leave();

    // Default fallback
    const defaultTransport = createTransport(null, 'TR-33', 'peer_c');
    assert.ok(defaultTransport instanceof BroadcastSignalingTransport);
    defaultTransport.leave();
  });
});

describe('Synadia Cloud / NGS Credentials', () => {
  test('Exports valid JWT and NKEY seed format', async () => {
    const { NGS_USER_JWT, NGS_NKEY_SEED, NGS_RAW_CREDS, getNgscAuthenticator } = await import('../src/network/creds/ngs-creds.js');

    assert.ok(NGS_USER_JWT.startsWith('eyJ'));
    assert.ok(NGS_NKEY_SEED.startsWith('SU'));
    assert.ok(NGS_RAW_CREDS.includes('BEGIN NATS USER JWT'));
    assert.ok(NGS_RAW_CREDS.includes('BEGIN USER NKEY SEED'));

    // Mock nats module with credsAuthenticator
    let capturedBytes = null;
    const mockNatsWs = {
      credsAuthenticator: (bytes) => {
        capturedBytes = bytes;
        return { auth: true };
      }
    };

    const auth = getNgscAuthenticator(mockNatsWs);
    assert.ok(auth);
    assert.equal(auth.auth, true);
    assert.ok(capturedBytes instanceof Uint8Array);
  });
});

