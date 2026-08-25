/**
 * TRIARCH: Cyclic Edge - Master Application Controller
 * Connects Game Engine, Math Core, Visualizers, Procedural Web Audio, and PWA Lifecycle.
 */

import { TRIARCH_STANDARD, DICE_PRESETS, Die } from '../math/dice.js';
import {
  calculatePairwiseProbabilities,
  calculate3WayClashProbabilities,
  runMonteCarloSimulation,
  detectIntransitiveCycles,
  calculateMultiDicePairwise
} from '../math/probability.js';
import { GameStateManager } from '../game/state.js';
import { SHARD_ITEMS, GAME_PHASES } from '../game/rules.js';
import { sfx } from '../audio/sfx.js';
import { CyclicGraphRenderer, createDiceVisual } from './visualizer.js';
import {
  renderOddsMatrixHTML,
  renderPlayerHUDHTML,
  renderParadoxComparisonHTML
} from './components.js';

class TriarchApp {
  constructor() {
    this.game = new GameStateManager();
    this.currentPresetKey = 'triarch';
    this.activeTab = 'arena';
    this.deferredPrompt = null;
    this.diceVisuals = {};
    this.graphRenderer = null;

    this.init();
  }

  init() {
    this.setupPWA();
    this.setupTabs();
    this.setupAudio();
    this.setupArena();
    this.setupSimulator();
    this.setupParadox();
    this.setupCodex();

    // Subscribe to game state
    this.game.subscribe(() => this.renderGameState());

    // Initial renders
    this.renderGameState();
    this.renderSimulatorPreset();
    this.renderParadoxPreset();

    // Handle deep-link tab parameter
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['arena', 'simulator', 'paradox', 'codex'].includes(tabParam)) {
      this.switchTab(tabParam);
    }
  }

  /* ---------------- PWA & Offline Lifecycle ---------------- */
  setupPWA() {
    const pwaBadge = document.getElementById('offline-badge');
    const installBtn = document.getElementById('btn-pwa-install');

    const updateOnlineStatus = () => {
      if (pwaBadge) {
        if (navigator.onLine) {
          pwaBadge.classList.add('hidden');
        } else {
          pwaBadge.classList.remove('hidden');
        }
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // PWA Install Prompt Capture
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.addEventListener('click', async () => {
          if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`[PWA] Install prompt outcome: ${outcome}`);
            this.deferredPrompt = null;
            installBtn.classList.add('hidden');
          }
        });
      }
    });

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('[PWA] ServiceWorker registered:', reg.scope))
          .catch((err) => console.warn('[PWA] ServiceWorker registration failed:', err));
      });
    }
  }

  /* ---------------- Tabs & Navigation ---------------- */
  setupTabs() {
    const tabs = ['arena', 'simulator', 'paradox', 'codex'];
    tabs.forEach((tab) => {
      const btn = document.getElementById(`nav-${tab}`);
      if (btn) {
        btn.addEventListener('click', () => {
          sfx.playClick();
          this.switchTab(tab);
        });
      }
    });
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    const tabs = ['arena', 'simulator', 'paradox', 'codex'];
    tabs.forEach((t) => {
      const sec = document.getElementById(`section-${t}`);
      const btn = document.getElementById(`nav-${t}`);
      if (sec) {
        sec.classList.toggle('hidden', t !== tabId);
      }
      if (btn) {
        btn.classList.toggle('border-indigo-500', t === tabId);
        btn.classList.toggle('text-indigo-400', t === tabId);
        btn.classList.toggle('text-slate-400', t !== tabId);
      }
    });

    if (tabId === 'arena' && this.graphRenderer) {
      this.graphRenderer._resize();
    }
  }

  /* ---------------- Audio Controls ---------------- */
  setupAudio() {
    const muteBtn = document.getElementById('btn-sound-toggle');
    const updateIcon = () => {
      if (muteBtn) {
        muteBtn.textContent = sfx.muted ? '🔇 Muted' : '🔊 Sound FX';
        muteBtn.classList.toggle('opacity-60', sfx.muted);
      }
    };

    updateIcon();
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const isMuted = sfx.toggleMute();
        updateIcon();
        if (!isMuted) sfx.playClick();
      });
    }
  }

  /* ---------------- Arena Setup ---------------- */
  setupArena() {
    const canvas = document.getElementById('cyclic-graph-canvas');
    if (canvas) {
      this.graphRenderer = new CyclicGraphRenderer(canvas);
    }

    // Dice containers
    const cRuby = document.getElementById('die-visual-ruby');
    const cCyan = document.getElementById('die-visual-cyan');
    const cAmber = document.getElementById('die-visual-amber');

    if (cRuby) this.diceVisuals.ruby = createDiceVisual(cRuby, TRIARCH_STANDARD[0]);
    if (cCyan) this.diceVisuals.cyan = createDiceVisual(cCyan, TRIARCH_STANDARD[1]);
    if (cAmber) this.diceVisuals.amber = createDiceVisual(cAmber, TRIARCH_STANDARD[2]);

    // Clash Button
    const rollBtn = document.getElementById('btn-arena-roll');
    if (rollBtn) {
      rollBtn.addEventListener('click', () => this.handleArenaRoll());
    }

    // Next Round Button
    const nextBtn = document.getElementById('btn-arena-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        sfx.playClick();
        this.game.nextRound();
      });
    }

    // Reset Match Button
    const resetBtn = document.getElementById('btn-arena-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        sfx.playClick();
        this.game.init();
      });
    }

    // Shard Power-Up Buttons for Human Player (Ruby)
    const btnShardMight = document.getElementById('btn-shard-might');
    const btnShardShield = document.getElementById('btn-shard-shield');

    if (btnShardMight) {
      btnShardMight.addEventListener('click', () => {
        sfx.playClick();
        this.game.activateShard('ruby', 'MIGHT');
      });
    }

    if (btnShardShield) {
      btnShardShield.addEventListener('click', () => {
        sfx.playClick();
        this.game.activateShard('ruby', 'SHIELD');
      });
    }
  }

  async handleArenaRoll() {
    const rollBtn = document.getElementById('btn-arena-roll');
    if (rollBtn) rollBtn.disabled = true;

    sfx.playDiceRoll();

    // Execute game state clash
    const clashRecord = this.game.executeClash();

    // Animate visual dice
    const rRoll = clashRecord.rolls.ruby.raw;
    const cRoll = clashRecord.rolls.cyan.raw;
    const aRoll = clashRecord.rolls.amber.raw;

    let completedCount = 0;
    const checkDone = () => {
      completedCount++;
      if (completedCount === 3) {
        sfx.playClash();
        if (clashRecord.winnerId) {
          sfx.playDominanceChime();
        }
        if (rollBtn) rollBtn.disabled = false;
      }
    };

    if (this.diceVisuals.ruby) this.diceVisuals.ruby.roll(rRoll, checkDone);
    if (this.diceVisuals.cyan) this.diceVisuals.cyan.roll(cRoll, checkDone);
    if (this.diceVisuals.amber) this.diceVisuals.amber.roll(aRoll, checkDone);

    // Highlight winning directed edge if winner exists
    if (clashRecord.winnerId && this.graphRenderer) {
      if (clashRecord.winnerId === 'ruby') this.graphRenderer.highlightEdge('ruby', 'cyan');
      else if (clashRecord.winnerId === 'cyan') this.graphRenderer.highlightEdge('cyan', 'amber');
      else if (clashRecord.winnerId === 'amber') this.graphRenderer.highlightEdge('amber', 'ruby');
    }
  }

  renderGameState() {
    const hudRuby = document.getElementById('hud-ruby');
    const hudCyan = document.getElementById('hud-cyan');
    const hudAmber = document.getElementById('hud-amber');

    if (hudRuby) hudRuby.innerHTML = renderPlayerHUDHTML(this.game.players.ruby);
    if (hudCyan) hudCyan.innerHTML = renderPlayerHUDHTML(this.game.players.cyan);
    if (hudAmber) hudAmber.innerHTML = renderPlayerHUDHTML(this.game.players.amber);

    // Turn info & Round Header
    const roundBanner = document.getElementById('arena-round-banner');
    if (roundBanner) {
      roundBanner.textContent = `Round ${this.game.roundNumber} / ${this.game.mode.maxRounds} — Target: ${this.game.mode.targetScore} Pts`;
    }

    // Action / Next Round Controls
    const rollBtn = document.getElementById('btn-arena-roll');
    const nextBtn = document.getElementById('btn-arena-next');
    const resultBox = document.getElementById('arena-result-box');

    if (this.game.phase === GAME_PHASES.DEPLOY) {
      if (rollBtn) rollBtn.classList.remove('hidden');
      if (nextBtn) nextBtn.classList.add('hidden');
      if (resultBox) resultBox.classList.add('hidden');
    } else if (this.game.phase === GAME_PHASES.RESOLUTION) {
      if (rollBtn) rollBtn.classList.add('hidden');
      if (nextBtn) nextBtn.classList.remove('hidden');
      if (resultBox && this.game.lastClashResult) {
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = `
          <div class="p-4 rounded-xl border border-indigo-500/40 bg-slate-900/90 text-center shadow-lg animate-fade-in">
            <div class="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">Round ${this.game.lastClashResult.roundNumber} Resolution</div>
            <div class="text-base font-bold text-white mt-1">${this.game.lastClashResult.reason}</div>
            <div class="text-xs font-mono text-slate-400 mt-2">
              Rolls: Ruby <span class="text-rose-400 font-bold">${this.game.lastClashResult.rolls.ruby.modified}</span> · 
              Cyan <span class="text-cyan-400 font-bold">${this.game.lastClashResult.rolls.cyan.modified}</span> · 
              Amber <span class="text-amber-400 font-bold">${this.game.lastClashResult.rolls.amber.modified}</span>
            </div>
          </div>
        `;
      }
    } else if (this.game.phase === GAME_PHASES.GAME_OVER) {
      if (rollBtn) rollBtn.classList.add('hidden');
      if (nextBtn) nextBtn.classList.add('hidden');
      if (resultBox && this.game.winner) {
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = `
          <div class="p-6 rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-amber-950/80 to-slate-950 text-center shadow-2xl animate-bounce">
            <div class="text-2xl font-black text-amber-300">👑 MATCH VICTORY! 👑</div>
            <div class="text-lg font-bold text-white mt-2">${this.game.winner.name} has claimed the Triarch Cyclic Throne!</div>
            <div class="text-xs font-mono text-amber-200/80 mt-2">Dominance Points: ${this.game.winner.score} / ${this.game.mode.targetScore}</div>
          </div>
        `;
      }
    }

    // Render Round History
    const historyContainer = document.getElementById('arena-history-list');
    if (historyContainer) {
      if (this.game.roundHistory.length === 0) {
        historyContainer.innerHTML = `<div class="text-xs text-slate-500 font-mono text-center py-4">No clashes recorded yet. Roll to initiate combat!</div>`;
      } else {
        historyContainer.innerHTML = this.game.roundHistory.map((rec) => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono">
            <span class="text-slate-400 font-bold">R${rec.roundNumber}</span>
            <span class="text-slate-300">${rec.reason}</span>
            <span class="font-bold" style="color: ${rec.winnerId === 'ruby' ? '#fb7185' : rec.winnerId === 'cyan' ? '#22d3ee' : rec.winnerId === 'amber' ? '#facc15' : '#94a3b8'}">
              +1 ${rec.winnerName}
            </span>
          </div>
        `).reverse().join('');
      }
    }
  }

  /* ---------------- Math Simulator Setup ---------------- */
  setupSimulator() {
    const presetSelect = document.getElementById('sim-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        sfx.playClick();
        this.currentPresetKey = e.target.value;
        this.renderSimulatorPreset();
      });
    }

    // Monte Carlo Test Button
    const btnMonteCarlo = document.getElementById('btn-run-monte-carlo');
    if (btnMonteCarlo) {
      btnMonteCarlo.addEventListener('click', () => {
        sfx.playClick();
        this.runLiveMonteCarlo();
      });
    }
  }

  renderSimulatorPreset() {
    const preset = DICE_PRESETS[this.currentPresetKey] || DICE_PRESETS.triarch;
    const matrixContainer = document.getElementById('sim-odds-matrix');
    const diceInfoContainer = document.getElementById('sim-dice-cards');
    const cycleAlert = document.getElementById('sim-cycle-alert');

    if (matrixContainer) {
      matrixContainer.innerHTML = renderOddsMatrixHTML(preset.dice);
    }

    if (diceInfoContainer) {
      diceInfoContainer.innerHTML = preset.dice.map((d) => `
        <div class="p-4 rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur-md shadow-lg space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold" style="color: ${d.color}">${d.name}</span>
            <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">EV: ${d.expectedValue().toFixed(2)}</span>
          </div>
          <div class="text-xs font-mono text-slate-400">Faces: ${d.toFaceString()}</div>
          <div class="text-xs text-slate-400">${d.description}</div>
          <div class="text-[11px] font-mono text-slate-500 flex justify-between pt-2 border-t border-slate-800/60">
            <span>Var: ${d.variance().toFixed(2)}</span>
            <span>SD: ${d.standardDeviation().toFixed(2)}</span>
          </div>
        </div>
      `).join('');
    }

    if (cycleAlert) {
      const graph = detectIntransitiveCycles(preset.dice);
      if (graph.isIntransitive) {
        cycleAlert.innerHTML = `
          <div class="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <span class="text-base">✅</span>
            <div>
              <div class="font-bold">Intransitive Cycle Verified (${graph.cycles.length} Directed Cycle Detected)</div>
              <div class="text-emerald-400/80 mt-0.5">${graph.cycles.map(c => c.formatted).join(' | ')}</div>
            </div>
          </div>
        `;
      } else {
        cycleAlert.innerHTML = `
          <div class="p-4 rounded-xl border border-slate-700 bg-slate-900/40 text-slate-400 text-xs font-mono">
            ℹ️ Transitive linear ranking (No directed cycles found).
          </div>
        `;
      }
    }
  }

  runLiveMonteCarlo() {
    const preset = DICE_PRESETS[this.currentPresetKey] || DICE_PRESETS.triarch;
    const d1 = preset.dice[0];
    const d2 = preset.dice[1];
    const output = document.getElementById('mc-results-output');

    if (!output) return;

    output.innerHTML = `<div class="text-xs font-mono text-indigo-400 animate-pulse">Running 50,000 empirical roll showdowns...</div>`;

    setTimeout(() => {
      const exact = calculatePairwiseProbabilities(d1, d2);
      const mc = runMonteCarloSimulation(d1, d2, 50000);

      output.innerHTML = `
        <div class="p-4 rounded-xl border border-indigo-500/30 bg-slate-900/80 space-y-2 text-xs font-mono text-slate-300">
          <div class="font-bold text-white flex justify-between">
            <span>${d1.name} vs ${d2.name}</span>
            <span class="text-emerald-400">N = 50,000 Trials</span>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-2">
            <div>
              <div class="text-slate-500">Exact Analytical P(A > B):</div>
              <div class="text-sm font-bold text-indigo-300">${(exact.pA * 100).toFixed(3)}% (${exact.fractionA.string})</div>
            </div>
            <div>
              <div class="text-slate-500">Monte Carlo Empirical P:</div>
              <div class="text-sm font-bold text-emerald-300">${(mc.pEmpiricalA * 100).toFixed(3)}%</div>
            </div>
          </div>
          <div class="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
            Standard Error: ${mc.seA.toFixed(5)} · 99.9% CI: [${(mc.confidence999A[0] * 100).toFixed(2)}%, ${(mc.confidence999A[1] * 100).toFixed(2)}%]
          </div>
        </div>
      `;
    }, 150);
  }

  /* ---------------- Paradox Explorer Setup ---------------- */
  setupParadox() {
    this.renderParadoxPreset();
  }

  renderParadoxPreset() {
    const container = document.getElementById('paradox-comparisons-list');
    if (!container) return;

    // Compare all 5 consecutive pairs of Grime Dice
    const grime = DICE_PRESETS.grime.dice;
    const comparisons = [
      [grime[0], grime[1]], // Red vs Blue
      [grime[1], grime[2]], // Blue vs Olive
      [grime[2], grime[3]], // Olive vs Yellow
      [grime[3], grime[4]], // Yellow vs Magenta
      [grime[4], grime[0]]  // Magenta vs Red
    ];

    container.innerHTML = comparisons.map(([dA, dB]) => renderParadoxComparisonHTML(dA, dB)).join('');
  }

  /* ---------------- Codex Setup ---------------- */
  setupCodex() {
    // Codex tab contains static markdown/HTML documentation
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.triarchApp = new TriarchApp();
});
