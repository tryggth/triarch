/**
 * TRIARCH: Cyclic Edge - Multiplayer Lobby & WebRTC Mesh UI
 * Glassmorphic modal supporting instant room creation, SVG QR code generation,
 * camera QR scanner, live 3-seat claiming, latency badges, and bot toggles.
 */

import { generateRoomCode } from '../network/signaling.js';
import { generateQRCodeSVG, CameraQRScanner } from './qr.js';
import { toast } from './toast.js';
import { sfx } from '../audio/sfx.js';
import { ACTION_TYPES, createActionEnvelope } from '../network/protocol.js';

export class MultiplayerLobbyModal {
  /**
   * @param {import('../network/peer-mesh.js').PeerMeshManager} meshManager
   * @param {import('../game/network-state.js').NetworkGameStateAdapter} netAdapter
   */
  constructor(meshManager, netAdapter) {
    this.mesh = meshManager;
    this.net = netAdapter;
    this.modal = null;
    this.activeSubTab = 'host'; // 'host' | 'join'
    this.qrScanner = null;

    // Listen to mesh seat changes
    this.mesh.onSeatChange(() => {
      if (this.isOpen()) {
        this.renderSeats();
      }
    });

    this.mesh.onLatencyUpdate((peerId, rtt) => {
      if (this.isOpen()) {
        const badge = document.getElementById(`latency-${peerId}`);
        if (badge) {
          badge.textContent = `${rtt}ms`;
          badge.className = `text-[10px] font-mono px-1.5 py-0.5 rounded-full ${rtt < 80 ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`;
        }
      }
    });
  }

  isOpen() {
    return this.modal !== null;
  }

  open(prefilledRoomCode = null) {
    if (this.modal) this.close();

    if (prefilledRoomCode) {
      this.activeSubTab = 'join';
    }

    const overlay = document.createElement('div');
    overlay.id = 'lobby-modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl animate-fade-in overflow-y-auto';

    const joinUrl = prefilledRoomCode
      ? `${window.location.origin}${window.location.pathname}?room=${prefilledRoomCode}`
      : `${window.location.origin}${window.location.pathname}?room=${this.mesh.roomCode || generateRoomCode()}`;

    overlay.innerHTML = `
      <div class="w-full max-w-2xl rounded-3xl border border-indigo-500/40 bg-slate-950 p-6 sm:p-8 shadow-2xl space-y-6 transform transition-all animate-scale-in my-8">
        
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl">🌐</span>
            <div>
              <h2 class="text-xl font-bold text-white font-cinzel tracking-wider">Multiplayer Mesh Lobby</h2>
              <p class="text-xs font-mono text-slate-400">Zero-Backend 3-Node WebRTC Peer-to-Peer Discovery</p>
            </div>
          </div>
          <button id="btn-close-lobby" class="text-slate-400 hover:text-white text-2xl font-bold px-2 py-1">&times;</button>
        </div>

        <!-- Mode Toggle Tabs -->
        <div class="flex space-x-2 border-b border-slate-800/80 pb-2">
          <button id="tab-btn-host" class="px-4 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl transition-all ${this.activeSubTab === 'host' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-white'}">
            👑 Host Room
          </button>
          <button id="tab-btn-join" class="px-4 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl transition-all ${this.activeSubTab === 'join' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-white'}">
            🔗 Join Room / Scan QR
          </button>
        </div>

        <!-- Content Area -->
        <div id="lobby-tab-content"></div>

      </div>
    `;

    document.body.appendChild(overlay);
    this.modal = overlay;

    // Listeners
    overlay.querySelector('#btn-close-lobby').onclick = () => this.close();
    overlay.querySelector('#tab-btn-host').onclick = () => {
      sfx.playClick();
      this.activeSubTab = 'host';
      this.render();
    };
    overlay.querySelector('#tab-btn-join').onclick = () => {
      sfx.playClick();
      this.activeSubTab = 'join';
      this.render();
    };

    this.render(prefilledRoomCode);
  }

  render(prefilledRoomCode = null) {
    if (!this.modal) return;
    const content = this.modal.querySelector('#lobby-tab-content');

    if (this.activeSubTab === 'host') {
      this.renderHostView(content);
    } else {
      this.renderJoinView(content, prefilledRoomCode);
    }
  }

  renderHostView(container) {
    if (!this.mesh.roomCode || !this.mesh.isHost) {
      const newRoomCode = generateRoomCode();
      this.mesh.connect(newRoomCode, true, 'Ruby Archon (Host)');
    }

    const roomCode = this.mesh.roomCode;
    const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    const qrSvg = generateQRCodeSVG(joinUrl, 160);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Room Code & QR Discovery Card -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div class="sm:col-span-4 flex justify-center">
            ${qrSvg}
          </div>
          <div class="sm:col-span-8 space-y-3">
            <div>
              <span class="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Room Access Code</span>
              <div class="text-2xl sm:text-3xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-cyan-300 to-amber-300 tracking-wider">
                ${roomCode}
              </div>
            </div>
            <p class="text-xs text-slate-400 leading-relaxed">
              Share this code or let peers scan the QR code to join this 3-player mesh directly from their browser or mobile device.
            </p>
            <div class="flex items-center gap-2">
              <button id="btn-copy-link" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-indigo-300 border border-slate-700 transition-all flex items-center gap-1.5">
                📋 Copy Join URL
              </button>
            </div>
          </div>
        </div>

        <!-- 3-Player Seating Grid -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Archon Seats (3 Players)</h3>
            <span class="text-[11px] font-mono text-slate-400">Host assigns open seats or AI bots</span>
          </div>
          <div id="lobby-seats-container" class="grid grid-cols-1 sm:grid-cols-3 gap-3"></div>
        </div>

        <!-- Start Match Button -->
        <div class="pt-2 flex items-center justify-between border-t border-slate-800">
          <div class="text-xs font-mono text-slate-400">
            Connected: <span class="text-emerald-400 font-bold">${this.mesh.transport ? this.mesh.transport.getConnectedPeers().length + 1 : 1}/3 Archons</span>
          </div>
          <button id="btn-host-start-match" class="px-8 py-3 rounded-2xl bg-gradient-to-r from-rose-500 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-bold font-mono text-sm tracking-wider shadow-[0_0_25px_#6366f160] transition-all">
            ⚔️ Launch 3-Way Match
          </button>
        </div>
      </div>
    `;

    // Attach listeners
    container.querySelector('#btn-copy-link').onclick = () => {
      sfx.playClick();
      navigator.clipboard.writeText(joinUrl).then(() => {
        toast.show('Room join URL copied to clipboard!', 'success', 2000);
      });
    };

    container.querySelector('#btn-host-start-match').onclick = () => {
      sfx.playClick();
      const startEnvelope = createActionEnvelope(ACTION_TYPES.GAME_START, 'ruby', {
        mode: 'CYCLIC_SHOWDOWN',
        targetScore: 5,
        timestamp: Date.now()
      });
      this.mesh.broadcastAction(startEnvelope);
      this.net.isMultiplayer = true;
      this.net.game.init({
        rubyAI: this.mesh.seats.ruby.isAI,
        cyanAI: this.mesh.seats.cyan.isAI,
        amberAI: this.mesh.seats.amber.isAI
      });
      this.close();
      toast.show('3-Player Mesh Match Started!', 'success', 3000);
      sfx.playDominanceChime();
    };

    this.renderSeats();
  }

  renderJoinView(container, prefilledRoomCode) {
    const defaultCode = prefilledRoomCode || '';

    container.innerHTML = `
      <div class="space-y-6">
        <div class="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div>
            <label for="input-room-code" class="block text-xs font-mono font-bold text-slate-300 uppercase tracking-wider mb-1">
              Enter 4-Letter Room Code:
            </label>
            <div class="flex gap-2">
              <input type="text" id="input-room-code" maxlength="7" value="${defaultCode}" placeholder="TR-9X" class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white uppercase focus:outline-none focus:border-indigo-500 tracking-widest placeholder:text-slate-600" />
              <button id="btn-join-room-submit" class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold font-mono text-sm text-white transition-all shadow-[0_0_15px_#6366f150]">
                Join Mesh ➔
              </button>
            </div>
          </div>

          <!-- Camera QR Scanner Section -->
          <div class="pt-2 border-t border-slate-800">
            <button id="btn-toggle-camera-scan" class="text-xs font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5">
              <span>📷</span> Scan QR Code with Device Camera
            </button>
            <div id="camera-scanner-wrapper" class="hidden mt-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center">
              <video id="qr-video-stream" class="w-full max-w-sm rounded-xl aspect-video bg-black object-cover"></video>
              <button id="btn-stop-camera" class="mt-2 text-xs font-mono text-rose-400 hover:underline">Stop Camera</button>
            </div>
          </div>
        </div>

        <!-- Seating Status (if connected) -->
        ${this.mesh.roomCode ? `
          <div class="space-y-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Current Room: ${this.mesh.roomCode}</h3>
            <div id="lobby-seats-container" class="grid grid-cols-1 sm:grid-cols-3 gap-3"></div>
          </div>
        ` : ''}
      </div>
    `;

    const input = container.querySelector('#input-room-code');
    const joinBtn = container.querySelector('#btn-join-room-submit');
    const camToggle = container.querySelector('#btn-toggle-camera-scan');
    const camWrapper = container.querySelector('#camera-scanner-wrapper');
    const camStop = container.querySelector('#btn-stop-camera');
    const video = container.querySelector('#qr-video-stream');

    joinBtn.onclick = () => {
      sfx.playClick();
      const code = input.value.trim().toUpperCase();
      if (!code) {
        toast.show('Please enter a valid room code (e.g. TR-9X)', 'warning');
        return;
      }
      this.mesh.connect(code, false, 'Cyan Sentinel (Peer)');
      this.net.isMultiplayer = true;
      toast.show(`Connecting to room ${code}...`, 'info', 2500);
      this.render();
    };

    camToggle.onclick = async () => {
      sfx.playClick();
      camWrapper.classList.remove('hidden');
      try {
        this.qrScanner = new CameraQRScanner(video, (scannedUrl) => {
          console.log('[QR] Scanned URL:', scannedUrl);
          const match = scannedUrl.match(/room=([A-Z0-9-]+)/i);
          if (match) {
            input.value = match[1];
            this.qrScanner.stop();
            camWrapper.classList.add('hidden');
            joinBtn.click();
          }
        });
        await this.qrScanner.start();
      } catch (err) {
        toast.show('Could not access camera: ' + err.message, 'error', 3000);
        camWrapper.classList.add('hidden');
      }
    };

    camStop.onclick = () => {
      if (this.qrScanner) this.qrScanner.stop();
      camWrapper.classList.add('hidden');
    };

    if (this.mesh.roomCode) {
      this.renderSeats();
    }
  }

  renderSeats() {
    if (!this.modal) return;
    const container = this.modal.querySelector('#lobby-seats-container');
    if (!container) return;

    const seatColors = {
      ruby: { border: 'border-rose-500/40', bg: 'bg-rose-950/20', text: 'text-rose-400', symbol: '🔺', title: 'Ruby Archon' },
      cyan: { border: 'border-cyan-500/40', bg: 'bg-cyan-950/20', text: 'text-cyan-400', symbol: '🔷', title: 'Cyan Sentinel' },
      amber: { border: 'border-amber-500/40', bg: 'bg-amber-950/20', text: 'text-amber-400', symbol: '🟡', title: 'Amber Keeper' }
    };

    container.innerHTML = ['ruby', 'cyan', 'amber'].map((s) => {
      const seatData = this.mesh.seats[s];
      const cfg = seatColors[s];
      const isMe = this.mesh.localSeat === s;
      const rtt = seatData.peerId ? this.mesh.latencies.get(seatData.peerId) : null;

      return `
        <div class="p-3.5 rounded-2xl border ${cfg.border} ${cfg.bg} backdrop-blur-md flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xl">${cfg.symbol}</span>
              <div>
                <div class="text-xs font-bold ${cfg.text}">${cfg.title}</div>
                <div class="text-[11px] font-mono text-slate-300 flex items-center gap-1">
                  <span>${seatData.name}</span>
                  ${isMe ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-mono">YOU</span>' : ''}
                </div>
              </div>
            </div>
            ${rtt ? `<span id="latency-${seatData.peerId}" class="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300">${rtt}ms</span>` : ''}
          </div>

          <!-- Seat Claim or Bot Switch Controls -->
          <div class="pt-2 border-t border-slate-800/60 flex items-center justify-between">
            ${this.mesh.isHost && s !== 'ruby' ? `
              <button class="btn-toggle-seat-ai text-[10px] font-mono px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors" data-seat="${s}">
                ${seatData.isAI ? `🤖 AI: ${seatData.aiType?.split('_')[0]}` : '👤 Human'}
              </button>
            ` : `
              <span class="text-[10px] font-mono text-slate-500">
                ${seatData.isAI ? '🤖 Automated Bot' : '👤 Connected Peer'}
              </span>
            `}

            ${!isMe && (!seatData.peerId || seatData.isAI) ? `
              <button class="btn-claim-seat text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors" data-seat="${s}">
                Claim Seat
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach seat action buttons
    container.querySelectorAll('.btn-claim-seat').forEach((btn) => {
      btn.onclick = () => {
        sfx.playClick();
        const seat = btn.getAttribute('data-seat');
        this.mesh.claimSeat(seat);
        toast.show(`Claimed seat: ${seatColors[seat].title}`, 'success', 1500);
      };
    });

    container.querySelectorAll('.btn-toggle-seat-ai').forEach((btn) => {
      btn.onclick = () => {
        sfx.playClick();
        const seat = btn.getAttribute('data-seat');
        const currentAI = this.mesh.seats[seat].isAI;
        this.mesh.setSeatAI(seat, !currentAI, 'CYCLIC_EXPLOITER');
      };
    });
  }

  close() {
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
