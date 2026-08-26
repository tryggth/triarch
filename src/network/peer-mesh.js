/**
 * TRIARCH: Cyclic Edge - 3-Node Peer Mesh & Seating Engine
 * Manages WebRTC / DataChannel mesh connections, 3-player role negotiation,
 * latency measuring (heartbeats), and synchronized message routing.
 */

import {
  ACTION_TYPES,
  SEATS,
  GO_FIRST_TO_FACTION,
  FACTION_TO_GO_FIRST,
  createActionEnvelope,
  validateActionEnvelope,
  serializeAction,
  deserializeAction
} from './protocol.js';
import { createSignalingTransport, generatePeerId } from './signaling.js';
import { globalKvRegistry } from './kv-room-registry.js';

export class PeerMeshManager {
  /**
   * @param {Object} [options={}]
   */
  constructor(options = {}) {
    this.peerId = options.peerId || generatePeerId();
    this.peerName = options.peerName || 'Archon_' + this.peerId.slice(-4).toUpperCase();
    this.roomCode = null;
    this.isHost = false;
    this.localSeat = null; // 'ruby' | 'cyan' | 'amber'

    this.transport = null;
    this.latencies = new Map(); // peerId -> latency in ms

    // Initialize clean 3-seat allocation map
    this._resetSeats();

    this.listeners = {
      seatState: new Set(),
      action: new Set(),
      peerJoin: new Set(),
      peerLeave: new Set(),
      latency: new Set(),
      gameStart: new Set(),
      chat: new Set()
    };
  }

  /**
   * Returns current local player's faction ('ruby' | 'cyan' | 'amber').
   * @returns {string}
   */
  getLocalFaction() {
    return GO_FIRST_TO_FACTION[this.localSeat] || 'ruby';
  }

  _resetSeats() {
    const defaultSeat = (die, isAI = true, aiType = 'CYCLIC_EXPLOITER') => ({
      peerId: null,
      name: null,
      isAI,
      aiType,
      ready: false,
      die,
      faction: GO_FIRST_TO_FACTION[die]
    });
    this.seats = {
      G1: defaultSeat('G1', false, null),
      G2: defaultSeat('G2', true, 'MAX_EV'),
      G3: defaultSeat('G3', true, 'SHARD_TACTICIAN')
    };
  }

  /**
   * Connects to a room mesh as Host or Joining Peer.
   * @param {string} roomCode
   * @param {boolean} [isHost=false]
   * @param {string} [peerName]
   * @param {Object} [transportOptions={}]
   * @param {string} [initialDie='G1'] - Chosen Go-First die ('G1', 'G2', 'G3')
   */
  connect(roomCode, isHost = false, peerName = null, transportOptions = {}, initialDie = 'G1') {
    if (this.transport) {
      this.disconnect();
    }

    this._resetSeats();
    this.roomCode = roomCode.toUpperCase();
    this.isHost = isHost;
    if (peerName) this.peerName = peerName;

    this.transport = createSignalingTransport(this.roomCode, this.peerId, transportOptions);

    // If host, auto-claim chosen Go-First die seat
    if (this.isHost) {
      const hostDie = initialDie.startsWith('G') ? initialDie : (FACTION_TO_GO_FIRST[initialDie] || 'G1');
      const hostFaction = GO_FIRST_TO_FACTION[hostDie] || 'ruby';
      this.localSeat = hostDie;
      const hostSeatData = {
        peerId: this.peerId,
        name: this.peerName,
        isAI: false,
        aiType: null,
        ready: true,
        die: hostDie,
        faction: hostFaction
      };
      this.seats[hostDie] = hostSeatData;
    }

    // Set up transport handlers
    this.transport.onPeerJoin((remotePeerId) => {
      console.log(`[Mesh] Peer joined room ${this.roomCode}: ${remotePeerId}`);
      for (const cb of this.listeners.peerJoin) cb(remotePeerId);

      // Announce hello
      const hello = createActionEnvelope(ACTION_TYPES.PEER_HELLO, this.localSeat, {
        peerId: this.peerId,
        peerName: this.peerName,
        isHost: this.isHost
      });
      this.transport.send(serializeAction(hello), remotePeerId);

      // If host, broadcast full current seat map to newcomer
      if (this.isHost) {
        this.broadcastSeatState();
      }
    });

    this.transport.onPeerLeave((remotePeerId) => {
      console.log(`[Mesh] Peer left: ${remotePeerId}`);
      this.latencies.delete(remotePeerId);
      for (const cb of this.listeners.peerLeave) cb(remotePeerId);

      // If host, vacate seat or convert to AI
      if (this.isHost) {
        for (const d of ['G1', 'G2', 'G3']) {
          if (this.seats[d]?.peerId === remotePeerId) {
            console.log(`[Mesh] Vacating seat ${d} left by peer ${remotePeerId}`);
            const faction = GO_FIRST_TO_FACTION[d];
            const botSeat = {
              peerId: null,
              name: 'AI Bot',
              isAI: true,
              aiType: d === 'G1' ? 'CYCLIC_EXPLOITER' : d === 'G2' ? 'MAX_EV' : 'SHARD_TACTICIAN',
              ready: true,
              die: d,
              faction
            };
            this.seats[d] = botSeat;
          }
        }
        this.broadcastSeatState();
      }
    });

    this.transport.onMessage((raw, fromPeerId) => {
      this._handleIncomingAction(raw, fromPeerId);
    });

    // Start latency ping interval
    this._pingTimer = setInterval(() => this._measureLatency(), 4000);
    if (this._pingTimer && typeof this._pingTimer.unref === 'function') {
      this._pingTimer.unref();
    }

    // Initial announce
    const hello = createActionEnvelope(ACTION_TYPES.PEER_HELLO, this.localSeat, {
      peerId: this.peerId,
      peerName: this.peerName,
      isHost: this.isHost
    });
    this.transport.broadcast(serializeAction(hello));

    this._notifySeatState();
  }

  _measureLatency() {
    if (!this.transport) return;
    const peers = this.transport.getConnectedPeers();
    const pingAction = createActionEnvelope(ACTION_TYPES.PING, this.localSeat, {
      t: Date.now()
    }, { peerId: this.peerId });

    for (const pid of peers) {
      this.transport.send(serializeAction(pingAction), pid);
    }
  }

  _handleIncomingAction(rawAction, fromPeerId) {
    let envelope;
    try {
      envelope = typeof rawAction === 'string' ? deserializeAction(rawAction) : rawAction;
    } catch (err) {
      console.warn('[Mesh] Invalid envelope received from peer:', err);
      return;
    }

    // Ping / Pong handlers
    if (envelope.type === ACTION_TYPES.PING) {
      const pong = createActionEnvelope(ACTION_TYPES.PONG, this.localSeat, {
        originalTimestamp: envelope.payload.t
      }, { peerId: this.peerId });
      this.transport.send(serializeAction(pong), fromPeerId);
      return;
    }

    if (envelope.type === ACTION_TYPES.PONG) {
      const rtt = Date.now() - envelope.payload.originalTimestamp;
      this.latencies.set(fromPeerId, Math.round(rtt / 2));
      for (const cb of this.listeners.latency) {
        cb(fromPeerId, Math.round(rtt / 2));
      }
      return;
    }

    // Peer Hello
    if (envelope.type === ACTION_TYPES.PEER_HELLO) {
      if (this.isHost) {
        this.broadcastSeatState();
      }
      return;
    }

    // Seat Claim (Host processes requests)
    if (envelope.type === ACTION_TYPES.SEAT_CLAIM) {
      if (this.isHost) {
        const { peerId, peerName, seat, die } = envelope.payload;
        const rawDie = die || seat || 'G1';
        const targetDie = rawDie.startsWith('G') ? rawDie : (FACTION_TO_GO_FIRST[rawDie] || 'G1');
        const targetFaction = GO_FIRST_TO_FACTION[targetDie] || 'ruby';

        // Vacate any prior seat claimed by this peer
        for (const d of ['G1', 'G2', 'G3']) {
          if (d !== targetDie && this.seats[d]?.peerId === peerId) {
            this.seats[d] = {
              peerId: null,
              name: null,
              isAI: false,
              aiType: null,
              ready: false,
              die: d,
              faction: GO_FIRST_TO_FACTION[d]
            };
          }
        }

        if (this.seats[targetDie]?.peerId === null || this.seats[targetDie]?.peerId === peerId || this.seats[targetDie]?.isAI) {
          const seatData = {
            peerId,
            name: peerName || `Player (${targetDie})`,
            isAI: false,
            aiType: null,
            ready: true,
            die: targetDie,
            faction: targetFaction
          };
          this.seats[targetDie] = seatData;

          this.broadcastSeatState();
          globalKvRegistry.claimSeat(this.roomCode, targetDie, peerId, peerName);

          // Strict 3-Player Auto-Start Trigger:
          // All 3 distinct human players must be seated with non-null unique peerIds
          const activeHumans = ['G1', 'G2', 'G3']
            .map(d => this.seats[d])
            .filter(s => s && s.peerId && !s.isAI);

          const distinctHumanPeerIds = new Set(activeHumans.map(s => s.peerId));

          if (activeHumans.length === 3 && distinctHumanPeerIds.size === 3) {
            console.log('[Mesh] All 3 distinct Go-First human players joined! Launching match automatically.');
            const startEnvelope = createActionEnvelope(ACTION_TYPES.GAME_START, null, {
              mode: 'CYCLIC_SHOWDOWN',
              targetScore: 5,
              seats: this.seats,
              timestamp: Date.now()
            });
            this.broadcastAction(startEnvelope);
            globalKvRegistry.deleteRoom(this.roomCode);

            for (const cb of this.listeners.gameStart) {
              cb(startEnvelope.payload);
            }
          } else {
            console.log(`[Mesh] Waiting for 3rd player (current distinct humans: ${distinctHumanPeerIds.size}/3)`);
          }
        }
      }
      return;
    }

    // Seat State broadcast from Host
    if (envelope.type === ACTION_TYPES.SEAT_STATE) {
      if (envelope.payload.seats) {
        const raw = envelope.payload.seats;
        const g1 = raw.G1 || raw.ruby || { peerId: null, name: null, isAI: false, ready: false, die: 'G1', faction: 'ruby' };
        const g2 = raw.G2 || raw.cyan || { peerId: null, name: null, isAI: false, ready: false, die: 'G2', faction: 'cyan' };
        const g3 = raw.G3 || raw.amber || { peerId: null, name: null, isAI: false, ready: false, die: 'G3', faction: 'amber' };
        this.seats = {
          G1: g1,
          G2: g2,
          G3: g3
        };
        // Determine local seat
        this.localSeat = null;
        for (const d of ['G1', 'G2', 'G3']) {
          if (this.seats[d]?.peerId === this.peerId) {
            this.localSeat = d;
            break;
          }
        }
        this._notifySeatState();
      }
      return;
    }

    // Game start
    if (envelope.type === ACTION_TYPES.GAME_START) {
      for (const cb of this.listeners.gameStart) cb(envelope.payload);
    }

    // Chat Message
    if (envelope.type === ACTION_TYPES.CHAT_MESSAGE) {
      for (const cb of this.listeners.chat) cb(envelope.payload);
    }

    // Notify application action listeners
    for (const cb of this.listeners.action) {
      cb(envelope, fromPeerId);
    }
  }

  /**
   * Requests to claim a specific Go-First die seat.
   * @param {string} targetSeat - 'G1', 'G2', 'G3'
   */
  claimSeat(targetSeat) {
    const dieKey = targetSeat.startsWith('G') ? targetSeat : (FACTION_TO_GO_FIRST[targetSeat] || 'G1');
    const factionKey = GO_FIRST_TO_FACTION[dieKey] || 'ruby';

    this.localSeat = dieKey;

    if (this.isHost) {
      for (const d of ['G1', 'G2', 'G3']) {
        if (d !== dieKey && this.seats[d]?.peerId === this.peerId) {
          this.seats[d] = {
            peerId: null,
            name: null,
            isAI: false,
            aiType: null,
            ready: false,
            die: d,
            faction: GO_FIRST_TO_FACTION[d]
          };
        }
      }
      const hostSeatData = {
        peerId: this.peerId,
        name: this.peerName,
        isAI: false,
        aiType: null,
        ready: true,
        die: dieKey,
        faction: factionKey
      };
      this.seats[dieKey] = hostSeatData;
      this.localSeat = dieKey;
      this.broadcastSeatState();
      globalKvRegistry.claimSeat(this.roomCode, dieKey, this.peerId, this.peerName);
    } else {
      const claim = createActionEnvelope(ACTION_TYPES.SEAT_CLAIM, dieKey, {
        die: dieKey,
        seat: dieKey,
        peerId: this.peerId,
        peerName: this.peerName
      });
      this.broadcastAction(claim);
    }
  }

  /**
   * Finds and claims first unoccupied seat.
   */
  requestAvailableSeat() {
    for (const s of ['G1', 'G2', 'G3']) {
      if (!this.seats[s].peerId || this.seats[s].isAI) {
        this.claimSeat(s);
        break;
      }
    }
  }

  /**
   * Host toggles an unoccupied seat between human open and AI Bot archetype.
   * @param {string} seat - 'G1', 'G2', 'G3'
   * @param {boolean} isAI
   * @param {string} [aiType='CYCLIC_EXPLOITER']
   */
  setSeatAI(seat, isAI, aiType = 'CYCLIC_EXPLOITER') {
    if (!this.isHost) return;
    const dieKey = seat.startsWith('G') ? seat : (FACTION_TO_GO_FIRST[seat] || 'G1');
    const factionKey = GO_FIRST_TO_FACTION[dieKey] || 'ruby';

    const seatData = isAI ? {
      peerId: null,
      name: `Bot (${aiType.replace('_', ' ')})`,
      isAI: true,
      aiType,
      ready: true,
      die: dieKey,
      faction: factionKey
    } : {
      peerId: null,
      name: 'Open Seat',
      isAI: false,
      aiType: null,
      ready: false,
      die: dieKey,
      faction: factionKey
    };

    this.seats[dieKey] = seatData;
    this.broadcastSeatState();
  }

  /**
   * Host broadcasts the authoritative 3-seat allocation map to all connected peers.
   */
  broadcastSeatState() {
    if (!this.isHost) return;
    const seatEnvelope = createActionEnvelope(ACTION_TYPES.SEAT_STATE, null, {
      seats: this.seats
    });
    this.broadcastAction(seatEnvelope);
    this._notifySeatState();
  }

  /**
   * Broadcasts an action envelope across all connected peers.
   * @param {Object} actionEnvelope
   */
  broadcastAction(actionEnvelope) {
    if (!this.transport) return;
    const serialized = serializeAction(actionEnvelope);
    this.transport.broadcast(serialized);
  }

  /**
   * Sends an action envelope to a specific peer ID.
   * @param {Object} actionEnvelope
   * @param {string} targetPeerId
   */
  sendAction(actionEnvelope, targetPeerId) {
    if (!this.transport) return;
    const serialized = serializeAction(actionEnvelope);
    this.transport.send(serialized, targetPeerId);
  }

  _notifySeatState() {
    for (const cb of this.listeners.seatState) {
      cb(this.seats, this.localSeat);
    }
  }

  onSeatChange(cb) {
    this.listeners.seatState.add(cb);
  }

  onAction(cb) {
    this.listeners.action.add(cb);
  }

  onGameStart(cb) {
    this.listeners.gameStart.add(cb);
  }

  onPeerJoin(cb) {
    this.listeners.peerJoin.add(cb);
  }

  onPeerLeave(cb) {
    this.listeners.peerLeave.add(cb);
  }

  onLatencyUpdate(cb) {
    this.listeners.latency.add(cb);
  }

  onChat(cb) {
    this.listeners.chat.add(cb);
  }

  disconnect() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    if (this.transport) {
      this.transport.leave();
      this.transport = null;
    }
    this.roomCode = null;
    this.localSeat = null;
    this.latencies.clear();
    this._resetSeats();
  }
}
