/**
 * Automated Verification Suite - Refactored Architecture Verification (100% In-Memory)
 * Tests persistent identity, unified G1/G2/G3 schema, event emitter decoupling, and localStorage sync.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generatePeerId } from '../src/network/signaling.js';
import { KvRoomRegistry, LOCAL_STORAGE_ROOMS_KEY } from '../src/network/kv-room-registry.js';
import { GameStateManager } from '../src/game/state.js';
import { NetworkGameStateAdapter } from '../src/game/network-state.js';
import { PeerMeshManager } from '../src/network/peer-mesh.js';

// Setup in-memory mock for localStorage in Node environment
function setupMockLocalStorage() {
  const store = new Map();
  global.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
  return store;
}

describe('Persistent App Instance Identity', () => {
  test('generatePeerId returns consistent ID stored in localStorage across calls', () => {
    const store = setupMockLocalStorage();

    const id1 = generatePeerId();
    assert.ok(id1.startsWith('client_'));
    assert.equal(store.get('triarch_client_id'), id1);

    const id2 = generatePeerId();
    assert.equal(id2, id1, 'Subsequent generatePeerId calls must return the same stored client ID');
  });

  test('generatePeerId uses pre-existing client ID if already present in localStorage', () => {
    const store = setupMockLocalStorage();
    store.set('triarch_client_id', 'client_custom_alpha_123');

    const id = generatePeerId();
    assert.equal(id, 'client_custom_alpha_123');
  });
});

describe('Unified Single Seat Schema & formatDescriptor', () => {
  test('formatDescriptor creates room using strictly G1, G2, G3 keys without aliases', () => {
    const registry = new KvRoomRegistry();
    const descriptor = registry.formatDescriptor({
      roomCode: 'TR-TEST',
      seats: {
        G1: { peerId: 'peer_1', name: 'Alpha', claimed: true },
        G2: { peerId: 'peer_2', name: 'Beta', claimed: true },
        G3: { peerId: null, name: null, claimed: false }
      }
    });

    assert.equal(descriptor.roomCode, 'TR-TEST');
    assert.deepEqual(Object.keys(descriptor.seats).sort(), ['G1', 'G2', 'G3']);
    assert.equal(descriptor.seats.ruby, undefined, 'ruby alias must not be present');
    assert.equal(descriptor.seats.cyan, undefined, 'cyan alias must not be present');
    assert.equal(descriptor.seats.amber, undefined, 'amber alias must not be present');
    assert.equal(descriptor.playerCount, 2);
    assert.equal(descriptor.isFull, false);
    assert.equal(descriptor.status, 'WAITING');
  });
});

describe('MVC Separation: GameStateManager Event Emitter', () => {
  test('Registers, dispatches, and unregisters NOTIFICATION and PLAY_SFX events', () => {
    const game = new GameStateManager();

    const notifications = [];
    const sounds = [];

    const unsubNotif = game.on('NOTIFICATION', (payload) => {
      notifications.push(payload);
    });

    const unsubSfx = game.on('PLAY_SFX', (sfxName) => {
      sounds.push(sfxName);
    });

    game.emit('NOTIFICATION', { message: 'Test Alert', type: 'info' });
    game.emit('PLAY_SFX', 'clash');

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].message, 'Test Alert');
    assert.equal(sounds.length, 1);
    assert.equal(sounds[0], 'clash');

    // Unsubscribe
    unsubNotif();
    unsubSfx();

    game.emit('NOTIFICATION', { message: 'Ignored', type: 'warning' });
    game.emit('PLAY_SFX', 'dominance');

    assert.equal(notifications.length, 1, 'Unsubscribed listener must not receive further events');
    assert.equal(sounds.length, 1, 'Unsubscribed listener must not receive further events');
  });
});

describe('Cross-Tab LocalStorage Room Synchronization', () => {
  test('Local cross-tab sync writes to triarch_public_rooms_v1 and updates active listings', async () => {
    const store = setupMockLocalStorage();

    const registryA = new KvRoomRegistry();
    const registryB = new KvRoomRegistry();

    // Node A creates room
    const roomA = await registryA.createRoom('TR-SYNC', 'peer_alice', {
      gameName: 'Sync Arena',
      hostDie: 'G1',
      hostName: 'Alice'
    });

    assert.equal(roomA.roomCode, 'TR-SYNC');
    assert.ok(store.has(LOCAL_STORAGE_ROOMS_KEY));

    // Node B discovers room via localStorage
    const discoveredB = await registryB.listActiveRooms({ onlyWaiting: true });
    assert.equal(discoveredB.length, 1);
    assert.equal(discoveredB[0].roomCode, 'TR-SYNC');
    assert.equal(discoveredB[0].seats.G1.claimed, true);

    // Node A deletes room
    await registryA.deleteRoom('TR-SYNC');
    const waitingAfterDelete = await registryB.listActiveRooms({ onlyWaiting: true });
    assert.equal(waitingAfterDelete.length, 0, 'Deleted room must no longer be discoverable');
  });
});
