/**
 * Automated Verification Suite - Game Engine, State Manager & AI Bots
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateManager } from '../src/game/state.js';
import { GAME_PHASES, GAME_MODES, SHARD_ITEMS } from '../src/game/rules.js';
import { BotStrategy } from '../src/game/bots.js';
import { TRIARCH_STANDARD, Die } from '../src/math/dice.js';

describe('GameStateManager Initialization & Properties', () => {
  test('Initializes default 3-player cyclic state', () => {
    const game = new GameStateManager();
    assert.equal(game.phase, GAME_PHASES.DEPLOY);
    assert.equal(game.roundNumber, 1);
    assert.equal(Object.keys(game.players).length, 3);
    assert.equal(game.players.ruby.score, 0);
    assert.equal(game.players.cyan.score, 0);
    assert.equal(game.players.amber.score, 0);
    assert.equal(game.players.ruby.shards, 2);
  });

  test('Supports state subscriptions and notifications', () => {
    const game = new GameStateManager();
    let notificationCount = 0;
    const unsub = game.subscribe(() => {
      notificationCount++;
    });

    game.activateShard('ruby', 'MIGHT');
    assert.ok(notificationCount > 0);
    assert.equal(game.players.ruby.activeShard, 'MIGHT');

    unsub();
    const countBefore = notificationCount;
    game.activateShard('ruby', 'MIGHT'); // toggles off
    assert.equal(notificationCount, countBefore);
  });
});

describe('Clash Execution & Scoring', () => {
  test('Deterministic rolls trigger proper point allocation and resolution', () => {
    const game = new GameStateManager({ rubyAI: false, cyanAI: false, amberAI: false });

    // Mock fixed dice
    game.players.ruby.currentDie = new Die('r', 'R', [9, 9, 9]); // Roll 9
    game.players.cyan.currentDie = new Die('c', 'C', [8, 8, 8]); // Roll 8
    game.players.amber.currentDie = new Die('a', 'A', [7, 7, 7]); // Roll 7

    const record = game.executeClash();
    assert.equal(record.winnerId, 'ruby');
    assert.equal(game.players.ruby.score, 1);
    assert.equal(game.phase, GAME_PHASES.RESOLUTION);
  });

  test('Cyclic Edge resolves pairwise ties (Ruby > Cyan)', () => {
    const game = new GameStateManager({ rubyAI: false, cyanAI: false, amberAI: false });

    // Ruby rolls 6, Cyan rolls 6, Amber rolls 3
    game.players.ruby.currentDie = new Die('r', 'R', [6, 6, 6]);
    game.players.cyan.currentDie = new Die('c', 'C', [6, 6, 6]);
    game.players.amber.currentDie = new Die('a', 'A', [3, 3, 3]);

    const record = game.executeClash();
    assert.equal(record.winnerId, 'ruby', 'Ruby must prevail over Cyan on cyclic edge');
    assert.ok(record.cyclicBonusApplied);
  });

  test('Target score triggers GAME_OVER phase', () => {
    const game = new GameStateManager({ rubyAI: false, cyanAI: false, amberAI: false });
    game.mode = { id: 'TEST', name: 'Test', targetScore: 2, maxRounds: 5 };
    game.players.ruby.currentDie = new Die('r', 'R', [10, 10, 10]);
    game.players.cyan.currentDie = new Die('c', 'C', [1, 1, 1]);
    game.players.amber.currentDie = new Die('a', 'A', [1, 1, 1]);

    game.executeClash();
    assert.equal(game.players.ruby.score, 1);
    assert.equal(game.phase, GAME_PHASES.RESOLUTION);

    game.nextRound();
    assert.equal(game.phase, GAME_PHASES.DEPLOY);
    assert.equal(game.roundNumber, 2);

    game.executeClash();
    assert.equal(game.players.ruby.score, 2);
    assert.equal(game.phase, GAME_PHASES.GAME_OVER);
    assert.equal(game.winner.id, 'ruby');
  });
});

describe('Bot Strategy Decision Engine', () => {
  test('Cyclic Exploiter picks optimal counter-die against leader', () => {
    const game = new GameStateManager();
    game.players.ruby.score = 3;
    game.players.ruby.currentDie = TRIARCH_STANDARD[0]; // Die A

    const exploiterBot = { id: 'bot-exploiter', aiType: 'CYCLIC_EXPLOITER', score: 0 };

    // Evaluates available dice: TRIARCH_STANDARD
    // Die C (index 2: Amber [3,3,5,5,7,7]) beats Die A with 5/9!
    const choice = BotStrategy.selectDie(exploiterBot, TRIARCH_STANDARD, game);
    assert.equal(choice, 2, 'Bot must pick Amber (Die C) to counter Ruby (Die A)');
  });

  test('Max EV Bot selects highest expected value die', () => {
    const dLow = new Die('low', 'Low', [1, 1, 1]); // EV 1
    const dHigh = new Die('high', 'High', [10, 10, 10]); // EV 10
    const list = [dLow, dHigh];

    const bot = { id: 'bot', aiType: 'MAX_EV', score: 0 };
    const choice = BotStrategy.selectDie(bot, list, {});
    assert.equal(choice, 1, 'Max EV bot must pick dHigh');
  });
});
