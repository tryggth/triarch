/**
 * Automated Verification Suite - Strict Two-Phase Execution Engine
 * (Phase 1: Zero-Tie Go-First Initiative -> Phase 2: Tactical Turn & Energy Pot Clash)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateManager } from '../src/game/state.js';
import { GAME_PHASES } from '../src/game/rules.js';
import { GO_FIRST_DICE, TRIARCH_STANDARD } from '../src/math/dice.js';

describe('Strict Two-Phase Execution Engine', () => {

  test('1. Zero-Tie Initiative: Strictly generates unique 1st, 2nd, and 3rd pole positions with non-identical energy across 100 trials', () => {
    for (let trial = 0; trial < 100; trial++) {
      const game = new GameStateManager({ rubyAI: false, cyanAI: false, amberAI: false });
      game.startMatch();

      assert.equal(game.phase, GAME_PHASES.INITIATIVE);
      assert.equal(game.isMatchActive, true);

      const record = game.rollInitiative();
      assert.equal(game.phase, GAME_PHASES.TACTICAL_TURN);

      const rolls = [record.rolls.ruby, record.rolls.cyan, record.rolls.amber];
      // Verify all 3 rolls are distinct
      const uniqueRolls = new Set(rolls);
      assert.equal(uniqueRolls.size, 3, `Trial ${trial}: Go-First initiative rolls must be strictly unique: ${rolls.join(', ')}`);

      // Verify energy matches roll values
      assert.equal(game.players.ruby.energy, record.rolls.ruby);
      assert.equal(game.players.cyan.energy, record.rolls.cyan);
      assert.equal(game.players.amber.energy, record.rolls.amber);

      // Verify initiativeOrder is sorted descending
      const order = record.initiativeOrder;
      assert.equal(order.length, 3);
      assert.ok(game.players[order[0]].energy > game.players[order[1]].energy);
      assert.ok(game.players[order[1]].energy > game.players[order[2]].energy);
    }
  });

  test('2. Turn Progression: currentTurnIndex increments sequentially from 1st to 3rd pole position', () => {
    const game = new GameStateManager({ rubyAI: false, cyanAI: false, amberAI: false });
    game.startMatch();
    game.rollInitiative();

    assert.equal(game.phase, GAME_PHASES.TACTICAL_TURN);
    assert.equal(game.currentTurnIndex, 0);

    const [firstP, secondP, thirdP] = game.initiativeOrder;

    // Player 1 commits turn
    const ok1 = game.commitTacticalTurn(firstP, { spentEnergy: 2, modifiers: [] });
    assert.ok(ok1);
    assert.equal(game.currentTurnIndex, 1);
    assert.equal(game.phase, GAME_PHASES.TACTICAL_TURN);

    // Reject out-of-turn play by 3rd player
    const invalidTurn = game.commitTacticalTurn(thirdP, { spentEnergy: 1 });
    assert.equal(invalidTurn, false);
    assert.equal(game.currentTurnIndex, 1);

    // Player 2 commits turn
    const ok2 = game.commitTacticalTurn(secondP, { spentEnergy: 3, modifiers: ['SHIFTER'] });
    assert.ok(ok2);
    assert.equal(game.currentTurnIndex, 2);
    assert.equal(game.phase, GAME_PHASES.TACTICAL_TURN);

    // Player 3 commits turn -> triggers automatic clash resolution
    const ok3 = game.commitTacticalTurn(thirdP, { spentEnergy: 0, modifiers: [] });
    assert.ok(ok3);
    assert.equal(game.currentTurnIndex, 3);
    assert.equal(game.phase, GAME_PHASES.RESOLUTION);
  });

  test('3. Pot Calculation: Unspent energy from all three players correctly sums into the final pot', () => {
    const game = new GameStateManager({ rubyAI: false, cyanAI: false, amberAI: false });
    game.startMatch();
    game.rollInitiative();

    const [p1, p2, p3] = game.initiativeOrder;
    const initialEnergyTotal = game.players[p1].energy + game.players[p2].energy + game.players[p3].energy;

    const spend1 = Math.min(1, game.players[p1].energy);
    const spend2 = Math.min(2, game.players[p2].energy);
    const spend3 = 0;

    game.commitTacticalTurn(p1, { spentEnergy: spend1, modifiers: [] });
    game.commitTacticalTurn(p2, { spentEnergy: spend2, modifiers: [] });
    game.commitTacticalTurn(p3, { spentEnergy: spend3, modifiers: [] });

    // Clash has executed
    assert.equal(game.phase, GAME_PHASES.RESOLUTION);
    const expectedPot = initialEnergyTotal - (spend1 + spend2 + spend3);
    assert.equal(game.roundPot, expectedPot, `Expected pot ${expectedPot} to match roundPot ${game.roundPot}`);
    assert.equal(game.lastClashResult.pot, expectedPot);
  });

  test('4. Autonomous AI Failover & Auto-Turn Progression in Tactical Phase', () => {
    // 1 Human (Ruby), 2 Bots (Cyan, Amber)
    const game = new GameStateManager({ rubyAI: false, cyanAI: true, amberAI: true });
    game.startMatch();
    game.rollInitiative();

    const [p1, p2, p3] = game.initiativeOrder;

    if (p1 !== 'ruby') {
      // If a bot took 1st pole position, bot should have automatically acted
      assert.ok(game.currentTurnIndex >= 1);
    }

    if (game.phase === GAME_PHASES.TACTICAL_TURN) {
      // Human plays their turn
      assert.equal(game.initiativeOrder[game.currentTurnIndex], 'ruby');
      game.commitTacticalTurn('ruby', { spentEnergy: 0 });
    }

    // After human plays, subsequent bots finish and round resolves
    assert.equal(game.phase, GAME_PHASES.RESOLUTION);
  });

});
