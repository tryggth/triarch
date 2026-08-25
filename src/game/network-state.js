/**
 * TRIARCH: Cyclic Edge - Network State Synchronization Adapter
 * Connects GameStateManager with PeerMeshManager, manages Stance Concealment
 * (cryptographic commit-reveal), action dispatching, and deterministic state reconciliation.
 */

import { GameStateManager } from './state.js';
import { TRIARCH_STANDARD, DICE_PRESETS, Die } from '../math/dice.js';
import { GAME_PHASES, SHARD_ITEMS } from './rules.js';
import {
  ACTION_TYPES,
  createActionEnvelope,
  computeStateChecksum
} from '../network/protocol.js';
import {
  createDraftCommitment,
  createDraftReveal,
  verifyCommitment
} from '../crypto/commit.js';
import { toast } from '../ui/toast.js';
import { sfx } from '../audio/sfx.js';

export class NetworkGameStateAdapter {
  /**
   * @param {GameStateManager} localGameState
   * @param {import('../network/peer-mesh.js').PeerMeshManager} meshManager
   */
  constructor(localGameState, meshManager) {
    this.game = localGameState;
    this.mesh = meshManager;

    this.isMultiplayer = false;
    this.localConcealedSecret = null; // { dieId, salt, commitment }
    this.peerCommitments = new Map(); // seat -> commitmentHash
    this.peerReveals = new Map(); // seat -> { dieId, salt, verified: boolean }

    this.setupMeshListeners();
  }

  setupMeshListeners() {
    this.mesh.onAction(async (envelope, fromPeerId) => {
      await this.handleRemoteAction(envelope, fromPeerId);
    });

    this.mesh.onGameStart((payload) => {
      console.log('[NetState] Received GAME_START from Host:', payload);
      this.isMultiplayer = true;
      this.game.init({
        mode: payload.mode || 'CYCLIC_SHOWDOWN',
        rubyAI: this.mesh.seats.ruby.isAI,
        cyanAI: this.mesh.seats.cyan.isAI,
        amberAI: this.mesh.seats.amber.isAI
      });
      toast.show('Multiplayer Match Launched!', 'success', 2500);
      sfx.playDominanceChime();
    });
  }

  /**
   * Dispatches local player die selection (open or concealed).
   * @param {string} dieId
   * @param {boolean} [isConcealed=false] - Stance Concealment (Costs 4 Shards or Secret Draft)
   */
  async selectDie(dieId, isConcealed = false) {
    const seat = this.mesh.localSeat || 'ruby';
    const die = TRIARCH_STANDARD.find(d => d.id === dieId) || TRIARCH_STANDARD[0];

    if (!this.isMultiplayer) {
      // Local solo mode
      this.game.setPlayerDie(seat, die);
      return;
    }

    if (isConcealed) {
      // Cryptographic commit-reveal scheme
      const { action, secret } = await createDraftCommitment(seat, die.id);
      this.localConcealedSecret = secret;
      this.peerCommitments.set(seat, secret.commitment);

      // Set local die immediately for player's own view
      this.game.setPlayerDie(seat, die);

      // Broadcast commitment hash only (Zero-Knowledge)
      const envelope = createActionEnvelope(ACTION_TYPES.DRAFT_COMMIT, seat, {
        commitment: secret.commitment
      }, { peerId: this.mesh.peerId, round: this.game.roundNumber });

      this.mesh.broadcastAction(envelope);
      toast.show('🔒 Stance Concealed: SHA-256 Commitment Broadcasted', 'info', 2500);
    } else {
      // Open selection
      this.localConcealedSecret = null;
      this.game.setPlayerDie(seat, die);

      const envelope = createActionEnvelope(ACTION_TYPES.DRAFT_SELECT, seat, {
        dieId: die.id
      }, { peerId: this.mesh.peerId, round: this.game.roundNumber });

      this.mesh.broadcastAction(envelope);
    }
  }

  /**
   * Activates/deactivates a shard item and synchronizes to mesh.
   * @param {string} shardId
   */
  activateShard(shardId) {
    const seat = this.mesh.localSeat || 'ruby';
    const success = this.game.activateShard(seat, shardId);

    if (success && this.isMultiplayer) {
      const envelope = createActionEnvelope(ACTION_TYPES.SHARD_USE, seat, {
        shardId
      }, { peerId: this.mesh.peerId, round: this.game.roundNumber });
      this.mesh.broadcastAction(envelope);
    }
    return success;
  }

  /**
   * Executes or triggers the clash roll.
   * In multiplayer, Host broadcasts authoritative rolls or seeds.
   */
  async executeClash() {
    const seat = this.mesh.localSeat || 'ruby';

    // 1. If local player had a concealed commitment, broadcast the reveal now!
    if (this.localConcealedSecret) {
      const revealPayload = createDraftReveal(
        seat,
        this.localConcealedSecret.dieId,
        this.localConcealedSecret.salt
      );
      const envelope = createActionEnvelope(ACTION_TYPES.DRAFT_REVEAL, seat, {
        die: revealPayload.die,
        salt: revealPayload.salt
      }, { peerId: this.mesh.peerId, round: this.game.roundNumber });

      this.mesh.broadcastAction(envelope);
      this.localConcealedSecret = null;
    }

    if (!this.isMultiplayer || this.mesh.isHost) {
      // Authoritative clash execution
      const clashRecord = this.game.executeClash();

      if (this.isMultiplayer && this.mesh.isHost) {
        const envelope = createActionEnvelope(ACTION_TYPES.CLASH_ROLL, null, {
          round: clashRecord.roundNumber,
          rolls: clashRecord.rolls,
          winnerId: clashRecord.winnerId,
          reason: clashRecord.reason,
          scores: clashRecord.scoresAfterRound,
          checksum: computeStateChecksum(this.game)
        }, { peerId: this.mesh.peerId, round: this.game.roundNumber });

        this.mesh.broadcastAction(envelope);
      }

      return clashRecord;
    }
  }

  /**
   * Handles incoming remote action envelope from WebRTC / DataChannel mesh.
   * @param {Object} envelope
   * @param {string} fromPeerId
   */
  async handleRemoteAction(envelope, fromPeerId) {
    const { type, seat, payload } = envelope;

    switch (type) {
      case ACTION_TYPES.DRAFT_COMMIT: {
        if (seat && payload.commitment) {
          this.peerCommitments.set(seat, payload.commitment);
          toast.show(`🔒 ${this.game.players[seat]?.name || seat} committed a secret stance!`, 'info', 2000);
          this.game.notify();
        }
        break;
      }

      case ACTION_TYPES.DRAFT_REVEAL: {
        if (seat && payload.die && payload.salt) {
          const priorCommitment = this.peerCommitments.get(seat);
          if (priorCommitment) {
            const isValid = await verifyCommitment(priorCommitment, payload.die, payload.salt);
            if (isValid) {
              const dieObj = TRIARCH_STANDARD.find(d => d.id === payload.die) || TRIARCH_STANDARD[0];
              this.game.setPlayerDie(seat, dieObj);
              this.peerReveals.set(seat, { dieId: payload.die, salt: payload.salt, verified: true });
              toast.show(`🔓 ${this.game.players[seat]?.name || seat} revealed: ${dieObj.name} (Verified ✅)`, 'success', 2500);
            } else {
              toast.show(`🚨 TAMPER ALERT: ${seat} reveal failed SHA-256 verification!`, 'error', 4000);
              this.peerReveals.set(seat, { dieId: payload.die, salt: payload.salt, verified: false });
            }
          } else {
            const dieObj = TRIARCH_STANDARD.find(d => d.id === payload.die) || TRIARCH_STANDARD[0];
            this.game.setPlayerDie(seat, dieObj);
          }
          this.game.notify();
        }
        break;
      }

      case ACTION_TYPES.DRAFT_SELECT: {
        if (seat && payload.dieId) {
          const dieObj = TRIARCH_STANDARD.find(d => d.id === payload.dieId) || TRIARCH_STANDARD[0];
          this.game.setPlayerDie(seat, dieObj);
          this.game.notify();
        }
        break;
      }

      case ACTION_TYPES.SHARD_USE: {
        if (seat && payload.shardId) {
          this.game.activateShard(seat, payload.shardId);
          this.game.notify();
        }
        break;
      }

      case ACTION_TYPES.CLASH_ROLL: {
        // Non-host peers receive synchronized roll outcome from host
        if (!this.mesh.isHost && payload.rolls) {
          for (const s of ['ruby', 'cyan', 'amber']) {
            if (payload.rolls[s]) {
              this.game.players[s].lastRoll = payload.rolls[s].raw;
              this.game.players[s].lastModifiedRoll = payload.rolls[s].modified;
            }
          }
          if (payload.scores) {
            this.game.players.ruby.score = payload.scores.ruby;
            this.game.players.cyan.score = payload.scores.cyan;
            this.game.players.amber.score = payload.scores.amber;
          }

          this.game.phase = GAME_PHASES.RESOLUTION;
          this.game.lastClashResult = {
            roundNumber: payload.round,
            rolls: payload.rolls,
            winnerId: payload.winnerId,
            winnerName: payload.winnerId ? this.game.players[payload.winnerId]?.name : 'Tie',
            reason: payload.reason,
            scoresAfterRound: payload.scores
          };

          this.game.notify();
          sfx.playClash();
          if (payload.winnerId) sfx.playDominanceChime();
        }
        break;
      }
    }
  }
}
