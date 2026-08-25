/**
 * TRIARCH: Cyclic Edge - Historical Round Audit Ledger & Game Theory Chronicle
 * Detailed breakdown of initiative, commitments, shard expenditures, and clash resolutions.
 */

export class AuditLedgerView {
  /**
   * @param {import('../game/state.js').GameStateManager} gameState
   * @param {HTMLElement} mountElement
   */
  constructor(gameState, mountElement) {
    this.game = gameState;
    this.mount = mountElement;

    this.game.subscribe(() => this.render());
    this.render();
  }

  render() {
    if (!this.mount) return;
    const history = this.game.roundHistory || [];

    if (history.length === 0) {
      this.mount.innerHTML = `
        <div class="p-8 rounded-2xl border border-slate-800 bg-slate-950/40 text-center space-y-2">
          <div class="text-2xl">📜</div>
          <div class="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Audit Ledger Empty</div>
          <p class="text-xs text-slate-500 max-w-sm mx-auto">
            Execute combat clashes in the arena to generate an immutable game theory ledger of all rolls, stances, and shard economics.
          </p>
        </div>
      `;
      return;
    }

    const cards = history.map((rec) => {
      const winnerSeat = rec.winnerId;
      const winnerName = rec.winnerName;
      const isRuby = winnerSeat === 'ruby';
      const isCyan = winnerSeat === 'cyan';
      const isAmber = winnerSeat === 'amber';

      const winColor = isRuby ? 'text-rose-400' : isCyan ? 'text-cyan-400' : isAmber ? 'text-amber-400' : 'text-slate-400';
      const winBorder = isRuby ? 'border-rose-500/40 bg-rose-950/20' : isCyan ? 'border-cyan-500/40 bg-cyan-950/20' : isAmber ? 'border-amber-500/40 bg-amber-950/20' : 'border-slate-800 bg-slate-900/30';

      return `
        <div class="p-4 rounded-2xl border ${winBorder} backdrop-blur-md space-y-3 transition-all">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300">Round ${rec.roundNumber}</span>
              <span class="text-xs font-bold ${winColor}">Winner: ${winnerName}</span>
            </div>
            <span class="text-[11px] font-mono text-slate-400">+1 Dominance Pt</span>
          </div>

          <!-- Rolls & Stances Grid -->
          <div class="grid grid-cols-3 gap-2 text-xs font-mono">
            <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div class="text-rose-400 font-bold">Ruby Archon</div>
              <div class="text-white mt-1 text-base font-black">${rec.rolls.ruby.modified} <span class="text-[10px] text-slate-500">(Raw: ${rec.rolls.ruby.raw})</span></div>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div class="text-cyan-400 font-bold">Cyan Sentinel</div>
              <div class="text-white mt-1 text-base font-black">${rec.rolls.cyan.modified} <span class="text-[10px] text-slate-500">(Raw: ${rec.rolls.cyan.raw})</span></div>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div class="text-amber-400 font-bold">Amber Keeper</div>
              <div class="text-white mt-1 text-base font-black">${rec.rolls.amber.modified} <span class="text-[10px] text-slate-500">(Raw: ${rec.rolls.amber.raw})</span></div>
            </div>
          </div>

          <!-- Resolution Justification -->
          <div class="text-[11px] font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
            ⚖️ <strong class="text-slate-200">Resolution:</strong> ${rec.reason}
          </div>
        </div>
      `;
    }).reverse().join('');

    this.mount.innerHTML = `<div class="space-y-3">${cards}</div>`;
  }
}
