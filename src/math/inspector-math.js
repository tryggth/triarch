/**
 * TRIARCH: Cyclic Edge - Real-Time Game Theory & Odds Inspector Engine
 * Computes dynamic Bayesian win expectancies, hidden stance probability distributions,
 * face-shifter convolutions, duel vs. melee equities, and strategic AI justifications.
 */

import { TRIARCH_STANDARD, Die } from './dice.js';
import { calculatePairwiseProbabilities, calculate3WayClashProbabilities } from './probability.js';

/**
 * Creates a shifted die instance with modified face values (e.g. +1 or +2 face shifter).
 * @param {Die} die
 * @param {number} modifier
 * @returns {Die}
 */
export function applyFaceModifier(die, modifier = 0) {
  if (!modifier) return die;
  const newFaces = die.faces.map(f => f + modifier);
  return new Die(
    `${die.id}_mod${modifier}`,
    `${die.name} (+${modifier})`,
    newFaces,
    die.color,
    die.description,
    die.symbol
  );
}

/**
 * Calculates real-time Bayesian win expectancies for all 3 players in a round.
 * Handles both revealed dice and concealed stances (uniform 1/3 prior over [I_A, I_B, I_C]).
 * 
 * @param {Object} playerStates - Map of player states ('ruby', 'cyan', 'amber')
 * @param {Object} [options={}] - Modifiers and duel settings
 * @returns {Object} Real-time odds breakdown
 */
export function calculateLiveWinExpectancy(playerStates, options = {}) {
  const seats = ['ruby', 'cyan', 'amber'];
  const baseDice = TRIARCH_STANDARD; // [Die A, Die B, Die C]

  // Extract each player's candidate dice list and modifiers
  const playerCandidates = {};

  for (const s of seats) {
    const p = playerStates[s] || {};
    const mod = (options.modifiers && options.modifiers[s]) || (p.activeShard === 'MIGHT' ? 1 : 0);
    const isConcealed = (options.concealed && options.concealed[s]) || (p.isConcealed && !options.revealed?.[s]);

    if (isConcealed) {
      // Prior distribution: uniform 1/3 over the 3 standard dice triad
      playerCandidates[s] = baseDice.map(d => applyFaceModifier(d, mod));
    } else {
      const die = p.currentDie || baseDice[s === 'ruby' ? 0 : s === 'cyan' ? 1 : 2];
      playerCandidates[s] = [applyFaceModifier(die, mod)];
    }
  }

  // If in isolated Duel mode between 2 specific players
  if (options.duelPair && options.duelPair.length === 2) {
    const [s1, s2] = options.duelPair;
    return calculateDuelExpectancy(s1, playerCandidates[s1], s2, playerCandidates[s2]);
  }

  // Standard 3-Way Melee Expectancy
  let totalWeight = 0;
  let rubyExpectedWins = 0;
  let cyanExpectedWins = 0;
  let amberExpectedWins = 0;
  let expectedTies = 0;

  // Cartesian product over all candidate combinations
  for (const dA of playerCandidates.ruby) {
    for (const dB of playerCandidates.cyan) {
      for (const dC of playerCandidates.amber) {
        totalWeight++;
        const clash = calculate3WayClashProbabilities(dA, dB, dC);

        rubyExpectedWins += clash.pSoloA;
        cyanExpectedWins += clash.pSoloB;
        amberExpectedWins += clash.pSoloC;
        expectedTies += (clash.pTieAB + clash.pTieBC + clash.pTieCA + clash.pTieAll);
      }
    }
  }

  const pRuby = rubyExpectedWins / totalWeight;
  const pCyan = cyanExpectedWins / totalWeight;
  const pAmber = amberExpectedWins / totalWeight;
  const pTie = expectedTies / totalWeight;

  return {
    mode: 'MELEE_3WAY',
    winExpectancy: {
      ruby: pRuby,
      cyan: pCyan,
      amber: pAmber,
      tie: pTie
    },
    percentages: {
      ruby: (pRuby * 100).toFixed(1),
      cyan: (pCyan * 100).toFixed(1),
      amber: (pAmber * 100).toFixed(1),
      tie: (pTie * 100).toFixed(1)
    },
    isConcealedState: Object.values(options.concealed || {}).some(Boolean),
    totalHypotheticalScenarios: totalWeight * 216
  };
}

/**
 * Computes isolated Duel win expectancy between two players.
 */
export function calculateDuelExpectancy(seat1, candidates1, seat2, candidates2) {
  let totalCombos = 0;
  let wins1 = 0;
  let wins2 = 0;
  let ties = 0;

  for (const d1 of candidates1) {
    for (const d2 of candidates2) {
      totalCombos++;
      const stats = calculatePairwiseProbabilities(d1, d2);
      wins1 += stats.pA;
      wins2 += stats.pB;
      ties += stats.pTie;
    }
  }

  const p1 = wins1 / totalCombos;
  const p2 = wins2 / totalCombos;
  const pTie = ties / totalCombos;

  return {
    mode: 'ISOLATED_DUEL',
    duelSeats: [seat1, seat2],
    winExpectancy: {
      [seat1]: p1,
      [seat2]: p2,
      tie: pTie
    },
    percentages: {
      [seat1]: (p1 * 100).toFixed(1),
      [seat2]: (p2 * 100).toFixed(1),
      tie: (pTie * 100).toFixed(1)
    },
    advantage: p1 - p2
  };
}

/**
 * Generates natural language game-theoretic explanations for real-time odds & bot decisions.
 * @param {Object} playerStates
 * @param {Object} odds
 * @returns {string[]} Strategic insights
 */
export function generateGameTheoryInsights(playerStates, odds) {
  const insights = [];
  const pRuby = playerStates.ruby;
  const pCyan = playerStates.cyan;
  const pAmber = playerStates.amber;

  // 1. Cyclic Dominance Assessment
  if (pRuby?.currentDie && pCyan?.currentDie && pAmber?.currentDie) {
    const pairRC = calculatePairwiseProbabilities(pRuby.currentDie, pCyan.currentDie);
    const pairCA = calculatePairwiseProbabilities(pCyan.currentDie, pAmber.currentDie);
    const pairAR = calculatePairwiseProbabilities(pAmber.currentDie, pRuby.currentDie);

    if (pairRC.pA > 0.5 && pairCA.pA > 0.5 && pairAR.pA > 0.5) {
      insights.push(`⚡ Standard Cyclic Loop Active: Ruby holds a ${(pairRC.pA * 100).toFixed(1)}% edge over Cyan, Cyan holds ${(pairCA.pA * 100).toFixed(1)}% over Amber, and Amber counters Ruby with ${(pairAR.pA * 100).toFixed(1)}%.`);
    }
  }

  // 2. High-Roll Explosiveness vs Melee Dynamics
  if (odds.winExpectancy.ruby > odds.winExpectancy.amber) {
    insights.push(`💥 Ruby's explosive twin 9s grant high 3-way melee conversion, despite Amber countering Ruby in 1v1 duels.`);
  } else if (odds.winExpectancy.amber > 0.35) {
    insights.push(`🛡️ Amber's consistent central distribution yields steady returns, mitigating high-variance swings.`);
  }

  // 3. Shard & Face Shifter Impact
  for (const s of ['ruby', 'cyan', 'amber']) {
    const player = playerStates[s];
    if (player && player.activeShard === 'MIGHT') {
      insights.push(`⚡ ${player.name} activated a Vortex Shard (+1 Face Boost), lifting their win expectancy significantly.`);
    }
    if (player && player.activeShard === 'SHIELD') {
      insights.push(`🛡️ ${player.name} holds Aegis Shield, preemptively securing all tiebreaker resolutions.`);
    }
  }

  if (insights.length === 0) {
    insights.push('🎲 Symmetric triad in equilibrium. All players possess balanced strategic counterplay.');
  }

  return insights;
}
