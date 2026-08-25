/**
 * Automated Verification Suite - Probability, Convolutions, Monte Carlo & Graph Theory
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIARCH_STANDARD,
  EFRON_DICE,
  GRIME_DICE,
  Die
} from '../src/math/dice.js';
import {
  calculatePairwiseProbabilities,
  calculateMultiDiceDistribution,
  calculateMultiDicePairwise,
  calculate3WayClashProbabilities,
  runMonteCarloSimulation,
  detectIntransitiveCycles,
  gcd,
  simplifyFraction
} from '../src/math/probability.js';

describe('Rational Arithmetic & Helpers', () => {
  test('gcd computes correct greatest common divisors', () => {
    assert.equal(gcd(20, 36), 4);
    assert.equal(gcd(24, 36), 12);
    assert.equal(gcd(17, 36), 1);
    assert.equal(gcd(0, 5), 5);
  });

  test('simplifyFraction handles reductions and zero cases', () => {
    const f1 = simplifyFraction(20, 36);
    assert.equal(f1.string, '5/9');
    assert.equal(f1.numerator, 5);
    assert.equal(f1.denominator, 9);

    const f0 = simplifyFraction(0, 36);
    assert.equal(f0.string, '0/1');
  });
});

describe('Multi-Die Discrete Convolutions', () => {
  test('Convolution of standard 6-sided die produces correct sums', () => {
    const standardD6 = new Die('d6', 'D6', [1, 2, 3, 4, 5, 6]);
    const dist2d6 = calculateMultiDiceDistribution(standardD6, 2);

    // Sum of 2d6 ranges from 2 to 12
    assert.equal(dist2d6.size, 11);
    // Probability of 7 on 2d6 is 6/36 = 1/6
    const p7 = dist2d6.get(7);
    assert.ok(Math.abs(p7 - (6 / 36)) < 1e-9, `P(2d6=7) should be 1/6, got ${p7}`);

    // Probability of 2 is 1/36
    assert.ok(Math.abs(dist2d6.get(2) - (1 / 36)) < 1e-9);
    // Probability of 12 is 1/36
    assert.ok(Math.abs(dist2d6.get(12) - (1 / 36)) < 1e-9);
  });

  test('Multi-dice pairwise showdown computation', () => {
    const dA = new Die('a', 'Die A', [2, 2, 4, 4, 9, 9]);
    const dB = new Die('b', 'Die B', [1, 1, 6, 6, 8, 8]);

    const singleResult = calculateMultiDicePairwise(dA, 1, dB, 1);
    assert.ok(Math.abs(singleResult.pA - (5 / 9)) < 1e-9);

    const doubleResult = calculateMultiDicePairwise(dA, 2, dB, 2);
    assert.ok(typeof doubleResult.pA === 'number');
    assert.ok(typeof doubleResult.pB === 'number');
    assert.ok(doubleResult.pA + doubleResult.pB + doubleResult.pTie >= 0.9999);
  });
});

describe('3-Way Simultaneous Showdown', () => {
  const [dieA, dieB, dieC] = TRIARCH_STANDARD;

  test('Evaluates all 216 combinations and identifies cyclic dominance', () => {
    const clash = calculate3WayClashProbabilities(dieA, dieB, dieC);

    assert.equal(clash.totalOutcomes, 216);
    assert.ok(clash.isCyclicDominance, 'TRIARCH standard triad must exhibit cyclic dominance');

    const totalProb = clash.pSoloA + clash.pSoloB + clash.pSoloC +
                      clash.pTieAB + clash.pTieBC + clash.pTieCA + clash.pTieAll;
    assert.ok(Math.abs(totalProb - 1.0) < 1e-9, 'Sum of all 3-way outcomes must be exactly 1.0');
  });
});

describe('Monte Carlo Convergence vs Analytical Proofs', () => {
  const [dieA, dieB] = TRIARCH_STANDARD;

  test('Empirical frequency converges to analytical 5/9 within confidence bounds', () => {
    const exact = calculatePairwiseProbabilities(dieA, dieB);
    const mc = runMonteCarloSimulation(dieA, dieB, 50000);

    // Exact is 5/9 approx 0.555555...
    const diff = Math.abs(mc.pEmpiricalA - exact.pA);
    assert.ok(diff < 0.02, `Monte Carlo empirical win rate (${mc.pEmpiricalA}) differed from analytical (${exact.pA}) by ${diff}`);

    // Exact value must fall within 99.9% confidence interval
    assert.ok(
      exact.pA >= mc.confidence999A[0] && exact.pA <= mc.confidence999A[1],
      `Analytical p (${exact.pA}) must fall inside 99.9% CI [${mc.confidence999A[0]}, ${mc.confidence999A[1]}]`
    );
  });
});

describe('Graph-Theoretic Cycle Detection', () => {
  test('Detects 3-cycle in TRIARCH Standard Triad', () => {
    const result = detectIntransitiveCycles(TRIARCH_STANDARD);
    assert.ok(result.isIntransitive);
    assert.ok(result.cycles.length >= 1);
  });

  test('Detects 4-cycle in Efron Dice', () => {
    const result = detectIntransitiveCycles(EFRON_DICE);
    assert.ok(result.isIntransitive);
    assert.ok(result.cycles.length >= 1);
  });
});
