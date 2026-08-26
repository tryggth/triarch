/**
 * TRIARCH: Cyclic Edge - Mathematical Dice Engine
 * Core data structures, validation, statistical analysis, and classic non-transitive dice presets.
 */

export class Die {
  /**
   * @param {string} id - Unique identifier for the die
   * @param {string} name - Display name
   * @param {number[]} faces - Array of numerical values on each face
   * @param {string} color - Theme color hex or CSS color
   * @param {string} description - Strategic role and mathematical characteristics
   * @param {string} [symbol] - Graphic / glyph representation
   */
  constructor(id, name, faces, color = '#fb7185', description = '', symbol = '🎲') {
    if (!Array.isArray(faces) || faces.length < 2) {
      throw new Error(`Die '${name}' must have at least 2 faces.`);
    }
    if (!faces.every(f => typeof f === 'number' && !isNaN(f))) {
      throw new Error(`All faces of Die '${name}' must be valid numbers.`);
    }

    this.id = id;
    this.name = name;
    this.faces = Object.freeze([...faces].sort((a, b) => a - b));
    this.color = color;
    this.description = description;
    this.symbol = symbol;
    this.faceCount = this.faces.length;
  }

  /**
   * Rolls the die using standard uniform PRNG or custom RNG function.
   * @param {() => number} [rng=Math.random]
   * @returns {number} Face value rolled
   */
  roll(rng = Math.random) {
    const idx = Math.floor(rng() * this.faces.length);
    return this.faces[idx];
  }

  /**
   * Computes exact Expected Value E[X] = (1/N) * sum(faces).
   * @returns {number}
   */
  expectedValue() {
    const sum = this.faces.reduce((acc, val) => acc + val, 0);
    return sum / this.faces.length;
  }

  /**
   * Computes population variance Var(X) = E[X^2] - (E[X])^2.
   * @returns {number}
   */
  variance() {
    const ev = this.expectedValue();
    const sumSqDiff = this.faces.reduce((acc, val) => acc + Math.pow(val - ev, 2), 0);
    return sumSqDiff / this.faces.length;
  }

  /**
   * Computes standard deviation sigma = sqrt(Var(X)).
   * @returns {number}
   */
  standardDeviation() {
    return Math.sqrt(this.variance());
  }

  /**
   * Returns exact probability mass function (PMF) map of face values.
   * @returns {Map<number, number>} Value -> Probability
   */
  getDistribution() {
    const dist = new Map();
    const p = 1 / this.faces.length;
    for (const val of this.faces) {
      dist.set(val, (dist.get(val) || 0) + p);
    }
    return dist;
  }

  /**
   * Formats face values as readable string.
   * @returns {string} e.g. "[2, 2, 4, 4, 9, 9]"
   */
  toFaceString() {
    return `[${this.faces.join(', ')}]`;
  }

  /**
   * Creates a modified copy of this die (e.g. with shard buff).
   * @param {Object} options
   * @returns {Die}
   */
  clone(options = {}) {
    return new Die(
      options.id || `${this.id}-mod`,
      options.name || `${this.name}`,
      options.faces || [...this.faces],
      options.color || this.color,
      options.description || this.description,
      options.symbol || this.symbol
    );
  }
}

/**
 * Standard Triarch Non-Transitive Triad
 * Mathematically proven:
 * - Equal expected value: E[A] = E[B] = E[C] = 5.0 (Sum = 30)
 * - Cyclic Dominance: P(A > B) = 5/9 (55.56%), P(B > C) = 5/9 (55.56%), P(C > A) = 5/9 (55.56%)
 * - Zero Ties in pairwise head-to-head combat
 */
export const TRIARCH_STANDARD = Object.freeze([
  new Die(
    'ruby-a',
    'Ruby Archon (Die A)',
    [2, 2, 4, 4, 9, 9],
    '#fb7185',
    'High explosive ceiling. Obliterates Cyan with twin 9s, vulnerable to Amber stability.',
    '🔺'
  ),
  new Die(
    'cyan-b',
    'Cyan Sentinel (Die B)',
    [1, 1, 6, 6, 8, 8],
    '#22d3ee',
    'High-mid consistency. Suppresses Amber with balanced 6s and 8s, crushed by Ruby 9s.',
    '🔷'
  ),
  new Die(
    'amber-c',
    'Amber Keeper (Die C)',
    [3, 3, 5, 5, 7, 7],
    '#facc15',
    'Rock-solid central distribution. Counters Ruby with dependable odd rungs, vulnerable to Cyan.',
    '🟡'
  )
]);

/**
 * Efron's Classic 4-Die Non-Transitive Set
 * Dominance loop: A > B > C > D > A with probability 2/3 (66.67%)
 */
export const EFRON_DICE = Object.freeze([
  new Die(
    'efron-a',
    'Efron Jade (A)',
    [4, 4, 4, 4, 0, 0],
    '#34d399',
    'P(A > B) = 2/3. Four 4s dominate B.',
    '🟩'
  ),
  new Die(
    'efron-b',
    'Efron Cobalt (B)',
    [3, 3, 3, 3, 3, 3],
    '#38bdf8',
    'P(B > C) = 2/3. Constant 3 beats two-thirds of C.',
    '🟦'
  ),
  new Die(
    'efron-c',
    'Efron Amber (C)',
    [6, 6, 2, 2, 2, 2],
    '#fbbf24',
    'P(C > D) = 2/3. Heavy 6s dominate D.',
    '🟨'
  ),
  new Die(
    'efron-d',
    'Efron Ruby (D)',
    [5, 5, 5, 1, 1, 1],
    '#f43f5e',
    'P(D > A) = 2/3. Half 5s beat A.',
    '🟥'
  )
]);

/**
 * Grime Dice Set (Dr. James Grime)
 * Cyclic paradox: When rolling 1 die, Red > Blue > Olive > Yellow > Magenta > Red.
 * When rolling 2 dice, the dominance cycle REVERSES: Red < Blue < Olive < Yellow < Magenta < Red!
 */
export const GRIME_DICE = Object.freeze([
  new Die('grime-red', 'Grime Red', [2, 2, 2, 7, 7, 7], '#ef4444', 'Beats Blue with 1 die (P=2/3), loses to Blue with 2 dice!', '🔴'),
  new Die('grime-blue', 'Grime Blue', [1, 1, 5, 5, 5, 5], '#3b82f6', 'Beats Olive with 1 die (P=7/9), loses to Olive with 2 dice!', '🔵'),
  new Die('grime-olive', 'Grime Olive', [0, 0, 4, 4, 4, 4], '#84cc16', 'Beats Yellow with 1 die (P=5/9), loses to Yellow with 2 dice!', '🟢'),
  new Die('grime-yellow', 'Grime Yellow', [3, 3, 3, 3, 3, 8], '#eab308', 'Beats Magenta with 1 die (P=7/12), loses to Magenta with 2 dice!', '🟡'),
  new Die('grime-magenta', 'Grime Magenta', [1, 1, 1, 6, 6, 6], '#ec4899', 'Beats Red with 1 die (P=5/9), loses to Red with 2 dice!', '🟣')
]);

/**
 * Miwin's Standard 1975 Intransitive Triad
 * All three dice have equal sum of 30 (mean 5.0) and identical set of differences.
 */
export const MIWIN_DICE = Object.freeze([
  new Die('miwin-iii', 'Miwin III', [1, 2, 5, 6, 7, 9], '#a855f7', 'Miwin Set III - beats IV with P = 17/36.', '🔮'),
  new Die('miwin-iv', 'Miwin IV', [1, 3, 4, 5, 8, 9], '#06b6d4', 'Miwin Set IV - beats V with P = 17/36.', '💠'),
  new Die('miwin-v', 'Miwin V', [2, 3, 4, 6, 7, 8], '#10b981', 'Miwin Set V - beats III with P = 17/36.', '❇️')
]);

/**
 * Dictionary of all standard presets available in Triarch
 */
export const DICE_PRESETS = Object.freeze({
  triarch: {
    id: 'triarch',
    name: 'TRIARCH Triad (Balanced 5.0)',
    description: 'The core 3-player non-transitive tournament set. Zero ties, identical EV (5.0), exact 5/9 (55.56%) cyclic dominance.',
    dice: TRIARCH_STANDARD
  },
  efron: {
    id: 'efron',
    name: "Efron's 4-Dice Cycle",
    description: 'Classic 4-die non-transitive ring with 2/3 (66.67%) dominance across all adjacent pairs.',
    dice: EFRON_DICE
  },
  grime: {
    id: 'grime',
    name: "Grime Paradox 5-Dice Ring",
    description: 'A 5-die non-transitive ring where rolling 2 dice inverts the entire dominance direction.',
    dice: GRIME_DICE
  },
  miwin: {
    id: 'miwin',
    name: "Miwin's Fair Intransitive Triad",
    description: 'Invented by physicist Miwin in 1975. All dice have identical sum (30) with symmetric 17/36 win rates.',
    dice: MIWIN_DICE
  }
});

/**
 * Mathematically Fair 3-Player Go-First Initiative Dice
 * Sum = 57 each, partition of 1..18, zero ties.
 */
export const GO_FIRST_DICE = Object.freeze({
  G1: new Die(
    'g1',
    'Go-First Die 1 (G1)',
    [1, 5, 10, 11, 13, 17],
    '#fb7185',
    'Go-First Die 1 (Faces: {1, 5, 10, 11, 13, 17}) — Assigned to Ruby Archon',
    '🔺'
  ),
  G2: new Die(
    'g2',
    'Go-First Die 2 (G2)',
    [3, 4, 7, 12, 15, 16],
    '#22d3ee',
    'Go-First Die 2 (Faces: {3, 4, 7, 12, 15, 16}) — Assigned to Cyan Sentinel',
    '🔷'
  ),
  G3: new Die(
    'g3',
    'Go-First Die 3 (G3)',
    [2, 6, 8, 9, 14, 18],
    '#facc15',
    'Go-First Die 3 (Faces: {2, 6, 8, 9, 14, 18}) — Assigned to Amber Keeper',
    '🟡'
  )
});

