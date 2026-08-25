/**
 * TRIARCH: Cyclic Edge - Exact Probability & Combinatorics Engine
 * Computes exact discrete distributions, multi-die convolutions, 3-way showdowns,
 * Monte Carlo validations, and graph-theoretic intransitive cycle detection.
 */

/**
 * Computes greatest common divisor for fraction simplification.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Simplifies a rational fraction.
 * @param {number} num
 * @param {number} den
 * @returns {{ numerator: number, denominator: number, string: string }}
 */
export function simplifyFraction(num, den) {
  if (den === 0) return { numerator: 0, denominator: 0, string: '0/0' };
  const d = gcd(num, den);
  const numerator = num / d;
  const denominator = den / d;
  return {
    numerator,
    denominator,
    string: `${numerator}/${denominator}`
  };
}

/**
 * Computes exact head-to-head pairwise outcome probabilities between two dice.
 * @param {import('./dice.js').Die} dieA
 * @param {import('./dice.js').Die} dieB
 * @returns {Object} Pairwise statistical analysis
 */
export function calculatePairwiseProbabilities(dieA, dieB) {
  const facesA = dieA.faces;
  const facesB = dieB.faces;
  const totalOutcomes = facesA.length * facesB.length;

  let countAWins = 0;
  let countBWins = 0;
  let countTies = 0;

  // Grid for visualization
  const comparisonMatrix = [];

  for (let i = 0; i < facesA.length; i++) {
    const row = [];
    const a = facesA[i];
    for (let j = 0; j < facesB.length; j++) {
      const b = facesB[j];
      if (a > b) {
        countAWins++;
        row.push(1); // A wins
      } else if (b > a) {
        countBWins++;
        row.push(-1); // B wins
      } else {
        countTies++;
        row.push(0); // Tie
      }
    }
    comparisonMatrix.push(row);
  }

  const pA = countAWins / totalOutcomes;
  const pB = countBWins / totalOutcomes;
  const pTie = countTies / totalOutcomes;

  return {
    dieA: { id: dieA.id, name: dieA.name },
    dieB: { id: dieB.id, name: dieB.name },
    totalOutcomes,
    countAWins,
    countBWins,
    countTies,
    pA,
    pB,
    pTie,
    fractionA: simplifyFraction(countAWins, totalOutcomes),
    fractionB: simplifyFraction(countBWins, totalOutcomes),
    fractionTie: simplifyFraction(countTies, totalOutcomes),
    advantage: pA - pB,
    winnerId: pA > pB ? dieA.id : pB > pA ? dieB.id : 'TIE',
    winnerName: pA > pB ? dieA.name : pB > pA ? dieB.name : 'Tie',
    comparisonMatrix
  };
}

/**
 * Convolves two discrete probability mass functions (PMFs).
 * @param {Map<number, number>} dist1
 * @param {Map<number, number>} dist2
 * @returns {Map<number, number>}
 */
export function convolveDistributions(dist1, dist2) {
  const result = new Map();
  for (const [val1, prob1] of dist1.entries()) {
    for (const [val2, prob2] of dist2.entries()) {
      const sum = val1 + val2;
      const combinedProb = prob1 * prob2;
      result.set(sum, (result.get(sum) || 0) + combinedProb);
    }
  }
  return result;
}

/**
 * Computes exact sum distribution when rolling `count` copies of a given die.
 * Uses polynomial convolution powers.
 * @param {import('./dice.js').Die} die
 * @param {number} count - Number of dice rolled
 * @returns {Map<number, number>} Sum value -> exact probability
 */
export function calculateMultiDiceDistribution(die, count = 1) {
  if (count <= 0) return new Map([[0, 1]]);
  let currentDist = die.getDistribution();

  for (let i = 1; i < count; i++) {
    currentDist = convolveDistributions(currentDist, die.getDistribution());
  }

  return currentDist;
}

/**
 * Computes exact pairwise win probabilities when rolling multiple copies of two dice.
 * Crucial for proving the Grime Paradox (where 2 dice reverse cyclic dominance).
 * @param {import('./dice.js').Die} dieA
 * @param {number} countA
 * @param {import('./dice.js').Die} dieB
 * @param {number} countB
 * @returns {Object} Multi-dice comparison stats
 */
export function calculateMultiDicePairwise(dieA, countA, dieB, countB) {
  const distA = calculateMultiDiceDistribution(dieA, countA);
  const distB = calculateMultiDiceDistribution(dieB, countB);

  let pAWins = 0;
  let pBWins = 0;
  let pTies = 0;

  for (const [sumA, probA] of distA.entries()) {
    for (const [sumB, probB] of distB.entries()) {
      const jointProb = probA * probB;
      if (sumA > sumB) {
        pAWins += jointProb;
      } else if (sumB > sumA) {
        pBWins += jointProb;
      } else {
        pTies += jointProb;
      }
    }
  }

  return {
    dieA: { name: dieA.name, count: countA },
    dieB: { name: dieB.name, count: countB },
    pA: pAWins,
    pB: pBWins,
    pTie: pTies,
    winner: pAWins > pBWins ? dieA.name : pBWins > pAWins ? dieB.name : 'TIE'
  };
}

/**
 * Computes exact 3-way simultaneous showdown probabilities for 3 dice (A, B, C).
 * All 6x6x6 = 216 combinations are exhaustively evaluated.
 * @param {import('./dice.js').Die} dieA
 * @param {import('./dice.js').Die} dieB
 * @param {import('./dice.js').Die} dieC
 * @returns {Object} 3-Way showdown statistics
 */
export function calculate3WayClashProbabilities(dieA, dieB, dieC) {
  const fA = dieA.faces;
  const fB = dieB.faces;
  const fC = dieC.faces;
  const totalOutcomes = fA.length * fB.length * fC.length;

  let soloA = 0;
  let soloB = 0;
  let soloC = 0;
  let tieAB = 0; // A == B > C
  let tieBC = 0; // B == C > A
  let tieCA = 0; // C == A > B
  let tieAll = 0; // A == B == C

  for (let i = 0; i < fA.length; i++) {
    const a = fA[i];
    for (let j = 0; j < fB.length; j++) {
      const b = fB[j];
      for (let k = 0; k < fC.length; k++) {
        const c = fC[k];
        const maxVal = Math.max(a, b, c);

        const aMax = (a === maxVal);
        const bMax = (b === maxVal);
        const cMax = (c === maxVal);

        if (aMax && !bMax && !cMax) soloA++;
        else if (bMax && !aMax && !cMax) soloB++;
        else if (cMax && !aMax && !bMax) soloC++;
        else if (aMax && bMax && !cMax) tieAB++;
        else if (bMax && cMax && !aMax) tieBC++;
        else if (cMax && aMax && !bMax) tieCA++;
        else if (aMax && bMax && cMax) tieAll++;
      }
    }
  }

  // Calculate pairwise edges
  const pairAB = calculatePairwiseProbabilities(dieA, dieB);
  const pairBC = calculatePairwiseProbabilities(dieB, dieC);
  const pairCA = calculatePairwiseProbabilities(dieC, dieA);

  // Check if A > B, B > C, C > A OR A < B, B < C, C < A
  const isClockwiseCycle = (pairAB.pA > pairAB.pB) && (pairBC.pA > pairBC.pB) && (pairCA.pA > pairCA.pB);
  const isCounterClockwiseCycle = (pairAB.pB > pairAB.pA) && (pairBC.pB > pairBC.pA) && (pairCA.pB > pairCA.pA);
  const isCyclicDominance = isClockwiseCycle || isCounterClockwiseCycle;

  return {
    totalOutcomes,
    pSoloA: soloA / totalOutcomes,
    pSoloB: soloB / totalOutcomes,
    pSoloC: soloC / totalOutcomes,
    pTieAB: tieAB / totalOutcomes,
    pTieBC: tieBC / totalOutcomes,
    pTieCA: tieCA / totalOutcomes,
    pTieAll: tieAll / totalOutcomes,
    pairwise: {
      AB: pairAB,
      BC: pairBC,
      CA: pairCA
    },
    isCyclicDominance,
    cycleDirection: isClockwiseCycle ? 'Clockwise (A➔B➔C➔A)' : isCounterClockwiseCycle ? 'Counter-Clockwise (A➔C➔B➔A)' : 'None',
    cycleDescription: isCyclicDominance 
      ? (isClockwiseCycle ? `${dieA.name} ➔ ${dieB.name} ➔ ${dieC.name} ➔ ${dieA.name}` : `${dieA.name} ➔ ${dieC.name} ➔ ${dieB.name} ➔ ${dieA.name}`)
      : 'Non-cyclic tournament'
  };
}

/**
 * Monte Carlo simulator to empirically verify pairwise win rates with confidence bounds.
 * @param {import('./dice.js').Die} dieA
 * @param {import('./dice.js').Die} dieB
 * @param {number} [iterations=50000]
 * @returns {Object} Empirical frequencies, standard error, and confidence intervals
 */
export function runMonteCarloSimulation(dieA, dieB, iterations = 50000) {
  let winsA = 0;
  let winsB = 0;
  let ties = 0;

  for (let i = 0; i < iterations; i++) {
    const rollA = dieA.roll();
    const rollB = dieB.roll();
    if (rollA > rollB) winsA++;
    else if (rollB > rollA) winsB++;
    else ties++;
  }

  const pEmpiricalA = winsA / iterations;
  const pEmpiricalB = winsB / iterations;
  const pEmpiricalTie = ties / iterations;

  // Standard Error for proportion = sqrt(p * (1 - p) / N)
  const seA = Math.sqrt((pEmpiricalA * (1 - pEmpiricalA)) / iterations);
  const seB = Math.sqrt((pEmpiricalB * (1 - pEmpiricalB)) / iterations);

  // 99.9% Confidence Interval (z = 3.29)
  return {
    iterations,
    winsA,
    winsB,
    ties,
    pEmpiricalA,
    pEmpiricalB,
    pEmpiricalTie,
    seA,
    seB,
    confidence95A: [
      Math.max(0, pEmpiricalA - 1.96 * seA),
      Math.min(1, pEmpiricalA + 1.96 * seA)
    ],
    confidence999A: [
      Math.max(0, pEmpiricalA - 3.29 * seA),
      Math.min(1, pEmpiricalA + 3.29 * seA)
    ],
    confidence95B: [
      Math.max(0, pEmpiricalB - 1.96 * seB),
      Math.min(1, pEmpiricalB + 1.96 * seB)
    ]
  };
}

/**
 * Graph-Theoretic Intransitive Cycle Detector
 * Constructs tournament adjacency matrix and detects all simple directed cycles.
 * @param {import('./dice.js').Die[]} diceList
 * @returns {Object} Graph analysis including adjacency matrix and detected cycles
 */
export function detectIntransitiveCycles(diceList) {
  const n = diceList.length;
  const adj = Array.from({ length: n }, () => Array(n).fill(0));
  const probMatrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        probMatrix[i][j] = 0.5;
        continue;
      }
      const pair = calculatePairwiseProbabilities(diceList[i], diceList[j]);
      probMatrix[i][j] = pair.pA;
      if (pair.pA > pair.pB) adj[i][j] = 1;
      else if (pair.pB > pair.pA) adj[i][j] = -1;
      else adj[i][j] = 0;
    }
  }

  const cycles = [];
  const visited = new Array(n).fill(false);
  const path = [];

  function dfs(u, startNode, depth) {
    visited[u] = true;
    path.push(u);

    for (let v = 0; v < n; v++) {
      if (adj[u][v] === 1) {
        if (v === startNode && depth >= 2) {
          cycles.push([...path, startNode]);
        } else if (!visited[v] && v > startNode) {
          dfs(v, startNode, depth + 1);
        }
      }
    }

    path.pop();
    visited[u] = false;
  }

  for (let i = 0; i < n; i++) {
    dfs(i, i, 0);
  }

  const isIntransitive = cycles.length > 0;

  return {
    nodeCount: n,
    diceNames: diceList.map(d => d.name),
    adjacencyMatrix: adj,
    probabilityMatrix: probMatrix,
    isIntransitive,
    cycles: cycles.map(c => ({
      indices: c,
      names: c.map(idx => diceList[idx].name),
      formatted: c.map(idx => diceList[idx].name).join(' ➔ ')
    }))
  };
}
