/**
 * Automated Verification Suite - Streamlined Go-First Lobby & Matchmaking (100% In-Memory)
 * STRICT QUOTA GUARD: Zero outbound network requests during test execution.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { KvRoomRegistry } from '../src/network/kv-room-registry.js';
import { GO_FIRST_DICE } from '../src/math/dice.js';
import { GO_FIRST_TO_FACTION, FACTION_TO_GO_FIRST } from '../src/network/protocol.js';

function createMockKvStore() {
  const store = new Map();
  return {
    store,
    async put(key, val) {
      store.set(key, { key, value: val, revision: store.size + 1 });
      return store.size;
    },
    async get(key) {
      return store.get(key) || null;
    },
    async delete(key) {
      store.delete(key);
    },
    async *keys() {
      for (const k of store.keys()) yield k;
    }
  };
}

describe('Go-First Fair Initiative Dice Specifications', () => {
  test('All three Go-First dice have identical sum of 57 and unique faces 1..18', () => {
    const g1 = GO_FIRST_DICE.G1;
    const g2 = GO_FIRST_DICE.G2;
    const g3 = GO_FIRST_DICE.G3;

    assert.deepEqual(g1.faces, [1, 5, 10, 11, 13, 17]);
    assert.deepEqual(g2.faces, [3, 4, 7, 12, 15, 16]);
    assert.deepEqual(g3.faces, [2, 6, 8, 9, 14, 18]);

    const sum1 = g1.faces.reduce((a, b) => a + b, 0);
    const sum2 = g2.faces.reduce((a, b) => a + b, 0);
    const sum3 = g3.faces.reduce((a, b) => a + b, 0);

    assert.equal(sum1, 57);
    assert.equal(sum2, 57);
    assert.equal(sum3, 57);

    // Check all numbers 1 through 18 are present exactly once
    const allFaces = [...g1.faces, ...g2.faces, ...g3.faces].sort((a, b) => a - b);
    const expected = Array.from({ length: 18 }, (_, i) => i + 1);
    assert.deepEqual(allFaces, expected, 'Faces must be a strict partition of 1..18 (Zero Ties Possible)');
  });

  test('Go-First to faction mappings match tournament rules', () => {
    assert.equal(GO_FIRST_TO_FACTION.G1, 'ruby');
    assert.equal(GO_FIRST_TO_FACTION.G2, 'cyan');
    assert.equal(GO_FIRST_TO_FACTION.G3, 'amber');

    assert.equal(FACTION_TO_GO_FIRST.ruby, 'G1');
    assert.equal(FACTION_TO_GO_FIRST.cyan, 'G2');
    assert.equal(FACTION_TO_GO_FIRST.amber, 'G3');
  });
});

describe('Die-Driven Matchmaking & Room Registry', () => {
  test('Creates room with designated Go-First die and WAITING status', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    const room = await registry.createRoom('TR-GO1', 'peer_alice', {
      gameName: 'Apex Arena',
      hostDie: 'G1',
      hostName: 'Alice'
    });

    assert.equal(room.roomCode, 'TR-GO1');
    assert.equal(room.gameName, 'Apex Arena');
    assert.equal(room.status, 'WAITING');
    assert.equal(room.playerCount, 1);
    assert.equal(room.isFull, false);

    assert.equal(room.seats.G1.claimed, true);
    assert.equal(room.seats.G1.name, 'Alice');
    assert.equal(room.seats.G2.claimed, false);
    assert.equal(room.seats.G3.claimed, false);
  });

  test('Die Claim Validation: Rejects duplicate claims for already taken die', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    await registry.createRoom('TR-DUP', 'peer_host', {
      hostDie: 'G1',
      hostName: 'HostPlayer'
    });

    // 2nd player attempts to claim G1 (already taken by host)
    await assert.rejects(async () => {
      await registry.claimSeat('TR-DUP', 'G1', 'peer_intruder', 'Intruder');
    }, /already claimed/);

    // 2nd player claims G2 (open)
    const updated = await registry.claimSeat('TR-DUP', 'G2', 'peer_bob', 'Bob');
    assert.equal(updated.playerCount, 2);
    assert.equal(updated.seats.G2.claimed, true);
    assert.equal(updated.seats.G2.name, 'Bob');
    assert.equal(updated.status, 'WAITING');
    assert.equal(updated.isFull, false);
  });

  test('Auto-Start Transition: 3rd player claiming last die activates room', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    await registry.createRoom('TR-FULL', 'peer_host', { hostDie: 'G1', hostName: 'Host' });
    await registry.claimSeat('TR-FULL', 'G2', 'peer_two', 'Player 2');

    // 3rd player claims G3
    const fullRoom = await registry.claimSeat('TR-FULL', 'G3', 'peer_three', 'Player 3');

    assert.equal(fullRoom.playerCount, 3);
    assert.equal(fullRoom.isFull, true);
    assert.equal(fullRoom.status, 'ACTIVE');
    assert.equal(fullRoom.seats.G1.claimed, true);
    assert.equal(fullRoom.seats.G2.claimed, true);
    assert.equal(fullRoom.seats.G3.claimed, true);
  });

  test('Room Cleanup: Full/ACTIVE rooms are filtered out of public WAITING listing', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    // Open room (1 player)
    await registry.createRoom('TR-OPEN', 'peer_open', { hostDie: 'G1' });

    // Full room (3 players)
    await registry.createRoom('TR-BUSY', 'peer_b1', { hostDie: 'G1' });
    await registry.claimSeat('TR-BUSY', 'G2', 'peer_b2', 'B2');
    await registry.claimSeat('TR-BUSY', 'G3', 'peer_b3', 'B3');

    // Query waiting rooms only
    const waitingRooms = await registry.listActiveRooms({ onlyWaiting: true });
    const waitingCodes = waitingRooms.map(r => r.roomCode);

    assert.ok(waitingCodes.includes('TR-OPEN'));
    assert.ok(!waitingCodes.includes('TR-BUSY'), 'Full/ACTIVE rooms must not appear in waiting list');
  });

  test('Verification Workflow: Tab 1 creates G1, Tab 2 joins G2 (room stays WAITING 2/3), Tab 3 discovers & joins G3 (room launches 3/3)', async () => {
    const mockKv = createMockKvStore();

    // 1. Tab 1 (Host): Creates room with G1
    const hostRegistry = new KvRoomRegistry({ kvStore: mockKv });
    const room = await hostRegistry.createRoom('TR-VERIFY', 'peer_tab1', {
      gameName: 'Grand Championship',
      hostDie: 'G1',
      hostName: 'Player 1'
    });

    assert.equal(room.roomCode, 'TR-VERIFY');
    assert.equal(room.playerCount, 1);
    assert.equal(room.status, 'WAITING');
    assert.equal(room.isFull, false);
    assert.equal(room.seats.G1.claimed, true);
    assert.equal(room.seats.G2.claimed, false);
    assert.equal(room.seats.G3.claimed, false);

    // 2. Tab 2 (Joiner): Discovers room and claims G2
    const tab2Registry = new KvRoomRegistry({ kvStore: mockKv });
    const tab2Discovered = await tab2Registry.listActiveRooms({ onlyWaiting: true });
    assert.equal(tab2Discovered.length, 1);
    assert.equal(tab2Discovered[0].roomCode, 'TR-VERIFY');

    const roomAfterTab2 = await tab2Registry.claimSeat('TR-VERIFY', 'G2', 'peer_tab2', 'Player 2');
    assert.equal(roomAfterTab2.playerCount, 2);
    assert.equal(roomAfterTab2.status, 'WAITING', 'Must remain WAITING after 2nd player joins');
    assert.equal(roomAfterTab2.isFull, false, 'Must NOT be full after 2nd player joins');
    assert.equal(roomAfterTab2.seats.G1.claimed, true);
    assert.equal(roomAfterTab2.seats.G2.claimed, true);
    assert.equal(roomAfterTab2.seats.G3.claimed, false);

    // 3. Tab 3 (3rd Player): Discovers room with 2 players and claims G3
    const tab3Registry = new KvRoomRegistry({ kvStore: mockKv });
    const tab3Discovered = await tab3Registry.listActiveRooms({ onlyWaiting: true });
    assert.equal(tab3Discovered.length, 1, 'Tab 3 must discover room with 2 connected players');
    assert.equal(tab3Discovered[0].roomCode, 'TR-VERIFY');
    assert.equal(tab3Discovered[0].playerCount, 2);
    assert.equal(tab3Discovered[0].seats.G1.claimed, true);
    assert.equal(tab3Discovered[0].seats.G2.claimed, true);
    assert.equal(tab3Discovered[0].seats.G3.claimed, false);

    const roomAfterTab3 = await tab3Registry.claimSeat('TR-VERIFY', 'G3', 'peer_tab3', 'Player 3');
    assert.equal(roomAfterTab3.playerCount, 3);
    assert.equal(roomAfterTab3.status, 'ACTIVE', 'Transitions to ACTIVE only when 3rd player joins');
    assert.equal(roomAfterTab3.isFull, true);
    assert.equal(roomAfterTab3.seats.G1.claimed, true);
    assert.equal(roomAfterTab3.seats.G2.claimed, true);
    assert.equal(roomAfterTab3.seats.G3.claimed, true);

    // 4. Tab 4: Room is now active/full, no longer in waiting list
    const tab4Registry = new KvRoomRegistry({ kvStore: mockKv });
    const tab4Discovered = await tab4Registry.listActiveRooms({ onlyWaiting: true });
    assert.equal(tab4Discovered.length, 0, 'Full/active rooms removed from available waiting list');
  });

  test('Stale Room Pruning: Rooms with lastSeen older than 6 seconds are automatically pruned', async () => {
    const mockKv = createMockKvStore();
    const registry = new KvRoomRegistry({ kvStore: mockKv });

    // Active room (fresh lastSeen)
    const freshRoom = await registry.createRoom('TR-FRESH', 'peer_fresh', { hostDie: 'G1' });

    // Stale room (lastSeen 7 seconds ago)
    const staleDesc = registry.formatDescriptor({
      roomCode: 'TR-STALE',
      hostPeerId: 'peer_stale',
      status: 'WAITING',
      seats: { G1: { peerId: 'peer_stale', claimed: true } },
      lastSeen: Date.now() - 7000
    });
    registry.localFallbackRooms.set('TR-STALE', staleDesc);

    const activeRooms = await registry.listActiveRooms({ onlyWaiting: true, maxStaleMs: 6000 });
    const roomCodes = activeRooms.map(r => r.roomCode);

    assert.ok(roomCodes.includes('TR-FRESH'), 'Fresh room must be present');
    assert.ok(!roomCodes.includes('TR-STALE'), 'Stale room older than 6s must be pruned');
  });
});
