/**
 * Automated Verification Suite - Game Theory Odds Inspector & Concealed Bayesian Math
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TRIARCH_STANDARD, Die } from '../src/math/dice.js';
import {
  calculateLiveWinExpectancy,
  applyFaceModifier,
  generateGameTheoryInsights
} from '../src/math/inspector-math.js';
import { calculatePairwiseProbabilities } from '../src/math/probability.js';

describe('Real-Time Bayesian Odds Calculation', () => {
  const [dieA, dieB, dieC] = TRIARCH_STANDARD;

  test('Calculates exact revealed 3-way melee expectancies', () => {
    const states = {
      ruby: { currentDie: dieA, activeShard: null },
      cyan: { currentDie: dieB, activeShard: null },
      amber: { currentDie: dieC, activeShard: null }
    };

    const odds = calculateLiveWinExpectancy(states);

    assert.equal(odds.mode, 'MELEE_3WAY');
    assert.equal(odds.totalHypotheticalScenarios, 216);

    const sumPct = parseFloat(odds.percentages.ruby) +
                   parseFloat(odds.percentages.cyan) +
                   parseFloat(odds.percentages.amber) +
                   parseFloat(odds.percentages.tie);

    assert.ok(Math.abs(sumPct - 100) < 0.5, `Sum of percentages (${sumPct}) must equal ~100%`);
  });

  test('Concealed state correctly marginalizes over uniform 1/3 priors', () => {
    const states = {
      ruby: { currentDie: dieA, activeShard: null },
      cyan: { currentDie: dieB, activeShard: null },
      amber: { currentDie: dieC, activeShard: null }
    };

    // When Amber conceals their die
    const oddsConcealed = calculateLiveWinExpectancy(states, {
      concealed: { amber: true }
    });

    assert.equal(oddsConcealed.isConcealedState, true);
    // Total evaluated scenarios = 1 (A) * 1 (B) * 3 (C candidates) * 216 = 648
    assert.equal(oddsConcealed.totalHypotheticalScenarios, 648);
    assert.ok(oddsConcealed.winExpectancy.amber > 0);
  });
});

describe('Face Shifter Modifier Impact', () => {
  const [dieA, dieB, dieC] = TRIARCH_STANDARD;

  test('applyFaceModifier(+1) increases Expected Value by exactly +1.0', () => {
    const baseEV = dieA.expectedValue();
    const modDie = applyFaceModifier(dieA, 1);
    assert.equal(modDie.expectedValue(), baseEV + 1.0);
  });

  test('Face Shifter modifiers mathematically increase player win expectancy', () => {
    const statesBase = {
      ruby: { currentDie: dieA, activeShard: null },
      cyan: { currentDie: dieB, activeShard: null },
      amber: { currentDie: dieC, activeShard: null }
    };

    const oddsBase = calculateLiveWinExpectancy(statesBase);

    // Buff Ruby with +2 Shifter (faces [4,4,6,6,11,11])
    const oddsRubyPlus2 = calculateLiveWinExpectancy(statesBase, {
      modifiers: { ruby: 2 }
    });

    assert.ok(
      oddsRubyPlus2.winExpectancy.ruby > oddsBase.winExpectancy.ruby,
      `Ruby with +2 Shifter (${oddsRubyPlus2.percentages.ruby}%) must exceed base (${oddsBase.percentages.ruby}%)`
    );

    // Buff Cyan with +2 Shifter (faces [3,3,8,8,10,10])
    const oddsCyanPlus2 = calculateLiveWinExpectancy(statesBase, {
      modifiers: { cyan: 2 }
    });

    assert.ok(
      oddsCyanPlus2.winExpectancy.cyan > oddsBase.winExpectancy.cyan,
      `Cyan with +2 Shifter (${oddsCyanPlus2.percentages.cyan}%) must exceed base (${oddsBase.percentages.cyan}%)`
    );
  });
});

describe('Duel vs Melee Equities', () => {
  const [dieA, dieB, dieC] = TRIARCH_STANDARD;

  test('Die C reflects 55.56% (5/9) in an isolated duel against Die A', () => {
    const states = {
      ruby: { currentDie: dieA },
      amber: { currentDie: dieC }
    };

    const duelOdds = calculateLiveWinExpectancy(states, {
      duelPair: ['amber', 'ruby']
    });

    assert.equal(duelOdds.mode, 'ISOLATED_DUEL');
    assert.equal(duelOdds.percentages.amber, '55.6');
    assert.equal(duelOdds.percentages.ruby, '44.4');
  });

  test('Die C reflects 25.93% (56/216) in standard 3-way melee', () => {
    const states = {
      ruby: { currentDie: dieA },
      cyan: { currentDie: dieB },
      amber: { currentDie: dieC }
    };

    const meleeOdds = calculateLiveWinExpectancy(states);
    assert.equal(meleeOdds.percentages.amber, '25.9');
  });
});

describe('Game Theory Insights Generator', () => {
  const [dieA, dieB, dieC] = TRIARCH_STANDARD;

  test('Generates descriptive insights for standard cyclic loop', () => {
    const states = {
      ruby: { name: 'Ruby Archon', currentDie: dieA, activeShard: 'MIGHT' },
      cyan: { name: 'Cyan Sentinel', currentDie: dieB, activeShard: null },
      amber: { name: 'Amber Keeper', currentDie: dieC, activeShard: null }
    };

    const odds = calculateLiveWinExpectancy(states);
    const insights = generateGameTheoryInsights(states, odds);

    assert.ok(Array.isArray(insights));
    assert.ok(insights.length >= 2);
    assert.ok(insights.some(txt => txt.includes('Cyclic Loop') || txt.includes('Vortex Shard')));
  });
});
