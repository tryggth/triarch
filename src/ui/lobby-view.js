/**
 * TRIARCH: Cyclic Edge - Streamlined Go-First Matchmaking Lobby UI
 * Single-view dashboard featuring Go-First die selection, real-time public room browser,
 * and waiting modal overlay with instant 3-player auto-start trigger.
 */

import { generateRoomCode } from '../network/signaling.js';
import { generateQRCodeSVG, CameraQRScanner } from './qr.js';
import { toast } from './toast.js';
import { sfx } from '../audio/sfx.js';
import { haptics } from '../audio/haptics.js';
import { ACTION_TYPES, createActionEnvelope, GO_FIRST_TO_FACTION, FACTION_TO_GO_FIRST } from '../network/protocol.js';
import { globalKvRegistry } from '../network/kv-room-registry.js';
import { GO_FIRST_DICE } from '../math/dice.js';

export class MultiplayerLobbyModal {
  /**
   * @param {import('../network/peer-mesh.js').PeerMeshManager} meshManager
   * @param {import('../game/network-state.js').NetworkGameStateAdapter} netAdapter
   */
  constructor(meshManager, netAdapter) {
    this.mesh = meshManager;
    this.net = netAdapter;
    this.modal = null;
    this.waitingModal = null;
    this.selectedHostDie = 'G1'; // 'G1' | 'G2' | 'G3'
    this.qrScanner = null;

    // Listen to mesh seat changes
    this.mesh.onSeatChange(() => {
      if (this.isWaitingModalOpen()) {
        this.renderWaitingSeats();
      }
      if (this.mesh.isHost && this.mesh.roomCode) {
        globalKvRegistry.updateRoomDebounced(this.mesh.roomCode, {
          seats: this.mesh.seats
        });
      }
    });

    // Auto-dismiss lobby and waiting modal when game starts
    this.mesh.onGameStart(() => {
      console.log('[Lobby] Received GAME_START. Auto-dismissing waiting modal.');
      this.close();
      this.closeWaitingModal();
    });

    this.mesh.onLatencyUpdate((peerId, rtt) => {
      const badge = document.getElementById(`latency-${peerId}`);
      if (badge) {
        badge.textContent = `${rtt}ms`;
        badge.className = `text-[10px] font-mono px-1.5 py-0.5 rounded-full ${rtt < 80 ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`;
      }
    });
  }

  isOpen() {
    return this.modal !== null;
  }

  isWaitingModalOpen() {
    return this.waitingModal !== null;
  }

  open(prefilledRoomCode = null) {
    if (this.modal) this.close();
    if (this.waitingModal) this.closeWaitingModal();

    // Subscribe to live room updates from JetStream KV / localStorage
    if (this._unsubscribeRooms) {
      this._unsubscribeRooms();
      this._unsubscribeRooms = null;
    }
    this._unsubscribeRooms = globalKvRegistry.onRoomsUpdate(() => {
      if (this.isOpen()) {
        this.loadAndRenderRooms();
      }
    });

    // Start 2-second polling loop while modal is open
    if (this._discoveryPollTimer) {
      clearInterval(this._discoveryPollTimer);
      this._discoveryPollTimer = null;
    }
    this._discoveryPollTimer = setInterval(() => {
      if (this.isOpen()) {
        this.loadAndRenderRooms();
      }
    }, 2000);

    const overlay = document.createElement('div');
    overlay.id = 'lobby-modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl animate-fade-in overflow-y-auto';

    overlay.innerHTML = `
      <div class="w-full max-w-3xl rounded-3xl border border-indigo-500/40 bg-slate-950 p-6 sm:p-8 shadow-2xl space-y-6 transform transition-all animate-scale-in my-8">
        
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl">🌐</span>
            <div>
              <h2 class="text-xl font-bold text-white font-cinzel tracking-wider">Multiplayer Mesh Lobby</h2>
              <p class="text-xs font-mono text-slate-400">Die-Driven Matchmaking & Instant 3-Player P2P Arena</p>
            </div>
          </div>
          <button id="btn-close-lobby" class="text-slate-400 hover:text-white text-2xl font-bold px-2 py-1">&times;</button>
        </div>

        <!-- Section 1: Create a Game Panel -->
        <div class="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">👑</span>
              <h3 class="text-xs font-bold uppercase tracking-wider text-white font-mono">Create New Match</h3>
            </div>
            <span class="text-[11px] font-mono text-slate-400">Step 1: Pick your Go-First Die</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div class="sm:col-span-8">
              <label for="input-game-name" class="block text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold mb-1">
                Game / Room Title:
              </label>
              <input type="text" id="input-game-name" maxlength="32" value="Archon Arena #${Math.floor(100 + Math.random() * 900)}" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-indigo-500 placeholder:text-slate-600" />
            </div>
            <div class="sm:col-span-4 flex items-end">
              <button id="btn-launch-lobby" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-bold font-mono text-xs tracking-wider shadow-[0_0_20px_#6366f150] transition-all">
                👑 Launch Room ➔
              </button>
            </div>
          </div>

          <!-- 3-Button Go-First Die Selector -->
          <div class="space-y-1.5">
            <span class="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Select Your Go-First Initiative Die:</span>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3" id="host-die-selector-group">
              
              <!-- G1 Die Button -->
              <button type="button" data-die="G1" class="die-select-btn p-3 rounded-xl border text-left transition-all ${this.selectedHostDie === 'G1' ? 'border-rose-500 bg-rose-950/40 shadow-[0_0_15px_#f43f5e30]' : 'border-slate-800 bg-slate-950/60 opacity-70 hover:opacity-100'}">
                <div class="flex items-center justify-between">
                  <span class="font-mono font-bold text-xs text-rose-400">🔺 Go-First G1</span>
                  <span class="text-[10px] font-mono text-rose-300/80">Ruby Archon</span>
                </div>
                <div class="text-[11px] font-mono font-bold text-white mt-1">{1, 5, 10, 11, 13, 17}</div>
                <div class="text-[10px] font-mono text-slate-400 mt-0.5">Sum: 57 · High ceiling</div>
              </button>

              <!-- G2 Die Button -->
              <button type="button" data-die="G2" class="die-select-btn p-3 rounded-xl border text-left transition-all ${this.selectedHostDie === 'G2' ? 'border-cyan-500 bg-cyan-950/40 shadow-[0_0_15px_#06b6d430]' : 'border-slate-800 bg-slate-950/60 opacity-70 hover:opacity-100'}">
                <div class="flex items-center justify-between">
                  <span class="font-mono font-bold text-xs text-cyan-400">🔷 Go-First G2</span>
                  <span class="text-[10px] font-mono text-cyan-300/80">Cyan Sentinel</span>
                </div>
                <div class="text-[11px] font-mono font-bold text-white mt-1">{3, 4, 7, 12, 15, 16}</div>
                <div class="text-[10px] font-mono text-slate-400 mt-0.5">Sum: 57 · Balanced mid</div>
              </button>

              <!-- G3 Die Button -->
              <button type="button" data-die="G3" class="die-select-btn p-3 rounded-xl border text-left transition-all ${this.selectedHostDie === 'G3' ? 'border-amber-500 bg-amber-950/40 shadow-[0_0_15px_#eab30830]' : 'border-slate-800 bg-slate-950/60 opacity-70 hover:opacity-100'}">
                <div class="flex items-center justify-between">
                  <span class="font-mono font-bold text-xs text-amber-400">🟡 Go-First G3</span>
                  <span class="text-[10px] font-mono text-amber-300/80">Amber Keeper</span>
                </div>
                <div class="text-[11px] font-mono font-bold text-white mt-1">{2, 6, 8, 9, 14, 18}</div>
                <div class="text-[10px] font-mono text-slate-400 mt-0.5">Sum: 57 · Stable spread</div>
              </button>

            </div>
          </div>
        </div>

        <!-- Section 2: Available Games Grid (Die-Driven Matchmaking) -->
        <div class="space-y-3 p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm">🌐</span>
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">Available Public Games</h3>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Live Discovery Active</span>
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-toggle-manual-code" class="text-xs font-mono text-slate-400 hover:text-slate-200">
                # Join by Code
              </button>
              <button id="btn-refresh-rooms" class="text-xs font-mono text-indigo-400 hover:text-indigo-200 flex items-center gap-1">
                <span>🔄</span> Refresh
              </button>
            </div>
          </div>

          <!-- Manual Code Form (Collapsible) -->
          <div id="manual-code-wrapper" class="hidden p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div class="flex gap-2">
              <input type="text" id="input-direct-room-code" maxlength="7" placeholder="ENTER CODE (TR-9X)" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-indigo-500 tracking-wider" />
              <button id="btn-direct-join-submit" class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold font-mono text-xs text-white">
                Connect
              </button>
            </div>
          </div>

          <!-- Available Rooms Container -->
          <div id="available-rooms-list" class="space-y-2 max-h-56 overflow-y-auto pr-1">
            <div class="text-xs font-mono text-slate-500 text-center py-6">
              Scanning JetStream room registry for active matches...
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
    this.modal = overlay;

    // Listeners
    overlay.querySelector('#btn-close-lobby').onclick = () => this.close();

    // Die Select Buttons
    overlay.querySelectorAll('.die-select-btn').forEach((btn) => {
      btn.onclick = () => {
        sfx.playClick();
        haptics.light();
        this.selectedHostDie = btn.getAttribute('data-die');
        overlay.querySelectorAll('.die-select-btn').forEach((b) => {
          const isSelected = b.getAttribute('data-die') === this.selectedHostDie;
          const dieKey = b.getAttribute('data-die');
          const colorClass = dieKey === 'G1' ? 'border-rose-500 bg-rose-950/40' : dieKey === 'G2' ? 'border-cyan-500 bg-cyan-950/40' : 'border-amber-500 bg-amber-950/40';
          b.className = `die-select-btn p-3 rounded-xl border text-left transition-all ${isSelected ? `${colorClass} shadow-md` : 'border-slate-800 bg-slate-950/60 opacity-70 hover:opacity-100'}`;
        });
      };
    });

    // Launch Lobby Button
    overlay.querySelector('#btn-launch-lobby').onclick = async () => {
      sfx.playClick();
      haptics.light();
      const gameNameInput = overlay.querySelector('#input-game-name');
      const gameName = gameNameInput ? gameNameInput.value.trim() : 'Archon Arena';
      const newRoomCode = generateRoomCode();

      const hostFaction = GO_FIRST_TO_FACTION[this.selectedHostDie] || 'ruby';
      const hostName = `Player 1 (${this.selectedHostDie})`;

      this.mesh.connect(newRoomCode, true, hostName, {}, this.selectedHostDie);
      this.net.isMultiplayer = true;

      // Register room in KV registry
      try {
        await globalKvRegistry.createRoom(newRoomCode, this.mesh.peerId, {
          gameName,
          hostDie: this.selectedHostDie,
          hostName,
          seats: {
            [this.selectedHostDie]: { peerId: this.mesh.peerId, name: hostName, claimed: true, faction: hostFaction, isAI: false }
          }
        });
      } catch (e) {}

      this.close();
      this.openWaitingModal(newRoomCode, gameName);
    };

    // Toggle Manual Code Form
    const manualToggle = overlay.querySelector('#btn-toggle-manual-code');
    const manualWrapper = overlay.querySelector('#manual-code-wrapper');
    manualToggle.onclick = () => {
      manualWrapper.classList.toggle('hidden');
    };

    // Direct Join Submit
    overlay.querySelector('#btn-direct-join-submit').onclick = () => {
      const codeInput = overlay.querySelector('#input-direct-room-code');
      const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      if (!code) {
        toast.show('Please enter a room code (e.g. TR-9X)', 'warning');
        return;
      }
      this.joinRoomWithDie(code, 'G2');
    };

    // Refresh Rooms
    overlay.querySelector('#btn-refresh-rooms').onclick = () => {
      sfx.playClick();
      this.loadAndRenderRooms();
    };

    this.loadAndRenderRooms();
    setTimeout(() => this.loadAndRenderRooms(), 150);
    setTimeout(() => this.loadAndRenderRooms(), 500);

    if (prefilledRoomCode) {
      this.joinRoomWithDie(prefilledRoomCode, 'G2');
    }
  }

  async loadAndRenderRooms() {
    if (!this.modal) return;
    const listEl = this.modal.querySelector('#available-rooms-list');
    if (!listEl) return;

    try {
      const rooms = await globalKvRegistry.listActiveRooms({ onlyWaiting: true });

      if (rooms.length === 0) {
        listEl.innerHTML = `
          <div class="text-xs font-mono text-slate-500 text-center py-6 bg-slate-950/40 rounded-xl border border-slate-800/80">
            No active open games found. Create one above to launch an arena match!
          </div>
        `;
        return;
      }

      listEl.innerHTML = rooms.map((r) => {
        const minutesAgo = Math.max(0, Math.round((Date.now() - r.updatedAt) / 60000));
        const timeBadge = minutesAgo === 0 ? 'Just now' : `${minutesAgo}m ago`;
        const seats = r.seats || {};

        const renderDieBadge = (dieKey, color, name) => {
          const s = seats[dieKey];
          const isClaimed = s && s.claimed;
          if (isClaimed) {
            return `
              <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 text-[10px] font-mono cursor-not-allowed opacity-60">
                ${dieKey}: ${s.name || 'Taken'} 🔒
              </span>
            `;
          }
          return `
            <button data-join-room="${r.roomCode}" data-claim-die="${dieKey}" class="px-2.5 py-1 rounded-lg bg-${color}-950/80 hover:bg-${color}-900 border border-${color}-500/50 text-${color}-300 text-[10px] font-mono font-bold transition-all shadow-sm flex items-center gap-1">
              <span>⚡ Claim ${dieKey}</span>
            </button>
          `;
        };

        return `
          <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500/40 transition-colors space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-bold font-mono text-sm text-white">${r.gameName || r.roomCode}</span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-700">
                  ${r.roomCode}
                </span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full ${r.playerCount >= 2 ? 'bg-amber-950 text-amber-300' : 'bg-emerald-950 text-emerald-300'}">
                  ${r.playerCount}/3 Archons
                </span>
              </div>
              <span class="text-[10px] font-mono text-slate-500">${timeBadge}</span>
            </div>

            <!-- Go-First Die Claim Strip -->
            <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-900">
              <span class="text-[10px] font-mono text-slate-400">Claim Seat:</span>
              ${renderDieBadge('G1', 'rose', 'Ruby')}
              ${renderDieBadge('G2', 'cyan', 'Cyan')}
              ${renderDieBadge('G3', 'amber', 'Amber')}
            </div>
          </div>
        `;
      }).join('');

      // Wire interactive claim buttons
      listEl.querySelectorAll('button[data-join-room]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const roomCode = btn.getAttribute('data-join-room');
          const dieKey = btn.getAttribute('data-claim-die');
          this.joinRoomWithDie(roomCode, dieKey);
        });
      });
    } catch (err) {
      listEl.innerHTML = `
        <div class="text-xs font-mono text-slate-500 text-center py-6">
          Discovery registry standby mode. Enter code manually above.
        </div>
      `;
    }
  }

  /**
   * Connects to a room and claims the selected Go-First die.
   * @param {string} roomCode
   * @param {string} dieKey - 'G1', 'G2', 'G3'
   */
  async joinRoomWithDie(roomCode, dieKey = 'G2') {
    sfx.playClick();
    haptics.light();
    const code = roomCode.toUpperCase();
    const peerName = `Player (${dieKey})`;
    const targetFaction = GO_FIRST_TO_FACTION[dieKey] || 'cyan';

    this.mesh.connect(code, false, peerName);
    this.net.isMultiplayer = true;

    // Dispatch seat claim
    setTimeout(() => {
      this.mesh.claimSeat(targetFaction);
    }, 150);

    // Update KV registry
    try {
      await globalKvRegistry.claimSeat(code, dieKey, this.mesh.peerId, peerName);
    } catch (e) {}

    toast.show(`Joined Room ${code} as ${dieKey}!`, 'success', 2500);
    this.close();
    this.openWaitingModal(code, `Archon Arena (${code})`);
  }

  /**
   * Opens the Waiting Modal for < 3 players.
   * @param {string} roomCode
   * @param {string} gameName
   */
  openWaitingModal(roomCode, gameName) {
    if (this.waitingModal) this.closeWaitingModal();

    const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    const qrSvg = generateQRCodeSVG(joinUrl, 140);

    const overlay = document.createElement('div');
    overlay.id = 'waiting-modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl animate-fade-in overflow-y-auto';

    overlay.innerHTML = `
      <div class="w-full max-w-2xl rounded-3xl border border-indigo-500/50 bg-slate-950 p-6 sm:p-8 shadow-[0_0_50px_#6366f130] space-y-6 transform transition-all animate-scale-in my-8">
        
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xl">⚔️</span>
              <h2 class="text-lg sm:text-xl font-bold text-white font-cinzel tracking-wider">${gameName}</h2>
            </div>
            <p class="text-xs font-mono text-slate-400 mt-0.5">Waiting for 3 Archons to Claim Go-First Dice...</p>
          </div>
          <button id="btn-close-waiting" class="text-slate-400 hover:text-white text-2xl font-bold px-2 py-1">&times;</button>
        </div>

        <!-- Room Code & QR Card -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div class="sm:col-span-4 flex justify-center">
            ${qrSvg}
          </div>
          <div class="sm:col-span-8 space-y-2">
            <div>
              <span class="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Room Access Code</span>
              <div class="text-2xl sm:text-3xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-cyan-300 to-amber-300 tracking-wider">
                ${roomCode}
              </div>
            </div>
            <p class="text-xs text-slate-400 leading-relaxed">
              Share this code or QR with peers. The match begins instantly when all 3 seats are filled!
            </p>
            <button id="btn-copy-waiting-link" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-indigo-300 border border-slate-700 transition-all flex items-center gap-1.5">
              📋 Copy Join Link
            </button>
          </div>
        </div>

        <!-- 3-Player Live Waiting Slots -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Go-First Dice Pods (3 Seats)</h3>
            <span class="text-[11px] font-mono text-indigo-400 animate-pulse">● Live Synchronization Active</span>
          </div>
          <div id="waiting-seats-grid" class="grid grid-cols-1 sm:grid-cols-3 gap-3"></div>
        </div>

        <!-- Footer / Host Override -->
        <div class="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
          <div class="text-xs font-mono text-slate-400">
            Status: <span id="waiting-status-label" class="text-amber-400 font-bold">Waiting for 3 players... (1/3)</span>
          </div>
          ${this.mesh.isHost ? `
            <button id="btn-force-start-ai" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-300 transition-all">
              🤖 Fill Open Seats with Bots & Start
            </button>
          ` : ''}
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
    this.waitingModal = overlay;

    // Listeners
    overlay.querySelector('#btn-close-waiting').onclick = () => {
      if (this.mesh.isHost && this.mesh.roomCode) {
        globalKvRegistry.deleteRoom(this.mesh.roomCode);
      }
      this.mesh.disconnect();
      this.closeWaitingModal();
    };

    overlay.querySelector('#btn-copy-waiting-link').onclick = () => {
      sfx.playClick();
      navigator.clipboard.writeText(joinUrl).then(() => {
        toast.show('Join URL copied to clipboard!', 'success', 2000);
      });
    };

    const forceStartBtn = overlay.querySelector('#btn-force-start-ai');
    if (forceStartBtn) {
      forceStartBtn.onclick = () => {
        sfx.playClick();
        // Fill open seats with AI
        for (const s of ['G1', 'G2', 'G3']) {
          if (!this.mesh.seats[s]?.peerId) {
            this.mesh.seats[s].isAI = true;
            this.mesh.seats[s].name = `Bot_${s}`;
          }
        }
        const startEnvelope = createActionEnvelope(ACTION_TYPES.GAME_START, null, {
          mode: 'CYCLIC_SHOWDOWN',
          targetScore: 5,
          seats: this.mesh.seats,
          timestamp: Date.now()
        });
        this.mesh.broadcastAction(startEnvelope);
        this.net.isMultiplayer = true;
        this.net.game.startMatch({
          rubyAI: this.mesh.seats.G1?.isAI,
          cyanAI: this.mesh.seats.G2?.isAI,
          amberAI: this.mesh.seats.G3?.isAI
        });
        this.closeWaitingModal();
        toast.show('Match Started with AI Bots!', 'success', 2500);
      };
    }

    this.renderWaitingSeats();
  }

  renderWaitingSeats() {
    if (!this.waitingModal) return;
    const container = this.waitingModal.querySelector('#waiting-seats-grid');
    if (!container) return;

    const pods = [
      { dieKey: 'G1', faction: 'ruby', name: 'Go-First G1', color: '#fb7185', bg: 'rgba(251, 113, 133, 0.1)', border: 'rgba(251, 113, 133, 0.4)' },
      { dieKey: 'G2', faction: 'cyan', name: 'Go-First G2', color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.1)', border: 'rgba(34, 211, 238, 0.4)' },
      { dieKey: 'G3', faction: 'amber', name: 'Go-First G3', color: '#facc15', bg: 'rgba(250, 204, 21, 0.1)', border: 'rgba(250, 204, 21, 0.4)' }
    ];

    container.innerHTML = pods.map((p) => {
      const seatData = this.mesh.seats[p.dieKey];
      const isLocal = this.mesh.localSeat === p.dieKey || this.mesh.localSeat === p.faction;
      const isClaimed = seatData && (seatData.peerId || seatData.isAI);

      return `
        <div class="p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${!isClaimed ? 'animate-pulse' : ''}" style="background: ${p.bg}; border-color: ${p.border};">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono font-bold" style="color: ${p.color}">${p.dieKey} (${p.name})</span>
              ${isLocal ? '<span class="px-1.5 py-0.2 rounded-md bg-indigo-950 border border-indigo-500/50 text-indigo-300 text-[10px] font-mono font-bold">YOU</span>' : ''}
            </div>
            <div class="text-sm font-bold text-white mt-1 truncate">
              ${isClaimed ? (seatData.isAI ? `🤖 ${seatData.name}` : `👤 ${seatData.name || 'Player'}`) : '⏳ Waiting for Player...'}
            </div>
          </div>
          <div class="text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-800/60">
            ${isClaimed ? '✅ Seat Locked & Ready' : '⭕ Awaiting peer connection...'}
          </div>
        </div>
      `;
    }).join('');

    // Update dynamic status label
    const humanCount = ['G1', 'G2', 'G3'].filter(s => this.mesh.seats[s]?.peerId && !this.mesh.seats[s]?.isAI).length;
    const distinctHumans = new Set(['G1', 'G2', 'G3'].map(s => this.mesh.seats[s]?.peerId).filter(Boolean)).size;
    const count = Math.min(humanCount, distinctHumans);
    const statusLabel = this.waitingModal.querySelector('#waiting-status-label');
    if (statusLabel) {
      if (count === 3) {
        statusLabel.textContent = 'All 3 players ready! Launching...';
        statusLabel.className = 'text-emerald-400 font-bold';
      } else {
        statusLabel.textContent = `Waiting for 3 players... (${count}/3 connected)`;
        statusLabel.className = 'text-amber-400 font-bold';
      }
    }
  }

  closeWaitingModal() {
    if (this.waitingModal) {
      this.waitingModal.remove();
      this.waitingModal = null;
    }
  }

  close() {
    if (this._discoveryPollTimer) {
      clearInterval(this._discoveryPollTimer);
      this._discoveryPollTimer = null;
    }
    if (this._unsubscribeRooms) {
      this._unsubscribeRooms();
      this._unsubscribeRooms = null;
    }
    if (this.qrScanner) {
      this.qrScanner.stop();
      this.qrScanner = null;
    }
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
}
