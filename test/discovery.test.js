/**
 * Automated Verification Suite - Global Lobby Discovery & Real-Time Synchronization (100% In-Memory)
 * STRICT QUOTA GUARD: Zero outbound network requests during test execution.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { KvRoomRegistry } from '../src/network/kv-room-registry.js';
import { LobbyDiscoveryBus, DISCOVERY_ACTIONS } from '../src/network/discovery-bus.js';

/**
 * Creates an in-memory mock broadcast bus that routes messages across simulating nodes.
 */
function createMockDiscoveryNetwork() {
  const nodes = new Set();

  return {
    createNodeBus() {
      const bus = new LobbyDiscoveryBus();
      nodes.add(bus);

      // Intercept bus._post to simulate local multi-tab BroadcastChannel
      bus._post = (data) => {
        for (const otherBus of nodes) {
          if (otherBus !== bus) {
            // Deliver asynchronously
            setImmediate(() => {
              otherBus._handleMessage(data);
            });
          }
        }
      };

      return bus;
    }
  };
}

describe('Global Lobby Discovery Bus & Cross-Tab Room Sync', () => {
  test('Multi-Tab Discovery: Node B discovers Node A room via LOBBY_QUERY handshake', async () => {
    const net = createMockDiscoveryNetwork();

    // Node A (Host)
    const busA = net.createNodeBus();
    const registryA = new KvRoomRegistry({ discoveryBus: busA });

    // Node B (Joining Player)
    const busB = net.createNodeBus();
    const registryB = new KvRoomRegistry({ discoveryBus: busB });

    // 1. Node A creates room TR-1A with Go-First die G1
    const roomA = await registryA.createRoom('TR-1A', 'peer_alice', {
      gameName: 'Grand Arena',
      hostDie: 'G1',
      hostName: 'Alice'
    });
    assert.equal(roomA.roomCode, 'TR-1A');

    // 2. Node B opens lobby and dispatches LOBBY_QUERY
    let nodeBUpdated = false;
    registryB.onRoomsUpdate(() => {
      nodeBUpdated = true;
    });

    registryB.broadcastLobbyQuery();

    // Wait for async message delivery loop
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(nodeBUpdated, true, 'Node B must receive room update event upon query response');

    // 3. Node B lists active rooms
    const roomsForB = await registryB.listActiveRooms({ onlyWaiting: true });
    assert.equal(roomsForB.length, 1);
    assert.equal(roomsForB[0].roomCode, 'TR-1A');
    assert.equal(roomsForB[0].gameName, 'Grand Arena');
    assert.equal(roomsForB[0].seats.G1.claimed, true);
    assert.equal(roomsForB[0].seats.G1.name, 'Alice');
    assert.equal(roomsForB[0].seats.G2.claimed, false, 'G2 must be open for Node B');
    assert.equal(roomsForB[0].seats.G3.claimed, false, 'G3 must be open for Node B');

    // Teardown
    busA.destroy();
    busB.destroy();
  });

  test('Room Deletion: When Node A room is deleted/cancelled, Node B removes it from listing', async () => {
    const net = createMockDiscoveryNetwork();

    const busA = net.createNodeBus();
    const registryA = new KvRoomRegistry({ discoveryBus: busA });

    const busB = net.createNodeBus();
    const registryB = new KvRoomRegistry({ discoveryBus: busB });

    // 1. Create room
    await registryA.createRoom('TR-CANCEL', 'peer_host', { hostDie: 'G1' });
    registryB.broadcastLobbyQuery();
    await new Promise((resolve) => setTimeout(resolve, 50));

    let activeRoomsB = await registryB.listActiveRooms({ onlyWaiting: true });
    assert.ok(activeRoomsB.some(r => r.roomCode === 'TR-CANCEL'));

    // 2. Host closes/deletes room
    await registryA.deleteRoom('TR-CANCEL');
    await new Promise((resolve) => setTimeout(resolve, 50));

    activeRoomsB = await registryB.listActiveRooms({ onlyWaiting: true });
    assert.equal(activeRoomsB.some(r => r.roomCode === 'TR-CANCEL'), false, 'Deleted room must be purged from Node B');

    busA.destroy();
    busB.destroy();
  });

  test('Auto-Start Transition: Room automatically purges from waiting list when full', async () => {
    const net = createMockDiscoveryNetwork();

    const busA = net.createNodeBus();
    const registryA = new KvRoomRegistry({ discoveryBus: busA });

    const busB = net.createNodeBus();
    const registryB = new KvRoomRegistry({ discoveryBus: busB });

    // 1. Create room with G1
    await registryA.createRoom('TR-FULL-AUTO', 'peer_a', { hostDie: 'G1' });
    registryB.broadcastLobbyQuery();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Player 2 and Player 3 join
    await registryA.claimSeat('TR-FULL-AUTO', 'G2', 'peer_b', 'Bob');
    await registryA.claimSeat('TR-FULL-AUTO', 'G3', 'peer_c', 'Charlie');

    await new Promise((resolve) => setTimeout(resolve, 50));

    const waitingB = await registryB.listActiveRooms({ onlyWaiting: true });
    assert.equal(waitingB.some(r => r.roomCode === 'TR-FULL-AUTO'), false, 'Full ACTIVE room must not appear in waiting list');

    busA.destroy();
    busB.destroy();
  });
});
