/**
 * TRIARCH: Cyclic Edge - Live Probability & Game Theory Inspector Drawer
 * Real-time Bayesian win-expectancy meters, interactive 3x3 payoff matrix,
 * and AI strategic thought process breakdowns.
 */

import { calculateLiveWinExpectancy, generateGameTheoryInsights } from '../math/inspector-math.js';
import { TRIARCH_STANDARD } from '../math/dice.js';
import { renderOddsMatrixHTML } from './components.js';
import { sfx } from '../audio/sfx.js';

export class OddsInspectorDrawer {
  /**
   * @param {import('../game/state.js').GameStateManager} gameState
   */
  constructor(gameState) {
    this.game = gameState;
    this.isOpen = false;
    this.drawerEl = null;

    this.init();
  }

  init() {
    const drawer = document.createElement('div');
    drawer.id = 'odds-inspector-drawer';
    drawer.className = 'fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-950/95 border-l border-slate-800 shadow-2xl backdrop-blur-2xl transform translate-x-full transition-transform duration-300 flex flex-col justify-between';

    drawer.innerHTML = `
      <!-- Drawer Header -->
      <div class="p-5 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">📊</span>
          <div>
            <h2 class="text-base font-bold text-white font-cinzel tracking-wider">Analytical Odds Inspector</h2>
            <p class="text-[11px] font-mono text-slate-400">Live Bayesian Win Expectancies & Game Theory</p>
          </div>
        </div>
        <button id="btn-close-inspector" class="text-slate-400 hover:text-white text-2xl font-bold p-1 leading-none">&times;</button>
      </div>

      <!-- Drawer Scrollable Content -->
      <div id="inspector-content" class="flex-1 overflow-y-auto p-5 space-y-6">
        <!-- Live Expectancy Meters -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Live Win Expectancy</h3>
            <span id="inspector-mode-tag" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30">3-Way Melee</span>
          </div>
          <div id="inspector-meters" class="space-y-2.5"></div>
        </div>

        <!-- Concealed Stance Bayesian Notice -->
        <div id="inspector-concealed-alert" class="hidden"></div>

        <!-- 3x3 Payoff Grid -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Cyclic Payoff Matrix</h3>
          <div id="inspector-matrix-wrapper"></div>
        </div>

        <!-- Game Theory Insights & AI Rationale -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Game Theory Strategy Engine</h3>
          <div id="inspector-insights" class="space-y-2"></div>
        </div>
      </div>

      <!-- Drawer Footer -->
      <div class="p-4 border-t border-slate-800/80 bg-slate-950/80 text-[11px] font-mono text-slate-500 text-center">
        Recalculates continuously across all 216 combinations
      </div>
    `;

    document.body.appendChild(drawer);
    this.drawerEl = drawer;

    drawer.querySelector('#btn-close-inspector').onclick = () => {
      sfx.playClick();
      this.close();
    };

    // Listen to game updates
    this.game.subscribe(() => {
      if (this.isOpen) {
        this.update();
      }
    });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.isOpen = true;
    if (this.drawerEl) {
      this.drawerEl.classList.remove('translate-x-full');
      this.update();
    }
  }

  close() {
    this.isOpen = false;
    if (this.drawerEl) {
      this.drawerEl.classList.add('translate-x-full');
    }
  }

  update(customOptions = {}) {
    if (!this.drawerEl) return;

    const playerStates = this.game.players;
    const odds = calculateLiveWinExpectancy(playerStates, customOptions);
    const insights = generateGameTheoryInsights(playerStates, odds);

    // 1. Render Expectancy Meters
    const metersContainer = this.drawerEl.querySelector('#inspector-meters');
    if (metersContainer) {
      const pR = odds.percentages.ruby;
      const pC = odds.percentages.cyan;
      const pA = odds.percentages.amber;
      const pT = odds.percentages.tie;

      metersContainer.innerHTML = `
        <!-- Ruby Meter -->
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-mono">
            <span class="text-rose-400 font-bold">Ruby Archon (A):</span>
            <span class="text-white font-bold">${pR}%</span>
          </div>
          <div class="h-2.5 w-full rounded-full bg-slate-900 overflow-hidden border border-slate-800">
            <div class="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full transition-all duration-500" style="width: ${pR}%;"></div>
          </div>
        </div>

        <!-- Cyan Meter -->
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-mono">
            <span class="text-cyan-400 font-bold">Cyan Sentinel (B):</span>
            <span class="text-white font-bold">${pC}%</span>
          </div>
          <div class="h-2.5 w-full rounded-full bg-slate-900 overflow-hidden border border-slate-800">
            <div class="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500" style="width: ${pC}%;"></div>
          </div>
        </div>

        <!-- Amber Meter -->
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-mono">
            <span class="text-amber-400 font-bold">Amber Keeper (C):</span>
            <span class="text-white font-bold">${pA}%</span>
          </div>
          <div class="h-2.5 w-full rounded-full bg-slate-900 overflow-hidden border border-slate-800">
            <div class="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500" style="width: ${pA}%;"></div>
          </div>
        </div>

        <!-- Ties -->
        <div class="space-y-1">
          <div class="flex justify-between text-[11px] font-mono text-slate-400">
            <span>Deadlock / Tie Rate:</span>
            <span>${pT}%</span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
            <div class="h-full bg-slate-600 rounded-full transition-all duration-500" style="width: ${pT}%;"></div>
          </div>
        </div>
      `;
    }

    // 2. Concealed Stance Alert
    const alertBox = this.drawerEl.querySelector('#inspector-concealed-alert');
    if (alertBox) {
      if (odds.isConcealedState) {
        alertBox.classList.remove('hidden');
        alertBox.innerHTML = `
          <div class="p-3 rounded-xl border border-purple-500/40 bg-purple-950/30 text-purple-200 text-xs font-mono space-y-1">
            <div class="font-bold flex items-center gap-1.5">
              <span>🔒</span> Bayesian Prior Active
            </div>
            <div class="text-[11px] text-purple-300/80">
              Concealed opponent stances are calculated over a uniform 1/3 prior mixture across the intransitive triad.
            </div>
          </div>
        `;
      } else {
        alertBox.classList.add('hidden');
      }
    }

    // 3. 3x3 Payoff Grid
    const matrixBox = this.drawerEl.querySelector('#inspector-matrix-wrapper');
    if (matrixBox) {
      matrixBox.innerHTML = renderOddsMatrixHTML(TRIARCH_STANDARD);
    }

    // 4. Strategic Insights
    const insightsBox = this.drawerEl.querySelector('#inspector-insights');
    if (insightsBox) {
      insightsBox.innerHTML = insights.map((text) => `
        <div class="p-3 rounded-xl border border-slate-800 bg-slate-900/60 text-xs text-slate-300 font-mono leading-relaxed">
          ${text}
        </div>
      `).join('');
    }
  }
}
