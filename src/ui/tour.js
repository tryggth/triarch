/**
 * TRIARCH: Cyclic Edge - Guided Tour & Onboarding Engine
 * First-time player interactive walkthrough inspired by BourbakiMesh & Hex MCTS.
 */

import { sfx } from '../audio/sfx.js';

export const TOUR_STEPS = [
  {
    title: 'Welcome to TRIARCH: Cyclic Edge',
    badge: 'Step 1 of 4: The Cyclic Principle',
    content: `
      <p class="text-sm text-slate-300 leading-relaxed">
        <strong>TRIARCH</strong> is a strategic 3-player tabletop game rooted in <em>non-transitive probability theory</em>.
      </p>
      <p class="text-sm text-slate-400 mt-2 leading-relaxed">
        Unlike standard dice where higher average numbers always dominate, these custom dice form an immutable directed cycle:
        <span class="text-rose-400 font-bold">Ruby (A)</span> beats <span class="text-cyan-400 font-bold">Cyan (B)</span>, 
        <span class="text-cyan-400 font-bold">Cyan (B)</span> beats <span class="text-amber-400 font-bold">Amber (C)</span>, and 
        <span class="text-amber-400 font-bold">Amber (C)</span> beats <span class="text-rose-400 font-bold">Ruby (A)</span>!
      </p>
    `,
    symbol: '🔺🔷🟡'
  },
  {
    title: 'The Balanced Triad & Zero Ties',
    badge: 'Step 2 of 4: Perfect Mathematical Symmetry',
    content: `
      <p class="text-sm text-slate-300 leading-relaxed">
        All three Archon dice have an <strong>identical Expected Value of 5.0</strong> (Sum = 30):
      </p>
      <ul class="list-disc pl-5 text-xs text-slate-300 space-y-1.5 font-mono mt-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <li><strong class="text-rose-400">Ruby (A):</strong> [2, 2, 4, 4, 9, 9] (Explosive Spikes)</li>
        <li><strong class="text-cyan-400">Cyan (B):</strong> [1, 1, 6, 6, 8, 8] (Consistent Mid-High)</li>
        <li><strong class="text-amber-400">Amber (C):</strong> [3, 3, 5, 5, 7, 7] (Rock-Solid Center)</li>
      </ul>
      <p class="text-sm text-emerald-300 font-mono mt-2">
        Every pairwise clash has exactly <strong>5/9 (55.56%) win probability</strong> with <strong>0% chance of ties</strong>!
      </p>
    `,
    symbol: '⚖️'
  },
  {
    title: 'Energy Shards & Tactical Advantage',
    badge: 'Step 3 of 4: Shard Economy',
    content: `
      <p class="text-sm text-slate-300 leading-relaxed">
        Each Archon starts with <strong>2 Energy Shards</strong>. Winning rounds grants victory bounties.
      </p>
      <div class="grid grid-cols-2 gap-2 mt-2 font-mono text-xs">
        <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
          <div class="text-amber-300 font-bold">⚡ +1 Face Boost</div>
          <div class="text-slate-400 mt-0.5">Increases your rolled value by +1 for explosive upsets.</div>
        </div>
        <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
          <div class="text-cyan-300 font-bold">🛡️ Aegis Shield</div>
          <div class="text-slate-400 mt-0.5">Guarantees victory in the event of equal rolls.</div>
        </div>
      </div>
    `,
    symbol: '⚡'
  },
  {
    title: 'Math Core, Paradoxes & Offline PWA',
    badge: 'Step 4 of 4: The Discovery Suite',
    content: `
      <p class="text-sm text-slate-300 leading-relaxed">
        Explore the <strong>Math Core</strong> to inspect exact combinatorial payoff matrices, run 50,000-trial Monte Carlo tests, or explore the famous <strong>Grime 2-Dice Reversal Paradox</strong>!
      </p>
      <p class="text-xs text-slate-400 mt-2 font-mono">
        📲 Installed as a PWA, TRIARCH runs 100% offline on any desktop, tablet, or mobile device with zero latency.
      </p>
    `,
    symbol: '🚀'
  }
];

export class TourManager {
  constructor() {
    this.currentStep = 0;
    this.modal = null;
  }

  isOpen() {
    return this.modal !== null;
  }

  start() {
    this.currentStep = 0;
    this.render();
  }

  render() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }

    const step = TOUR_STEPS[this.currentStep];
    const isFirst = this.currentStep === 0;
    const isLast = this.currentStep === TOUR_STEPS.length - 1;

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in';

    overlay.innerHTML = `
      <div class="w-full max-w-lg rounded-3xl border border-indigo-500/40 bg-slate-950 p-6 sm:p-8 shadow-2xl space-y-5 transform transition-all animate-scale-in">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${step.symbol}</span>
            <div>
              <span class="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-400">${step.badge}</span>
              <h3 class="text-lg font-bold text-white">${step.title}</h3>
            </div>
          </div>
          <button id="btn-tour-close" class="text-slate-400 hover:text-white text-lg font-bold px-2 py-1">&times;</button>
        </div>

        <div class="tour-body space-y-3">
          ${step.content}
        </div>

        <div class="flex items-center justify-between pt-4 border-t border-slate-800/80">
          <button id="btn-tour-prev" class="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-300 hover:bg-slate-800 transition-all ${isFirst ? 'opacity-40 pointer-events-none' : ''}">
            ◀ Previous
          </button>
          
          <div class="flex gap-1.5">
            ${TOUR_STEPS.map((_, i) => `
              <span class="w-2 h-2 rounded-full ${i === this.currentStep ? 'bg-indigo-500 shadow-[0_0_8px_#6366f1]' : 'bg-slate-800'}"></span>
            `).join('')}
          </div>

          <button id="btn-tour-next" class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-mono font-bold text-white transition-all shadow-[0_0_15px_#6366f160]">
            ${isLast ? 'Enter Arena ⚔️' : 'Next ▶'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modal = overlay;

    // Attach listeners
    overlay.querySelector('#btn-tour-close').onclick = () => this.close();
    overlay.querySelector('#btn-tour-prev').onclick = () => {
      sfx.playClick();
      if (this.currentStep > 0) {
        this.currentStep--;
        this.render();
      }
    };
    overlay.querySelector('#btn-tour-next').onclick = () => {
      sfx.playClick();
      if (isLast) {
        this.close();
        localStorage.setItem('triarch_tour_completed', 'true');
      } else {
        this.currentStep++;
        this.render();
      }
    };
  }

  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
}

export const tour = new TourManager();
