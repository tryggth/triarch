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
});
