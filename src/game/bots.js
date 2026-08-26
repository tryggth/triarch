/**
 * TRIARCH: Cyclic Edge - AI Opponent Engine
 * Implements game-theoretic bot archetypes: Cyclic Exploiter, Max-EV Strategist, and Shard Tactician.
 */

import { calculatePairwiseProbabilities } from '../math/probability.js';
import { SHARD_ITEMS } from './rules.js';

export class BotStrategy {
  /**
   * Evaluates best die from available list against opponent dice.
   * @param {import('./state.js').PlayerState} botPlayer
   * @param {import('../math/dice.js').Die[]} availableDice
   * @param {import('./state.js').GameState} gameState
   * @returns {number} Index of selected die
   */
  static selectDie(botPlayer, availableDice, gameState) {
    if (availableDice.length === 0) return 0;
    if (availableDice.length === 1) return 0;

    // Default to bot's archetype
    switch (botPlayer.aiType) {
      case 'CYCLIC_EXPLOITER':
        return this._cyclicExploiterChoice(botPlayer, availableDice, gameState);
      case 'MAX_EV':
        return this._maxEVChoice(availableDice);
      case 'SHARD_TACTICIAN':
      default:
        return this._tacticianChoice(botPlayer, availableDice, gameState);
    }
  }

  /**
   * Cyclic Exploiter: Analyzes the leading opponent's die and selects the die with maximum pairwise win probability.
   */
  static _cyclicExploiterChoice(botPlayer, availableDice, gameState) {
    // Find leader among opponents
    const opponents = Object.values(gameState.players).filter(p => p.id !== botPlayer.id);
    const leader = opponents.reduce((top, p) => (p.score > top.score ? p : top), opponents[0]);

    if (!leader || !leader.currentDie) {
      return 0;
    }

    let bestIndex = 0;
    let bestWinRate = -1;

    for (let i = 0; i < availableDice.length; i++) {
      const candidateDie = availableDice[i];
      const stats = calculatePairwiseProbabilities(candidateDie, leader.currentDie);
      if (stats.pA > bestWinRate) {
        bestWinRate = stats.pA;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  /**
   * Max EV: Selects the die with the highest expected value E[X].
   */
  static _maxEVChoice(availableDice) {
    let bestIndex = 0;
    let bestEV = -Infinity;

    for (let i = 0; i < availableDice.length; i++) {
      const ev = availableDice[i].expectedValue();
      if (ev > bestEV) {
        bestEV = ev;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  /**
   * Tactician: Combines cyclic counterplay with balanced variance.
   */
  static _tacticianChoice(botPlayer, availableDice, gameState) {
    // If trailing by 2 or more points, pick highest variance / explosive die
    const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score));
    const isTrailing = (maxScore - botPlayer.score) >= 2;

    if (isTrailing) {
      // Pick highest variance die for comeback potential
      let bestIndex = 0;
      let maxVar = -1;
      for (let i = 0; i < availableDice.length; i++) {
        const v = availableDice[i].variance();
        if (v > maxVar) {
          maxVar = v;
          bestIndex = i;
        }
      }
      return bestIndex;
    }

    return this._cyclicExploiterChoice(botPlayer, availableDice, gameState);
  }

  /**
   * Decides whether to activate an energy shard power-up.
   * @param {import('./state.js').PlayerState} botPlayer
   * @param {import('./state.js').GameState} gameState
   * @returns {string|null} Shard Item ID or null
   */
  static decideShardActivation(botPlayer, gameState) {
    if (botPlayer.shards <= 0) return null;

    const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score));
    const isMatchPoint = maxScore >= (gameState.mode.targetScore - 1);
    const isTrailing = botPlayer.score < maxScore;

    // Use boost if at match point or in late rounds
    if (isMatchPoint || isTrailing || gameState.roundNumber >= 3) {
      if (botPlayer.shards >= SHARD_ITEMS.MIGHT.cost && Math.random() > 0.3) {
        return SHARD_ITEMS.MIGHT.id;
      }
    }

    return null;
  }

  /**
   * Decides tactical turn actions (energy spending on market modifiers and die selection).
   * @param {import('./state.js').PlayerState} botPlayer
   * @param {import('./state.js').GameState} gameState
   * @returns {{ spentEnergy: number, modifiers: string[], dieId: string }}
   */
  static decideTacticalTurn(botPlayer, gameState) {
    const energy = botPlayer.energy || 0;
    const modifiers = [];
    let spent = 0;

    // AI spends energy intelligently based on pool
    if (energy >= 5 && Math.random() > 0.4) {
      modifiers.push('MELEE'); // 5E
      spent += 5;
    } else if (energy >= 3 && Math.random() > 0.4) {
      modifiers.push('SHIFTER'); // 3E
      spent += 3;
    }

    const availableDice = gameState.players ? Object.values(gameState.players).map(p => p.currentDie) : [];
    const dieIdx = this.selectDie(botPlayer, availableDice.length ? availableDice : [botPlayer.currentDie], gameState);
    const chosenDie = (availableDice.length ? availableDice[dieIdx] : botPlayer.currentDie) || botPlayer.currentDie;

    return {
      spentEnergy: spent,
      modifiers,
      dieId: chosenDie.id
    };
  }
}
