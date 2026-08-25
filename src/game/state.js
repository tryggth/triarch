/**
 * TRIARCH: Cyclic Edge - Complete Game State & Turn Engine
 * Manages player states, phase transitions, roll execution, scoring, and history logging.
 */

import { TRIARCH_STANDARD, Die } from '../math/dice.js';
import { FACTIONS, GAME_PHASES, GAME_MODES, SHARD_ITEMS, isValidPhaseTransition } from './rules.js';
import { calculatePairwiseProbabilities } from '../math/probability.js';
import { BotStrategy } from './bots.js';

export class GameStateManager {
  constructor(options = {}) {
    this.listeners = new Set();
    this.init(options);
  }

  /**
   * Initializes or resets the game state.
   */
  init(options = {}) {
    const modeKey = options.mode || 'CYCLIC_SHOWDOWN';
    this.mode = GAME_MODES[modeKey] || GAME_MODES.CYCLIC_SHOWDOWN;
    this.phase = GAME_PHASES.DEPLOY;
    this.roundNumber = 1;
    this.winner = null;
    this.roundHistory = [];

    // Initialize 3 players
    this.players = {
      ruby: {
        id: 'ruby',
        name: 'Ruby Archon',
        faction: FACTIONS.ruby,
        isAI: options.rubyAI ?? false,
        aiType: options.rubyAIType || 'CYCLIC_EXPLOITER',
        score: 0,
        shards: 2,
        currentDie: TRIARCH_STANDARD[0],
        activeShard: null,
        lastRoll: null,
        lastModifiedRoll: null,
        isReady: false
      },
      cyan: {
        id: 'cyan',
        name: 'Cyan Sentinel',
        faction: FACTIONS.cyan,
        isAI: options.cyanAI ?? true,
        aiType: options.cyanAIType || 'MAX_EV',
        score: 0,
        shards: 2,
        currentDie: TRIARCH_STANDARD[1],
        activeShard: null,
        lastRoll: null,
        lastModifiedRoll: null,
        isReady: false
      },
      amber: {
        id: 'amber',
        name: 'Amber Keeper',
        faction: FACTIONS.amber,
        isAI: options.amberAI ?? true,
        aiType: options.amberAIType || 'SHARD_TACTICIAN',
        score: 0,
        shards: 2,
        currentDie: TRIARCH_STANDARD[2],
        activeShard: null,
        lastRoll: null,
        lastModifiedRoll: null,
        isReady: false
      }
    };

    this.lastClashResult = null;
    this.notify();
  }

  /**
   * Subscribes a listener to state changes.
   * @param {() => void} listener
   * @returns {() => void} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('Error in GameState listener:', err);
      }
    }
  }

  /**
   * Transitions to a new phase if valid.
   */
  setPhase(targetPhase) {
    if (!isValidPhaseTransition(this.phase, targetPhase)) {
      console.warn(`Illegal phase transition: ${this.phase} -> ${targetPhase}`);
      return false;
    }
    this.phase = targetPhase;
    this.notify();
    return true;
  }

  /**
   * Updates a player's selected die.
   */
  setPlayerDie(playerId, die) {
    if (!this.players[playerId]) return;
    this.players[playerId].currentDie = die;
    this.notify();
  }

  /**
   * Activates an energy shard power-up for a player.
   */
  activateShard(playerId, shardId) {
    const player = this.players[playerId];
    const item = SHARD_ITEMS[shardId];
    if (!player || !item) return false;

    if (player.shards < item.cost) {
      return false;
    }

    // Toggle if already selected
    if (player.activeShard === shardId) {
      player.activeShard = null;
      this.notify();
      return true;
    }

    player.activeShard = shardId;
    this.notify();
    return true;
  }

  /**
   * Triggers AI bot decisions for non-human players.
   */
  executeAIDecisions(availableDice = TRIARCH_STANDARD) {
    for (const player of Object.values(this.players)) {
      if (player.isAI) {
        const dieIdx = BotStrategy.selectDie(player, availableDice, this);
        if (availableDice[dieIdx]) {
          player.currentDie = availableDice[dieIdx];
        }

        const shard = BotStrategy.decideShardActivation(player, this);
        if (shard) {
          this.activateShard(player.id, shard);
        }

        player.isReady = true;
      }
    }
    this.notify();
  }

  /**
   * Executes the simultaneous dice roll for all 3 players.
   * @param {() => number} [rng=Math.random]
   */
  executeClash(rng = Math.random) {
    this.phase = GAME_PHASES.CLASH;

    // AI decisions execute before roll
    this.executeAIDecisions();

    // 1. Roll raw face values
    for (const player of Object.values(this.players)) {
      const raw = player.currentDie.roll(rng);
      player.lastRoll = raw;

      let mod = raw;
      // Apply Might shard (+1 Face)
      if (player.activeShard === SHARD_ITEMS.MIGHT.id && player.shards >= SHARD_ITEMS.MIGHT.cost) {
        mod += 1;
        player.shards -= SHARD_ITEMS.MIGHT.cost;
      }
      player.lastModifiedRoll = mod;
    }

    // 2. Evaluate round resolution
    const pRuby = this.players.ruby;
    const pCyan = this.players.cyan;
    const pAmber = this.players.amber;

    const rR = pRuby.lastModifiedRoll;
    const rC = pCyan.lastModifiedRoll;
    const rA = pAmber.lastModifiedRoll;

    const maxVal = Math.max(rR, rC, rA);
    const leaders = [];
    if (rR === maxVal) leaders.push(pRuby);
    if (rC === maxVal) leaders.push(pCyan);
    if (rA === maxVal) leaders.push(pAmber);

    let roundWinner = null;
    let victoryReason = '';
    let cyclicBonusApplied = false;

    if (leaders.length === 1) {
      roundWinner = leaders[0];
      victoryReason = `Highest roll (${maxVal}) by ${roundWinner.name}!`;
    } else if (leaders.length === 2) {
      // 2-way tie: Check shield or cyclic dominance edge
      const [l1, l2] = leaders;
      const shield1 = l1.activeShard === SHARD_ITEMS.SHIELD.id && l1.shards >= SHARD_ITEMS.SHIELD.cost;
      const shield2 = l2.activeShard === SHARD_ITEMS.SHIELD.id && l2.shards >= SHARD_ITEMS.SHIELD.cost;

      if (shield1 && !shield2) {
        roundWinner = l1;
        l1.shards -= SHARD_ITEMS.SHIELD.cost;
        victoryReason = `Aegis Shield broke the tie in favor of ${l1.name}!`;
      } else if (shield2 && !shield1) {
        roundWinner = l2;
        l2.shards -= SHARD_ITEMS.SHIELD.cost;
        victoryReason = `Aegis Shield broke the tie in favor of ${l2.name}!`;
      } else {
        // Cyclic Edge resolution: Ruby > Cyan, Cyan > Amber, Amber > Ruby
        const cyclicOrder = {
          'ruby-cyan': pRuby,
          'cyan-amber': pCyan,
          'amber-ruby': pAmber,
          'cyan-ruby': pRuby,
          'amber-cyan': pCyan,
          'ruby-amber': pAmber
        };

        const key = `${l1.id}-${l2.id}`;
        roundWinner = cyclicOrder[key] || l1;
        cyclicBonusApplied = true;
        victoryReason = `Cyclic Edge resolved tie (${maxVal} vs ${maxVal}): ${roundWinner.name} holds dominance!`;
      }
    } else {
      // 3-way tie: Energy surge, everyone gains 1 shard, no points awarded
      victoryReason = `3-Way Stalemate (${maxVal}-${maxVal}-${maxVal})! Cyclic resonance grants +1 Shard to all!`;
      for (const p of Object.values(this.players)) {
        p.shards += 1;
      }
    }

    if (roundWinner) {
      roundWinner.score += 1;
      // Round winner gains 1 shard as victory bounty
      roundWinner.shards += 1;
    }

    // Reset active shards for all players
    for (const p of Object.values(this.players)) {
      p.activeShard = null;
      p.isReady = false;
    }

    // Check game over
    let matchWinner = null;
    for (const p of Object.values(this.players)) {
      if (p.score >= this.mode.targetScore) {
        matchWinner = p;
        break;
      }
    }

    if (!matchWinner && this.roundNumber >= this.mode.maxRounds) {
      // Best score at max rounds
      const sorted = Object.values(this.players).sort((a, b) => b.score - a.score);
      if (sorted[0].score > sorted[1].score) {
        matchWinner = sorted[0];
      }
    }

    const roundRecord = {
      roundNumber: this.roundNumber,
      rolls: {
        ruby: { raw: pRuby.lastRoll, modified: pRuby.lastModifiedRoll },
        cyan: { raw: pCyan.lastRoll, modified: pCyan.lastModifiedRoll },
        amber: { raw: pAmber.lastRoll, modified: pAmber.lastModifiedRoll }
      },
      winnerId: roundWinner ? roundWinner.id : null,
      winnerName: roundWinner ? roundWinner.name : 'Tie',
      reason: victoryReason,
      cyclicBonusApplied,
      scoresAfterRound: {
        ruby: pRuby.score,
        cyan: pCyan.score,
        amber: pAmber.score
      }
    };

    this.roundHistory.push(roundRecord);
    this.lastClashResult = roundRecord;

    if (matchWinner) {
      this.winner = matchWinner;
      this.phase = GAME_PHASES.GAME_OVER;
    } else {
      this.phase = GAME_PHASES.RESOLUTION;
    }

    this.notify();
    return roundRecord;
  }

  /**
   * Advances the turn from resolution to the next deploy round.
   */
  nextRound() {
    if (this.phase === GAME_PHASES.GAME_OVER) return;
    this.roundNumber += 1;
    this.phase = GAME_PHASES.DEPLOY;
    this.lastClashResult = null;
    this.notify();
  }

  /**
   * Serializes current state to JSON string.
   */
  serialize() {
    return JSON.stringify({
      mode: this.mode.id,
      phase: this.phase,
      roundNumber: this.roundNumber,
      winner: this.winner ? this.winner.id : null,
      roundHistory: this.roundHistory,
      players: Object.fromEntries(
        Object.entries(this.players).map(([id, p]) => [
          id,
          {
            id: p.id,
            name: p.name,
            isAI: p.isAI,
            aiType: p.aiType,
            score: p.score,
            shards: p.shards,
            currentDieFaces: p.currentDie.faces,
            currentDieName: p.currentDie.name
          }
        ])
      )
    });
  }
}
