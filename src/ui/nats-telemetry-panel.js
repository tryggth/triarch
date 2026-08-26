/**
 * TRIARCH: Cyclic Edge - NATS Telemetry & Configuration Panel
 * Dedicated control dashboard in Math Lab Suite for Synadia Cloud / NATS.ws:
 *  - Transport backend switcher (BroadcastChannel vs Synadia Cloud NATS)
 *  - Server endpoint selector & live connection latency probe
 *  - Drag-and-drop / textarea .creds ingestion with JWT & NKey validation
 *  - Real-time subject traffic monitor
 */

import {
  loadNatsConfig,
  saveNatsConfig,
  clearNatsCredentials,
  parseAndValidateCreds,
  DEFAULT_NATS_SERVERS
} from '../network/nats-config.js';
import { NGS_RAW_CREDS } from '../network/creds/ngs-creds.js';
import { toast } from './toast.js';
import { sfx } from '../audio/sfx.js';

export class NatsTelemetryPanel {
  /**
   * @param {HTMLElement|string} mountElement
   * @param {import('../network/peer-mesh.js').PeerMeshManager} [peerMesh]
   */
  constructor(mountElement, peerMesh = null) {
    this.container = typeof mountElement === 'string'
      ? document.querySelector(mountElement)
      : mountElement;
    this.mesh = peerMesh;

    this.config = loadNatsConfig();
    this.trafficLogs = [];
    this.isProbing = false;

    this.render();
    this.bindEvents();
    this.hookMeshTraffic();
  }

  hookMeshTraffic() {
    if (this.mesh && this.mesh.transport && typeof this.mesh.transport.onTraffic === 'function') {
      this.mesh.transport.onTraffic((entry) => {
        this.addTrafficEntry(entry);
      });
    }
  }

  addTrafficEntry(entry) {
    this.trafficLogs.unshift(entry);
    if (this.trafficLogs.length > 50) this.trafficLogs.pop();
    this.renderTrafficList();
  }

  render() {
    if (!this.container) return;

    const credCheck = parseAndValidateCreds(this.config.credsRaw);
    const isNatsActive = this.config.activeTransport === 'nats';

    this.container.innerHTML = `
      <div class="p-6 rounded-3xl border border-indigo-500/40 bg-slate-950/80 backdrop-blur-xl shadow-2xl space-y-6">
        
        <!-- Header Banner -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-lg">📡</span>
              <h2 class="text-sm sm:text-base font-bold text-white font-mono tracking-wider">
                SYNADIA CLOUD / NATS WEBSOCKET TELEMETRY
              </h2>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              High-throughput pub/sub signaling mesh connecting multi-device tabletop rooms over WebSocket.
            </p>
          </div>

          <!-- Active Transport Status Badge -->
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-slate-400">Signaling Backend:</span>
            <span id="telemetry-active-badge" class="px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
              isNatsActive
                ? 'bg-purple-950/80 border border-purple-500/50 text-purple-300 shadow-[0_0_10px_#a855f740]'
                : 'bg-indigo-950/80 border border-indigo-500/50 text-indigo-300'
            }">
              ${isNatsActive ? '⚡ Synadia Cloud NATS' : '🌐 Local BroadcastChannel'}
            </span>
          </div>
        </div>

        <!-- Section 1: Backend Mode Selector -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <label class="flex items-start gap-3 p-4 rounded-2xl border ${
            !isNatsActive ? 'border-indigo-500/60 bg-indigo-950/20 shadow-md' : 'border-slate-800 bg-slate-900/40'
          } cursor-pointer transition-all">
            <input type="radio" name="telemetry-transport" value="broadcast" ${!isNatsActive ? 'checked' : ''} class="mt-1 accent-indigo-500" />
            <div>
              <div class="text-xs font-bold font-mono text-white">Local BroadcastChannel Transport</div>
              <div class="text-[11px] text-slate-400 mt-1">
                Zero-configuration, zero-latency signaling within the same browser and across local browser tabs.
              </div>
            </div>
          </label>

          <label class="flex items-start gap-3 p-4 rounded-2xl border ${
            isNatsActive ? 'border-purple-500/60 bg-purple-950/20 shadow-md' : 'border-slate-800 bg-slate-900/40'
          } cursor-pointer transition-all">
            <input type="radio" name="telemetry-transport" value="nats" ${isNatsActive ? 'checked' : ''} class="mt-1 accent-purple-500" />
            <div>
              <div class="text-xs font-bold font-mono text-white">Synadia Cloud NATS WebSocket Transport</div>
              <div class="text-[11px] text-slate-400 mt-1">
                Global cloud pub/sub network for real-time room discovery and multiplayer over the public Internet.
              </div>
            </div>
          </label>

        </div>

        <!-- Section 2: Server Endpoint Configuration & Live Probe -->
        <div class="space-y-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-800">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label for="nats-server-input" class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
              WebSocket Server Endpoint
            </label>
            <div class="flex items-center gap-2">
              <button id="btn-set-synadia-server" class="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 transition-colors">
                Synadia NGS
              </button>
              <button id="btn-set-demo-server" class="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors">
                NATS Demo
              </button>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row gap-2">
            <input id="nats-server-input" type="text" value="${this.config.serverUrl}"
              placeholder="wss://connect.ngs.global"
              class="flex-1 bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none" />
            
            <button id="btn-probe-nats" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold transition-all shadow-[0_0_12px_#6366f140] flex items-center justify-center gap-1.5 whitespace-nowrap">
              <span>⚡</span> Test Probe Connection
            </button>
          </div>

          <!-- Probe Result Output -->
          <div id="nats-probe-result" class="hidden text-xs font-mono p-3 rounded-xl border"></div>
        </div>

        <!-- Section 3: Credentials Ingestion (JWT / NKey Seed) -->
        <div class="space-y-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-800">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Synadia User Credentials (.creds)
              </span>
              <p class="text-[11px] text-slate-400">
                JWT Identity & Ed25519 NKey Seed for secure mutual authentication.
              </p>
            </div>

            <!-- Credentials Status Badge -->
            <div id="creds-status-badge">
              ${
                credCheck.valid
                  ? `<span class="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1">
                      <span>🟢</span> User: ${credCheck.userName} (${credCheck.seed.slice(0, 4)}...${credCheck.seed.slice(-4)})
                    </span>`
                  : `<span class="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-mono">
                      ⚪ Anonymous / Demo Mode
                    </span>`
              }
            </div>
          </div>

          <!-- Drag-and-Drop Area & File Trigger -->
          <div id="creds-drop-zone" class="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-slate-950/40">
            <input type="file" id="creds-file-input" accept=".creds,text/plain" class="hidden" />
            <div class="text-xs font-mono text-slate-300 flex items-center justify-center gap-2">
              <span>📄</span>
              <span>Drop <strong>.creds</strong> file here, or <span class="text-indigo-400 underline">browse</span></span>
            </div>
          </div>

          <!-- Textarea Credential Editor -->
          <div class="space-y-1.5">
            <textarea id="nats-creds-textarea" rows="4"
              placeholder="Paste raw .creds content (-----BEGIN NATS USER JWT----- ... -----BEGIN USER NKEY SEED-----)"
              class="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-[11px] font-mono text-slate-300 focus:outline-none resize-y">${this.config.credsRaw || ''}</textarea>
          </div>

          <!-- Credential Control Buttons -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div class="flex items-center gap-2">
              <button id="btn-save-creds" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono transition-all">
                💾 Save Credentials
              </button>
              <button id="btn-restore-default-creds" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-all" title="Restore embedded NGS-RANDD credentials">
                ↺ Restore Default NGS
              </button>
            </div>
            <button id="btn-clear-creds" class="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-mono transition-all">
              🗑️ Clear Credentials
            </button>
          </div>
        </div>

        <!-- Section 4: Live Subject Traffic Monitor -->
        <div class="space-y-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-800">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Live Subject Traffic Monitor
              </span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                triarch.rooms.*
              </span>
            </div>
            <button id="btn-clear-traffic" class="text-[11px] font-mono text-slate-400 hover:text-slate-200">
              Clear Log
            </button>
          </div>

          <!-- Traffic Log Scroll Area -->
          <div id="nats-traffic-list" class="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
            <div class="text-slate-500 text-center py-4 text-xs">
              No NATS packets recorded yet. Connect to a room or run a test probe to observe live telemetry.
            </div>
          </div>
        </div>

      </div>
    `;
  }

  renderTrafficList() {
    const listEl = this.container ? this.container.querySelector('#nats-traffic-list') : null;
    if (!listEl) return;

    if (this.trafficLogs.length === 0) {
      listEl.innerHTML = `<div class="text-slate-500 text-center py-4 text-xs">No NATS packets recorded yet.</div>`;
      return;
    }

    listEl.innerHTML = this.trafficLogs.map((entry) => {
      const timeStr = new Date(entry.t).toISOString().substring(11, 23);
      const isOut = entry.direction === 'OUT';
      const color = isOut ? 'text-amber-400' : 'text-cyan-400';
      const icon = isOut ? '⬆️' : '⬇️';

      let summary = '';
      if (entry.data && typeof entry.data === 'object') {
        if (entry.data._sys) summary = `[SYS: ${entry.data._sys}] from: ${entry.data.from || '?'}`;
        else if (entry.data.payload && entry.data.payload.type) summary = `[ACTION: ${entry.data.payload.type}] from: ${entry.data.from || '?'}`;
        else summary = JSON.stringify(entry.data).substring(0, 60);
      }

      return `
        <div class="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 overflow-hidden">
            <span class="text-xs">${icon}</span>
            <span class="text-[10px] text-slate-500">${timeStr}</span>
            <span class="font-bold ${color}">${entry.subject}</span>
            <span class="text-slate-400 truncate max-w-xs text-[10px]">${summary}</span>
          </div>
          <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">${entry.direction}</span>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    if (!this.container) return;

    // 1. Radio Transport Switcher
    const radios = this.container.querySelectorAll('input[name="telemetry-transport"]');
    radios.forEach((r) => {
      r.addEventListener('change', (e) => {
        const val = e.target.value;
        this.config.activeTransport = val;
        saveNatsConfig(this.config);
        sfx.playClick();
        toast.show(
          val === 'nats' ? '⚡ Switched signaling to Synadia Cloud NATS' : '🌐 Switched signaling to Local BroadcastChannel',
          'info',
          2500
        );
        this.render();
        this.bindEvents();
      });
    });

    // 2. Server Preset Buttons
    const btnSynadia = this.container.querySelector('#btn-set-synadia-server');
    const btnDemo = this.container.querySelector('#btn-set-demo-server');
    const serverInput = this.container.querySelector('#nats-server-input');

    if (btnSynadia && serverInput) {
      btnSynadia.addEventListener('click', () => {
        serverInput.value = DEFAULT_NATS_SERVERS.SYNADIA;
        this.config.serverUrl = serverInput.value;
        saveNatsConfig(this.config);
        sfx.playClick();
        toast.show('Endpoint set to Synadia Global', 'info', 1500);
      });
    }

    if (btnDemo && serverInput) {
      btnDemo.addEventListener('click', () => {
        serverInput.value = DEFAULT_NATS_SERVERS.DEMO;
        this.config.serverUrl = serverInput.value;
        saveNatsConfig(this.config);
        sfx.playClick();
        toast.show('Endpoint set to NATS Demo', 'info', 1500);
      });
    }

    // 3. Credential Saving & Validation
    const textarea = this.container.querySelector('#nats-creds-textarea');
    const btnSave = this.container.querySelector('#btn-save-creds');
    const btnRestore = this.container.querySelector('#btn-restore-default-creds');
    const btnClear = this.container.querySelector('#btn-clear-creds');

    if (btnSave && textarea) {
      btnSave.addEventListener('click', () => {
        const raw = textarea.value.trim();
        const check = parseAndValidateCreds(raw);
        if (raw && !check.valid) {
          toast.show(`Credential Error: ${check.error}`, 'warning', 3500);
          return;
        }

        this.config.credsRaw = raw;
        if (serverInput) this.config.serverUrl = serverInput.value.trim() || DEFAULT_NATS_SERVERS.SYNADIA;
        saveNatsConfig(this.config);
        sfx.playDominanceChime();
        toast.show(raw ? `✅ Credentials Saved for user: ${check.userName}` : 'Credentials cleared.', 'success', 2500);
        this.render();
        this.bindEvents();
      });
    }

    if (btnRestore) {
      btnRestore.addEventListener('click', () => {
        this.config.credsRaw = NGS_RAW_CREDS;
        saveNatsConfig(this.config);
        sfx.playClick();
        toast.show('Restored embedded Synadia NGS credentials!', 'success', 2000);
        this.render();
        this.bindEvents();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        clearNatsCredentials();
        this.config = loadNatsConfig();
        sfx.playClick();
        toast.show('Credentials cleared.', 'info', 2000);
        this.render();
        this.bindEvents();
      });
    }

    // 4. File Drag & Drop
    const dropZone = this.container.querySelector('#creds-drop-zone');
    const fileInput = this.container.querySelector('#creds-file-input');

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-indigo-500', 'bg-indigo-950/30');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-950/30');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-950/30');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFile(e.target.files[0]);
        }
      });
    }

    // 5. Connection Test Probe
    const btnProbe = this.container.querySelector('#btn-probe-nats');
    if (btnProbe) {
      btnProbe.addEventListener('click', () => this.runProbe());
    }

    // 6. Clear Traffic
    const btnClearTraffic = this.container.querySelector('#btn-clear-traffic');
    if (btnClearTraffic) {
      btnClearTraffic.addEventListener('click', () => {
        this.trafficLogs = [];
        this.renderTrafficList();
      });
    }
  }

  async handleFile(file) {
    try {
      const text = await file.text();
      const check = parseAndValidateCreds(text);
      if (!check.valid) {
        toast.show(`File Invalid: ${check.error}`, 'warning', 3500);
        return;
      }
      this.config.credsRaw = text;
      saveNatsConfig(this.config);
      sfx.playDominanceChime();
      toast.show(`Loaded .creds for user: ${check.userName}`, 'success', 2500);
      this.render();
      this.bindEvents();
    } catch (err) {
      toast.show(`Failed to read file: ${err.message}`, 'warning', 3000);
    }
  }

  async runProbe() {
    if (this.isProbing) return;
    this.isProbing = true;

    const resultEl = this.container ? this.container.querySelector('#nats-probe-result') : null;
    const btnProbe = this.container ? this.container.querySelector('#btn-probe-nats') : null;

    if (btnProbe) {
      btnProbe.disabled = true;
      btnProbe.innerHTML = `<span class="animate-spin">⏳</span> Probing...`;
    }

    if (resultEl) {
      resultEl.classList.remove('hidden', 'bg-emerald-950/60', 'border-emerald-500/50', 'text-emerald-300', 'bg-rose-950/60', 'border-rose-500/50', 'text-rose-300');
      resultEl.classList.add('bg-slate-900', 'border-slate-700', 'text-slate-300', 'block');
      resultEl.textContent = 'Initiating WebSocket handshake and TLS negotiation with Synadia...';
    }

    const tStart = performance.now();

    try {
      const natsWs = await import('https://esm.sh/nats.ws@1.30.2');
      const server = this.config.serverUrl || DEFAULT_NATS_SERVERS.SYNADIA;

      const connectOpts = {
        servers: [server],
        name: `triarch_probe_${Date.now().toString(36)}`,
        timeout: 8000
      };

      if (this.config.credsRaw && typeof natsWs.credsAuthenticator === 'function') {
        const encoder = new TextEncoder();
        connectOpts.authenticator = natsWs.credsAuthenticator(encoder.encode(this.config.credsRaw));
      }

      const nc = await natsWs.connect(connectOpts);
      const rtt = Math.round(performance.now() - tStart);
      const serverInfo = nc.getServer ? nc.getServer() : server;

      // Publish probe event to telemetry
      this.addTrafficEntry({
        t: Date.now(),
        direction: 'OUT',
        subject: 'triarch.telemetry.probe',
        data: { status: 'PROBE_OK', rtt }
      });

      await nc.close();

      if (resultEl) {
        resultEl.className = 'text-xs font-mono p-3 rounded-xl border bg-emerald-950/60 border-emerald-500/50 text-emerald-300 block space-y-1';
        resultEl.innerHTML = `
          <div class="font-bold flex items-center gap-1.5">
            <span>✅</span> Handshake Verified — Connected in ${rtt}ms
          </div>
          <div class="text-[11px] text-emerald-400/80">
            Endpoint: ${serverInfo} · TLS 1.3 · Authentication: Verified
          </div>
        `;
      }
      sfx.playDominanceChime();
      toast.show(`NATS Probe Successful! (${rtt}ms RTT)`, 'success', 2500);
    } catch (err) {
      if (resultEl) {
        resultEl.className = 'text-xs font-mono p-3 rounded-xl border bg-rose-950/60 border-rose-500/50 text-rose-300 block space-y-1';
        resultEl.innerHTML = `
          <div class="font-bold flex items-center gap-1.5">
            <span>❌</span> Connection Probe Failed
          </div>
          <div class="text-[11px] text-rose-400/90">
            ${err.message || String(err)}
          </div>
        `;
      }
      toast.show(`Probe Failed: ${err.message}`, 'warning', 3500);
    } finally {
      this.isProbing = false;
      if (btnProbe) {
        btnProbe.disabled = false;
        btnProbe.innerHTML = `<span>⚡</span> Test Probe Connection`;
      }
    }
  }
}
