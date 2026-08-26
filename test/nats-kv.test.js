/**
 * Automated Verification Suite - JetStream KV Room Registry (100% In-Memory Mocked)
 * STRICT QUOTA GUARD: Zero outbound network requests during test execution.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KvRoomRegistry,
  KV_BUCKET_NAME,
  KV_ROOM_TTL_SECONDS,
  KV_MAX_VALUE_SIZE
} from '../src/network/kv-room-registry.js';

/**
 * Creates a Map-backed in-memory mock of the NATS JetStream KV store.
 */
function createMockKvStore() {
  const store = new Map();
  let putCount = 0;
  let deleteCount = 0;

  return {
    get putCount() { return putCount; },
    get deleteCount() { return deleteCount; },
    store,

    async put(key, val) {
      putCount++;
      store.set(key, { key, value: val, revision: putCount });
      return putCount;
    },

    async get(key) {
      return store.get(key) || null;
    },

    async delete(key) {
      deleteCount++;
      store.delete(key);
    },

    async *keys() {
      for (const k of store.keys()) {
        yield k;
      }
    }
  };
}

describe('In-Memory JetStream KV Room Registry CRUD', () => {
  test('Creates and retrieves room descriptor with schema validation', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    const roomCode = 'TR-9X';
    const hostPeer = 'peer_host_alpha';
    const initialData = {
      round: 1,
      phase: 'DEPLOY',
      seats: {
        ruby: { name: 'HostArchon', isAI: false, peerId: hostPeer },
        cyan: { name: 'Open (Bot)', isAI: true },
        amber: { name: 'Open (Bot)', isAI: true }
      }
    };

    const created = await registry.createRoom(roomCode, hostPeer, initialData);

    assert.equal(created.roomCode, 'TR-9X');
    assert.equal(created.hostPeerId, hostPeer);
    assert.equal(created.round, 1);
    assert.equal(created.phase, 'DEPLOY');
    assert.equal(created.playerCount, 1);
    assert.equal(created.isFull, false);
    assert.equal(mockKv.putCount, 1);

    // Retrieve via getRoom
    const fetched = await registry.getRoom(roomCode);
    assert.ok(fetched);
    assert.equal(fetched.roomCode, 'TR-9X');
    assert.equal(fetched.hostPeerId, hostPeer);
    assert.equal(fetched.seats.ruby.name, 'HostArchon');
  });

  test('Deletes room descriptor immediately upon leave/teardown', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    await registry.createRoom('TR-DEL', 'peer_del');
    assert.ok(await registry.getRoom('TR-DEL'));

    await registry.deleteRoom('TR-DEL');
    assert.equal(await registry.getRoom('TR-DEL'), null);
    assert.equal(mockKv.deleteCount, 1);
  });
});

describe('Payload Schema & Compact Size Validation', () => {
  test('Generated room descriptor is compact (< 2 KB) and conforms to specification', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    const descriptor = await registry.createRoom('TR-SZ8', 'peer_test', {
      seats: {
        ruby: { name: 'Ruby Champion', isAI: false, peerId: 'peer_1' },
        cyan: { name: 'Cyan Striker', isAI: false, peerId: 'peer_2' },
        amber: { name: 'Amber Tactician', isAI: false, peerId: 'peer_3' }
      }
    });

    const jsonString = JSON.stringify(descriptor);
    const byteLength = Buffer.byteLength(jsonString, 'utf8');

    // Strict free-tier quota guard: payload must be compact (< 2048 bytes)
    assert.ok(byteLength < 2048, `Payload size ${byteLength} exceeds 2048B limit`);
    assert.ok(byteLength < KV_MAX_VALUE_SIZE);

    assert.equal(descriptor.playerCount, 3);
    assert.equal(descriptor.isFull, true);
    assert.ok(descriptor.createdAt > 0);
    assert.ok(descriptor.updatedAt > 0);
  });
});

describe('Write Debouncing Logic (Quota Guardrail)', () => {
  test('Collapses rapid state mutations into a single debounced write', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    await registry.createRoom('TR-DEB', 'peer_host');
    const initialPuts = mockKv.putCount; // 1

    // Fire 5 rapid updates in quick succession
    registry.updateRoomDebounced('TR-DEB', { round: 2 });
    registry.updateRoomDebounced('TR-DEB', { round: 3 });
    registry.updateRoomDebounced('TR-DEB', { round: 4 });
    registry.updateRoomDebounced('TR-DEB', { round: 5 });
    registry.updateRoomDebounced('TR-DEB', { phase: 'RESOLUTION' });

    // Puts should not have increased yet because timer is debounced
    assert.equal(mockKv.putCount, initialPuts);

    // Explicitly flush pending update
    await registry._flushRoomUpdate('TR-DEB', { round: 5, phase: 'RESOLUTION' });
    assert.equal(mockKv.putCount, initialPuts + 1);

    const room = await registry.getRoom('TR-DEB');
    assert.equal(room.round, 5);
    assert.equal(room.phase, 'RESOLUTION');
  });
});

describe('TTL & Stale Record Filtering', () => {
  test('Omits expired rooms older than TTL (3600s) from public discovery listings', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    // 1. Fresh room
    await registry.createRoom('TR-FRESH', 'peer_fresh');

    // 2. Stale room (created 2 hours ago)
    const twoHoursAgo = Date.now() - (7200 * 1000);
    const staleDesc = registry.formatDescriptor({
      roomCode: 'TR-STALE',
      hostPeerId: 'peer_old',
      createdAt: twoHoursAgo
    });
    staleDesc.updatedAt = twoHoursAgo;

    registry.localFallbackRooms.set(KvRoomRegistry.getRoomKey('TR-STALE'), staleDesc);

    const activeRooms = await registry.listActiveRooms();
    const activeCodes = activeRooms.map(r => r.roomCode);

    assert.ok(activeCodes.includes('TR-FRESH'));
    assert.ok(!activeCodes.includes('TR-STALE'), 'Expired room should be filtered out');
  });
});
