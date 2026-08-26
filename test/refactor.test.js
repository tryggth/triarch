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
import { renderPlayerHUDHTML } from '../src/ui/components.js';

// Setup in-memory mock for storage in Node environment
function setupMockStorage() {
  const store = new Map();
  const mockStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
  global.sessionStorage = mockStorage;
  global.localStorage = mockStorage;
  return store;
}

describe('Persistent App Instance Identity', () => {
  test('generatePeerId returns consistent ID stored in sessionStorage across calls', () => {
    const store = setupMockStorage();

    const id1 = generatePeerId();
    assert.ok(id1.startsWith('client_'));
    assert.equal(store.get('triarch_client_id'), id1);

    const id2 = generatePeerId();
    assert.equal(id2, id1, 'Subsequent generatePeerId calls must return the same stored client ID');
  });

  test('generatePeerId uses pre-existing client ID if already present in sessionStorage', () => {
    const store = setupMockStorage();
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
    const store = setupMockStorage();

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

describe('Stance Concealment & Tactical Phase Privacy', () => {
  test('Player using CONCEAL modifier is hidden from other players during Phase 2, then revealed upon Clash resolution', () => {
    const game = new GameStateManager();
    game.startMatch({ rubyAI: false, cyanAI: false, amberAI: false });

    // Phase 1: Initiative Roll
    game.rollInitiative(() => 0.5);
    assert.equal(game.phase, 'TACTICAL_TURN');

    const firstPlayerId = game.initiativeOrder[0];
    const secondPlayerId = game.initiativeOrder[1];
    const thirdPlayerId = game.initiativeOrder[2];

    // Player 1 commits WITH 'CONCEAL' and 'MELEE'
    game.commitTacticalTurn(firstPlayerId, {
      spentEnergy: 9,
      modifiers: ['CONCEAL', 'MELEE'],
      dieId: 'cyan-b'
    });

    assert.ok(game.concealedPlayers.has(firstPlayerId), 'Player 1 must be tracked in concealedPlayers');

    // Verify HUD for other players (networkMeta: isLocal = false, isConcealed = true)
    const hiddenHUD = renderPlayerHUDHTML(game.players[firstPlayerId], {
      isLocal: false,
      isConcealed: true,
      phase: 'TACTICAL_TURN'
    });

    assert.ok(hiddenHUD.includes('⚡ ??'), 'Energy amount must be hidden when concealed');
    assert.ok(!hiddenHUD.includes('(-9)'), 'Staked energy deduction must be hidden when concealed');
    assert.ok(hiddenHUD.includes('🔒 Stance Concealed'), 'Must render generic concealed badge');
    assert.ok(!hiddenHUD.includes('⚔️ Melee (+2)'), 'Melee modifier must not leak to peers');
    assert.ok(hiddenHUD.includes('🔒 Secret Stance'), 'Die name must be concealed');

    // Verify HUD for local player (isLocal = true, isConcealed = false)
    const localHUD = renderPlayerHUDHTML(game.players[firstPlayerId], {
      isLocal: true,
      isConcealed: false,
      phase: 'TACTICAL_TURN'
    });

    assert.ok(localHUD.includes('(-9)'), 'Local player must see their own staked energy');
    assert.ok(localHUD.includes('⚔️ Melee (+2)'), 'Local player must see their chosen modifiers');
    assert.ok(localHUD.includes('🔒 Conceal'), 'Local player must see their Conceal modifier');

    // Player 2 commits WITHOUT 'CONCEAL'
    game.commitTacticalTurn(secondPlayerId, {
      spentEnergy: 3,
      modifiers: ['SHIFTER'],
      dieId: 'ruby-a'
    });

    assert.ok(!game.concealedPlayers.has(secondPlayerId), 'Player 2 did not conceal');

    const openHUD = renderPlayerHUDHTML(game.players[secondPlayerId], {
      isLocal: false,
      isConcealed: false,
      phase: 'TACTICAL_TURN'
    });

    assert.ok(openHUD.includes('(-3)'), 'Open player staked energy is visible');
    assert.ok(openHUD.includes('⚡ Shifter (+1)'), 'Open player modifiers are visible to all');
    assert.ok(openHUD.includes('Ruby Archon'), 'Open player die choice is visible');

    // Player 3 commits -> Clash auto-resolves, Phase transitions to RESOLUTION
    game.commitTacticalTurn(thirdPlayerId, {
      spentEnergy: 0,
      modifiers: [],
      dieId: 'amber-c'
    });

    assert.equal(game.phase, 'RESOLUTION');
    assert.equal(game.concealedPlayers.size, 0, 'All concealments must be cleared upon clash resolution');

    // Verify Player 1 HUD after Phase 2 (RESOLUTION phase) - all stances revealed!
    const revealedHUD = renderPlayerHUDHTML(game.players[firstPlayerId], {
      isLocal: false,
      isConcealed: false,
      phase: 'RESOLUTION'
    });

    assert.ok(revealedHUD.includes('Cyan Sentinel'), 'Player 1 die choice is now fully revealed');
  });
});

