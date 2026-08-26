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

    // 3 Seats Allocation Map
    this.seats = {
      ruby: { peerId: null, name: 'Open (Bot)', isAI: true, aiType: 'CYCLIC_EXPLOITER', ready: false },
      cyan: { peerId: null, name: 'Open (Bot)', isAI: true, aiType: 'MAX_EV', ready: false },
      amber: { peerId: null, name: 'Open (Bot)', isAI: true, aiType: 'SHARD_TACTICIAN', ready: false }
    };

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

    this.roomCode = roomCode.toUpperCase();
    this.isHost = isHost;
    if (peerName) this.peerName = peerName;

    this.transport = createSignalingTransport(this.roomCode, this.peerId, transportOptions);

    // If host, auto-claim chosen Go-First die seat
    if (this.isHost) {
      const hostFaction = GO_FIRST_TO_FACTION[initialDie] || 'ruby';
      this.localSeat = hostFaction;
      this.seats[hostFaction] = {
        peerId: this.peerId,
        name: this.peerName,
        isAI: false,
        aiType: null,
        ready: true
      };
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
        for (const seat of SEATS) {
          if (this.seats[seat].peerId === remotePeerId) {
            console.log(`[Mesh] Vacating seat ${seat} left by peer ${remotePeerId}`);
            this.seats[seat] = {
              peerId: null,
              name: 'AI Bot',
              isAI: true,
              aiType: seat === 'ruby' ? 'CYCLIC_EXPLOITER' : seat === 'cyan' ? 'MAX_EV' : 'SHARD_TACTICIAN',
              ready: true
            };
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

    // Initial announce
    const hello = createActionEnvelope(ACTION_TYPES.PEER_HELLO, this.localSeat, {
      peerId: this.peerId,
      peerName: this.peerName,
      isHost: this.isHost
    });
    this.transport.broadcast(serializeAction(hello));

    // If joining as non-host, automatically request first available open seat
    if (!this.isHost) {
      setTimeout(() => {
        this.requestAvailableSeat();
      }, 300);
    }

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
        clientT: envelope.payload.t,
        serverT: Date.now()
      }, { peerId: this.peerId });
      this.transport.send(serializeAction(pong), fromPeerId);
      return;
    }

    if (envelope.type === ACTION_TYPES.PONG) {
      if (envelope.payload && envelope.payload.clientT) {
        const rtt = Math.max(1, Date.now() - envelope.payload.clientT);
        this.latencies.set(fromPeerId, rtt);
        for (const cb of this.listeners.latency) cb(fromPeerId, rtt);
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
        const { peerId, peerName, seat } = envelope.payload;
        const targetFaction = GO_FIRST_TO_FACTION[seat] || seat;
        if (['ruby', 'cyan', 'amber'].includes(targetFaction)) {
          if (this.seats[targetFaction].peerId === null || this.seats[targetFaction].peerId === peerId || this.seats[targetFaction].isAI) {
            this.seats[targetFaction] = {
              peerId,
              name: peerName || `Archon_${targetFaction}`,
              isAI: false,
              aiType: null,
              ready: true
            };
            this.broadcastSeatState();
            globalKvRegistry.updateRoomDebounced(this.roomCode, { seats: this.seats });

            // Auto-Start Trigger: when all 3 Go-First dice seats are claimed
            const humanCount = ['ruby', 'cyan', 'amber'].filter(s => this.seats[s].peerId && !this.seats[s].isAI).length;
            if (humanCount === 3) {
              console.log('[Mesh] All 3 Go-First dice seats claimed! Launching match automatically.');
              const startEnvelope = createActionEnvelope(ACTION_TYPES.GAME_START, null, {
                mode: 'CYCLIC_SHOWDOWN',
                targetScore: 5,
                seats: this.seats,
                timestamp: Date.now()
              });
              this.broadcastAction(startEnvelope);
              globalKvRegistry.updateRoomDebounced(this.roomCode, { status: 'ACTIVE', isFull: true, seats: this.seats });

              for (const cb of this.listeners.gameStart) {
                cb(startEnvelope.payload);
              }
            }
          }
        }
      }
      return;
    }

    // Seat State broadcast from Host
    if (envelope.type === ACTION_TYPES.SEAT_STATE) {
      if (envelope.payload.seats) {
        this.seats = envelope.payload.seats;
        // Determine local seat
        this.localSeat = null;
        for (const seat of ['ruby', 'cyan', 'amber']) {
          if (this.seats[seat]?.peerId === this.peerId) {
            this.localSeat = seat;
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
   * Requests to claim a specific Go-First die seat or faction seat.
   * @param {string} targetSeat - 'G1', 'G2', 'G3' or 'ruby', 'cyan', 'amber'
   */
  claimSeat(targetSeat) {
    const targetFaction = GO_FIRST_TO_FACTION[targetSeat] || targetSeat;
    if (!['ruby', 'cyan', 'amber'].includes(targetFaction)) return;

    if (this.isHost) {
      this.seats[targetFaction] = {
        peerId: this.peerId,
        name: this.peerName,
        isAI: false,
        aiType: null,
        ready: true
      };
      this.localSeat = targetFaction;
      this.broadcastSeatState();
      globalKvRegistry.updateRoomDebounced(this.roomCode, { seats: this.seats });
    } else {
      const claim = createActionEnvelope(ACTION_TYPES.SEAT_CLAIM, targetFaction, {
        peerId: this.peerId,
        peerName: this.peerName,
        seat: targetFaction
      });
      this.broadcastAction(claim);
    }
  }

  /**
   * Finds and claims first unoccupied seat.
   */
  requestAvailableSeat() {
    for (const s of SEATS) {
      if (!this.seats[s].peerId || this.seats[s].isAI) {
        this.claimSeat(s);
        break;
      }
    }
  }

  /**
   * Host toggles an unoccupied seat between human open and AI Bot archetype.
   * @param {string} seat
   * @param {boolean} isAI
   * @param {string} [aiType='CYCLIC_EXPLOITER']
   */
  setSeatAI(seat, isAI, aiType = 'CYCLIC_EXPLOITER') {
    if (!this.isHost || !SEATS.includes(seat)) return;

    if (isAI) {
      this.seats[seat] = {
        peerId: null,
        name: `Bot (${aiType.replace('_', ' ')})`,
        isAI: true,
        aiType,
        ready: true
      };
    } else {
      this.seats[seat] = {
        peerId: null,
        name: 'Open Seat',
        isAI: false,
        aiType: null,
        ready: false
      };
    }
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
  }
}
