/**
 * Automated Math Verification Suite - Dice & Non-Transitive Triads
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Die,
  TRIARCH_STANDARD,
  EFRON_DICE,
  GRIME_DICE,
  MIWIN_DICE,
  DICE_PRESETS
} from '../src/math/dice.js';
import { calculatePairwiseProbabilities } from '../src/math/probability.js';

describe('Die Class & Basic Mechanics', () => {
  test('Constructs valid Die instances and computes EV and Variance', () => {
    const d = new Die('test', 'Test Die', [1, 2, 3, 4, 5, 6]);
    assert.equal(d.faceCount, 6);
    assert.equal(d.expectedValue(), 3.5);
    assert.equal(d.variance().toFixed(4), '2.9167');
    assert.equal(d.standardDeviation().toFixed(4), '1.7078');
  });

  test('Rejects invalid die definitions', () => {
    assert.throws(() => new Die('invalid', 'Single Face', [1]));
    assert.throws(() => new Die('invalid', 'NaN Face', [1, 2, NaN]));
  });

  test('Roll produces values strictly within face set', () => {
    const d = new Die('d', 'Custom', [10, 20, 30]);
    for (let i = 0; i < 50; i++) {
      const val = d.roll();
      assert.ok([10, 20, 30].includes(val), `Rolled value ${val} must be in [10, 20, 30]`);
    }
  });
});

describe('TRIARCH Standard Triad Mathematical Proofs', () => {
  const [dieA, dieB, dieC] = TRIARCH_STANDARD;

  test('All three dice have identical Expected Value of 5.0 (Sum = 30)', () => {
    assert.equal(dieA.expectedValue(), 5.0);
    assert.equal(dieB.expectedValue(), 5.0);
    assert.equal(dieC.expectedValue(), 5.0);
  });

  test('Cyclic non-transitivity is strictly verified: P(A>B) = P(B>C) = P(C>A) = 5/9 (55.56%)', () => {
    const pairAB = calculatePairwiseProbabilities(dieA, dieB);
    const pairBC = calculatePairwiseProbabilities(dieB, dieC);
    const pairCA = calculatePairwiseProbabilities(dieC, dieA);

    // Exact count of wins out of 36
    assert.equal(pairAB.countAWins, 20, 'Die A must win exactly 20 of 36 against Die B');
    assert.equal(pairAB.fractionA.string, '5/9');
    assert.equal(pairAB.countTies, 0, 'No ties between distinct faces of A and B');

    assert.equal(pairBC.countAWins, 20, 'Die B must win exactly 20 of 36 against Die C');
    assert.equal(pairBC.fractionA.string, '5/9');
    assert.equal(pairBC.countTies, 0);

    assert.equal(pairCA.countAWins, 20, 'Die C must win exactly 20 of 36 against Die A');
    assert.equal(pairCA.fractionA.string, '5/9');
    assert.equal(pairCA.countTies, 0);
  });
});

describe('Efron Dice 4-Cycle Mathematical Proofs', () => {
  const [eA, eB, eC, eD] = EFRON_DICE;

  test('Dominance loop A > B > C > D > A with exact 2/3 (66.67%) edge', () => {
    const ab = calculatePairwiseProbabilities(eA, eB);
    const bc = calculatePairwiseProbabilities(eB, eC);
    const cd = calculatePairwiseProbabilities(eC, eD);
    const da = calculatePairwiseProbabilities(eD, eA);

    assert.equal(ab.fractionA.string, '2/3', 'Efron A must beat B with P=2/3');
    assert.equal(bc.fractionA.string, '2/3', 'Efron B must beat C with P=2/3');
    assert.equal(cd.fractionA.string, '2/3', 'Efron C must beat D with P=2/3');
    assert.equal(da.fractionA.string, '2/3', 'Efron D must beat A with P=2/3');
  });
});

describe('Dice Presets Registry', () => {
  test('All presets are properly registered with valid non-empty dice sets', () => {
    const keys = Object.keys(DICE_PRESETS);
    assert.ok(keys.includes('triarch'));
    assert.ok(keys.includes('efron'));
    assert.ok(keys.includes('grime'));
    assert.ok(keys.includes('miwin'));

    for (const key of keys) {
      const preset = DICE_PRESETS[key];
      assert.ok(preset.name.length > 0);
      assert.ok(preset.dice.length >= 3);
    }
  });
});
