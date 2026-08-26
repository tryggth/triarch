/**
 * TRIARCH: Cyclic Edge - Game Rules & Engine Constants
 * Defines the strategic mechanics, phase state machines, scoring conditions, and player factions.
 */

export const FACTIONS = Object.freeze({
  ruby: {
    id: 'ruby',
    name: 'Ruby Archon',
    color: '#fb7185',
    accentColor: '#e11d48',
    bgGradient: 'from-rose-950/40 to-rose-900/20',
    borderClass: 'border-rose-500/50',
    textClass: 'text-rose-400',
    symbol: '🔺',
    defaultDieIndex: 0,
    quote: 'Sudden devastation cuts through brittle steel.'
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan Sentinel',
    color: '#22d3ee',
    accentColor: '#0891b2',
    bgGradient: 'from-cyan-950/40 to-cyan-900/20',
    borderClass: 'border-cyan-500/50',
    textClass: 'text-cyan-400',
    symbol: '🔷',
    defaultDieIndex: 1,
    quote: 'Relentless precision overwhelms the patient.'
  },
  amber: {
    id: 'amber',
    name: 'Amber Keeper',
    color: '#facc15',
    accentColor: '#ca8a04',
    bgGradient: 'from-amber-950/40 to-amber-900/20',
    borderClass: 'border-amber-500/50',
    textClass: 'text-amber-400',
    symbol: '🟡',
    defaultDieIndex: 2,
    quote: 'Immovable order endures the wildfire.'
  }
});

export const GAME_PHASES = Object.freeze({
  LOBBY: 'LOBBY',
  INITIATIVE: 'INITIATIVE',
  TACTICAL_TURN: 'TACTICAL_TURN',
  DEPLOY: 'DEPLOY', // Alias for TACTICAL_TURN
  DRAFT: 'DRAFT',
  CLASH: 'CLASH',
  RESOLUTION: 'RESOLUTION',
  GAME_OVER: 'GAME_OVER'
});

export const GAME_MODES = Object.freeze({
  CYCLIC_SHOWDOWN: {
    id: 'CYCLIC_SHOWDOWN',
    name: 'Cyclic Showdown (Standard 3-Way)',
    description: 'All 3 Archons roll simultaneously. The highest roll captures the round. Cyclic ties break along the directed edge A ➔ B ➔ C ➔ A.',
    targetScore: 5,
    maxRounds: 10
  },
  DUEL_TOURNEY: {
    id: 'DUEL_TOURNEY',
    name: 'Cyclic Round-Robin Duel',
    description: 'Three 1-on-1 matches per round (A vs B, B vs C, C vs A). Demonstrates intransitive cyclic edge directly in point tally.',
    targetScore: 7,
    maxRounds: 8
  },
  SHRINE_CONQUEST: {
    id: 'SHRINE_CONQUEST',
    name: 'Shrine Conquest (Tactical)',
    description: '3 Shrines on the board. Archons deploy modified dice to contest territorial nodes with energy shard buffs.',
    targetScore: 6,
    maxRounds: 6
  }
});

export const SHARD_ITEMS = Object.freeze({
  MIGHT: {
    id: 'MIGHT',
    name: 'Vortex Shard (+1 Face Boost)',
    cost: 1,
    description: 'Adds +1 to all rolled face values for this round.',
    icon: '⚡'
  },
  REROLL: {
    id: 'REROLL',
    name: 'Temporal Shard (Reroll Token)',
    cost: 2,
    description: 'Automatically rerolls your lowest face if you would lose the clash.',
    icon: '⏳'
  },
  SHIELD: {
    id: 'SHIELD',
    name: 'Aegis Shard (Tiebreaker Shield)',
    cost: 1,
    description: 'Wins any tie regardless of cyclic turn order.',
    icon: '🛡️'
  }
});

export const MARKET_ACTIONS = Object.freeze({
  CONCEAL: {
    id: 'CONCEAL',
    name: 'Conceal Stance',
    cost: 4,
    description: 'Zero-Knowledge SHA-256 hidden stance commitment.',
    icon: '🔒'
  },
  MELEE: {
    id: 'MELEE',
    name: 'Melee Strike (+2 Boost)',
    cost: 5,
    description: 'Infuses combat die with +2 face boost in clash showdown.',
    icon: '⚔️'
  },
  SHIFTER: {
    id: 'SHIFTER',
    name: 'Shift Matrix (+1 Boost)',
    cost: 3,
    description: 'Shifts combat die face values up by +1.',
    icon: '⚡'
  },
  DUEL: {
    id: 'DUEL',
    name: 'Arena Shield',
    cost: 6,
    description: 'Aegis Shield tiebreaker dominance against all opponents.',
    icon: '🛡️'
  }
});

/**
 * Validates whether a state transition is legal according to the phase machine.
 * @param {string} currentPhase
 * @param {string} targetPhase
 * @returns {boolean}
 */
export function isValidPhaseTransition(currentPhase, targetPhase) {
  const transitions = {
    [GAME_PHASES.LOBBY]: [GAME_PHASES.INITIATIVE, GAME_PHASES.DEPLOY, GAME_PHASES.DRAFT],
    [GAME_PHASES.INITIATIVE]: [GAME_PHASES.TACTICAL_TURN, GAME_PHASES.DEPLOY, GAME_PHASES.CLASH],
    [GAME_PHASES.TACTICAL_TURN]: [GAME_PHASES.TACTICAL_TURN, GAME_PHASES.CLASH, GAME_PHASES.RESOLUTION],
    [GAME_PHASES.DEPLOY]: [GAME_PHASES.TACTICAL_TURN, GAME_PHASES.CLASH, GAME_PHASES.DRAFT],
    [GAME_PHASES.DRAFT]: [GAME_PHASES.DEPLOY, GAME_PHASES.TACTICAL_TURN, GAME_PHASES.LOBBY],
    [GAME_PHASES.CLASH]: [GAME_PHASES.RESOLUTION],
    [GAME_PHASES.RESOLUTION]: [GAME_PHASES.INITIATIVE, GAME_PHASES.DEPLOY, GAME_PHASES.GAME_OVER, GAME_PHASES.LOBBY],
    [GAME_PHASES.GAME_OVER]: [GAME_PHASES.LOBBY, GAME_PHASES.INITIATIVE, GAME_PHASES.DEPLOY]
  };

  return (transitions[currentPhase] || []).includes(targetPhase);
}
