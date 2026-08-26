import { TRIARCH_STANDARD, GO_FIRST_DICE, Die } from '../math/dice.js';
import { FACTIONS, GAME_PHASES, GAME_MODES, SHARD_ITEMS, MARKET_ACTIONS, isValidPhaseTransition } from './rules.js';
import { calculatePairwiseProbabilities } from '../math/probability.js';
import { BotStrategy } from './bots.js';

export class GameStateManager {
  constructor(options = {}) {
    this.options = { ...options };
    this.listeners = new Set();
    this.eventListeners = new Map();
    this.init(options);
  }

  /**
   * Initializes or resets the game state.
   */
  init(options = {}) {
    const opts = { ...this.options, ...options };
    const modeKey = opts.mode || 'CYCLIC_SHOWDOWN';
    this.mode = GAME_MODES[modeKey] || GAME_MODES.CYCLIC_SHOWDOWN;
    this.isMatchActive = opts.active ?? false;
    this.phase = this.isMatchActive ? (opts.phase || GAME_PHASES.INITIATIVE) : (opts.phase || GAME_PHASES.LOBBY);
    this.roundNumber = 1;
    this.roundPot = 0;
    this.initiativeRolls = { ruby: null, cyan: null, amber: null };
    this.initiativeOrder = ['ruby', 'cyan', 'amber'];
    this.currentTurnIndex = 0;
    this.winner = null;
    this.roundHistory = [];

    // Initialize 3 players with assigned Go-First Fair Initiative Dice
    this.players = {
      ruby: {
        id: 'ruby',
        name: 'Ruby Archon',
        faction: FACTIONS.ruby,
        goFirstDie: GO_FIRST_DICE.G1,
        isAI: opts.rubyAI ?? false,
        aiType: opts.rubyAIType || 'CYCLIC_EXPLOITER',
        score: 0,
        shards: 2,
        energy: 0,
        staked: 0,
        marketModifiers: [],
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
        goFirstDie: GO_FIRST_DICE.G2,
        isAI: opts.cyanAI ?? true,
        aiType: opts.cyanAIType || 'MAX_EV',
        score: 0,
        shards: 2,
        energy: 0,
        staked: 0,
        marketModifiers: [],
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
        goFirstDie: GO_FIRST_DICE.G3,
        isAI: opts.amberAI ?? true,
        aiType: opts.amberAIType || 'SHARD_TACTICIAN',
        score: 0,
        shards: 2,
        energy: 0,
        staked: 0,
        marketModifiers: [],
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
   * Starts an active match with 3 players/bots in Phase 1: Initiative.
   * @param {Object} [options={}]
   */
  startMatch(options = {}) {
    this.init({ ...options, active: true, phase: GAME_PHASES.INITIATIVE });
  }

  /**
   * Ends current match and returns to pre-match lobby state.
   */
  endMatch() {
    this.init({ active: false, phase: GAME_PHASES.LOBBY });
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
   * Event Emitter: Registers an event listener (e.g. 'NOTIFICATION', 'PLAY_SFX').
   * @param {string} event
   * @param {(payload: any) => void} cb
   * @returns {() => void} Unsubscribe function
   */
  on(event, cb) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(cb);
    return () => this.off(event, cb);
  }

  /**
   * Event Emitter: Unregisters an event listener.
   * @param {string} event
   * @param {(payload: any) => void} cb
   */
  off(event, cb) {
    this.eventListeners.get(event)?.delete(cb);
  }

  /**
   * Event Emitter: Dispatches an event to registered listeners.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const cb of listeners) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`Error in GameState event listener for [${event}]:`, err);
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
   * Phase 1: Rolls all three Go-First Fair Initiative Dice (1..18, zero ties).
   * Allocates initial energy, computes pole position turn order, and transitions to TACTICAL_TURN.
   * @param {() => number} [rng=Math.random]
   * @returns {{ rolls: Object, initiativeOrder: string[] }}
   */
  rollInitiative(rng = Math.random) {
    const pRuby = this.players.ruby;
    const pCyan = this.players.cyan;
    const pAmber = this.players.amber;

    // Roll unique Go-First dice (partition of 1..18, guarantees zero ties)
    const rR = (pRuby.goFirstDie || GO_FIRST_DICE.G1).roll(rng);
    const rC = (pCyan.goFirstDie || GO_FIRST_DICE.G2).roll(rng);
    const rA = (pAmber.goFirstDie || GO_FIRST_DICE.G3).roll(rng);

    this.initiativeRolls = { ruby: rR, cyan: rC, amber: rA };

    pRuby.lastRoll = rR;
    pRuby.energy = rR;
    pRuby.staked = 0;
    pRuby.marketModifiers = [];
    pRuby.isReady = false;

    pCyan.lastRoll = rC;
    pCyan.energy = rC;
    pCyan.staked = 0;
    pCyan.marketModifiers = [];
    pCyan.isReady = false;

    pAmber.lastRoll = rA;
    pAmber.energy = rA;
    pAmber.staked = 0;
    pAmber.marketModifiers = [];
    pAmber.isReady = false;

    // Sort descending by roll value (highest roll = 1st pole position)
    this.initiativeOrder = ['ruby', 'cyan', 'amber'].sort((a, b) => this.players[b].energy - this.players[a].energy);
    this.currentTurnIndex = 0;
    this.roundPot = 0;

    this.phase = GAME_PHASES.TACTICAL_TURN;

    // If 1st pole position player is an AI, automatically execute its turn
    this._handleAITacticalTurn(rng);

    this.notify();
    return {
      rolls: this.initiativeRolls,
      initiativeOrder: this.initiativeOrder
    };
  }

  /**
   * Phase 2: Commits a player's tactical turn actions (energy spend, market modifiers, and die choice).
   * @param {string} playerId
   * @param {Object} options
   * @param {number} [options.spentEnergy=0]
   * @param {string[]} [options.modifiers=[]]
   * @param {string|null} [options.dieId=null]
   * @param {() => number} [rng=Math.random]
   * @returns {boolean}
   */
  commitTacticalTurn(playerId, options = {}, rng = Math.random) {
    const activePlayerId = this.initiativeOrder[this.currentTurnIndex];
    if (playerId !== activePlayerId) {
      console.warn(`[GameState] Not ${playerId}'s turn. Active: ${activePlayerId} (turn ${this.currentTurnIndex + 1}/3)`);
      return false;
    }

    const player = this.players[playerId];
    if (!player) return false;

    const spent = Math.min(Math.max(0, options.spentEnergy || 0), player.energy);
    player.energy -= spent;
    player.staked = spent;
    player.marketModifiers = Array.isArray(options.modifiers) ? [...options.modifiers] : [];

    if (options.dieId) {
      const chosenDie = TRIARCH_STANDARD.find(d => d.id === options.dieId);
      if (chosenDie) {
        player.currentDie = chosenDie;
      }
    }

    player.isReady = true;
    this.currentTurnIndex += 1;

    // If subsequent players are AI, handle their turns automatically
    this._handleAITacticalTurn(rng);

    // If all 3 players have committed, auto-execute the combat clash!
    if (this.currentTurnIndex >= 3) {
      this.roundPot = this.players.ruby.energy + this.players.cyan.energy + this.players.amber.energy;
      this.executeClash(rng);
    } else {
      this.notify();
    }

    return true;
  }

  /**
   * Automatically executes consecutive bot turns during Phase 2.
   * @private
   */
  _handleAITacticalTurn(rng = Math.random) {
    while (this.currentTurnIndex < 3) {
      const activeId = this.initiativeOrder[this.currentTurnIndex];
      const activePlayer = this.players[activeId];

      if (!activePlayer || !activePlayer.isAI) {
        break; // Stop at next human player
      }

      const decision = BotStrategy.decideTacticalTurn(activePlayer, this);
      const spent = Math.min(decision.spentEnergy || 0, activePlayer.energy);
      activePlayer.energy -= spent;
      activePlayer.staked = spent;
      activePlayer.marketModifiers = decision.modifiers || [];

      if (decision.dieId) {
        const d = TRIARCH_STANDARD.find(x => x.id === decision.dieId);
        if (d) activePlayer.currentDie = d;
      }

      activePlayer.isReady = true;
      this.currentTurnIndex += 1;
    }

    if (this.currentTurnIndex >= 3 && this.phase === GAME_PHASES.TACTICAL_TURN) {
      this.roundPot = this.players.ruby.energy + this.players.cyan.energy + this.players.amber.energy;
      this.executeClash(rng);
    }
  }

  /**
   * Executes the simultaneous dice roll for all 3 players.
   * @param {() => number} [rng=Math.random]
   */
  executeClash(rng = Math.random) {
    this.phase = GAME_PHASES.CLASH;

    // 1. Calculate unspent round pot
    this.roundPot = this.players.ruby.energy + this.players.cyan.energy + this.players.amber.energy;

    // 2. Roll raw face values and apply market/shard modifiers
    for (const player of Object.values(this.players)) {
      const raw = player.currentDie.roll(rng);
      player.lastRoll = raw;

      let mod = raw;
      // Melee Strike (+2)
      if (player.marketModifiers.includes('MELEE')) {
        mod += 2;
      }
      // Shifter Matrix (+1)
      if (player.marketModifiers.includes('SHIFTER')) {
        mod += 1;
      }
      // Might shard (+1 Face)
      if (player.activeShard === SHARD_ITEMS.MIGHT.id && player.shards >= SHARD_ITEMS.MIGHT.cost) {
        mod += 1;
        player.shards -= SHARD_ITEMS.MIGHT.cost;
      }
      player.lastModifiedRoll = mod;
    }

    // 3. Evaluate round resolution
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
      victoryReason = `Highest roll (${maxVal}) by ${roundWinner.name}! Captured ${this.roundPot} Energy Pot!`;
    } else if (leaders.length === 2) {
      // 2-way tie: Check Duel/Shield or cyclic dominance edge
      const [l1, l2] = leaders;
      const shield1 = l1.marketModifiers.includes('DUEL') || (l1.activeShard === SHARD_ITEMS.SHIELD.id && l1.shards >= SHARD_ITEMS.SHIELD.cost);
      const shield2 = l2.marketModifiers.includes('DUEL') || (l2.activeShard === SHARD_ITEMS.SHIELD.id && l2.shards >= SHARD_ITEMS.SHIELD.cost);

      if (shield1 && !shield2) {
        roundWinner = l1;
        if (l1.activeShard === SHARD_ITEMS.SHIELD.id) l1.shards -= SHARD_ITEMS.SHIELD.cost;
        victoryReason = `Aegis Shield broke the tie in favor of ${l1.name}! Claimed ${this.roundPot} Energy Pot!`;
      } else if (shield2 && !shield1) {
        roundWinner = l2;
        if (l2.activeShard === SHARD_ITEMS.SHIELD.id) l2.shards -= SHARD_ITEMS.SHIELD.cost;
        victoryReason = `Aegis Shield broke the tie in favor of ${l2.name}! Claimed ${this.roundPot} Energy Pot!`;
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
        victoryReason = `Cyclic Edge resolved tie (${maxVal} vs ${maxVal}): ${roundWinner.name} holds dominance! Claimed ${this.roundPot} Energy Pot!`;
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
      roundWinner.shards += 1;
    }

    // Reset active modifiers for all players
    for (const p of Object.values(this.players)) {
      p.activeShard = null;
      p.isReady = false;
      p.marketModifiers = [];
      p.staked = 0;
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
      pot: this.roundPot,
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
   * Advances the turn from resolution to the next initiative round.
   */
  nextRound() {
    if (this.phase === GAME_PHASES.GAME_OVER) return;
    this.roundNumber += 1;
    this.phase = GAME_PHASES.INITIATIVE;
    this.currentTurnIndex = 0;
    this.roundPot = 0;
    this.lastClashResult = null;
    for (const p of Object.values(this.players)) {
      p.isReady = false;
      p.marketModifiers = [];
      p.staked = 0;
      p.activeShard = null;
    }
    this.notify();
  }

  /**
   * Generates a complete structured match telemetry payload for analysis/export.
   * @param {Object} [meta={}] - Additional match metadata (e.g. roomCode, transportType)
   * @returns {Object}
   */
  exportTelemetry(meta = {}) {
    const checksum = Object.entries(this.players).reduce((acc, [id, p]) => {
      return acc + `:${id}:${p.score}:${p.shards}`;
    }, `R${this.roundNumber}:${this.phase}`);

    return {
      version: '1.0.0',
      game: 'TRIARCH: Cyclic Edge',
      exportedAt: new Date().toISOString(),
      timestamp: Date.now(),
      matchMetadata: {
        roomCode: meta.roomCode || 'LOCAL',
        transportType: meta.transportType || 'local',
        mode: this.mode.id,
        targetScore: this.mode.targetScore,
        maxRounds: this.mode.maxRounds,
        totalRoundsPlayed: this.roundHistory.length,
        finalWinner: this.winner ? this.winner.name : (this.phase === GAME_PHASES.GAME_OVER ? 'Tied' : null),
        status: this.phase
      },
      players: Object.fromEntries(
        Object.entries(this.players).map(([id, p]) => [
          id,
          {
            id: p.id,
            name: p.name,
            faction: p.faction.name,
            isAI: p.isAI,
            aiType: p.aiType,
            finalScore: p.score,
            finalShards: p.shards,
            assignedDie: p.currentDie.name,
            faces: p.currentDie.faces
          }
        ])
      ),
      roundHistory: this.roundHistory.map((rec) => ({
        roundNumber: rec.roundNumber,
        winnerId: rec.winnerId,
        winnerName: rec.winnerName,
        reason: rec.reason,
        rolls: rec.rolls,
        scoresAfter: rec.scoresAfterRound,
        shardsAfter: rec.shardsAfterRound
      })),
      stateChecksum: checksum
    };
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
