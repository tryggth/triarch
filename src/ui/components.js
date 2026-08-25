/**
 * TRIARCH: Cyclic Edge - UI Components Library
 * Pure ES-module DOM renderers for HUDs, Probability Heatmaps, Action Log, and Paradox Analyzers.
 */

import { calculatePairwiseProbabilities, calculateMultiDicePairwise } from '../math/probability.js';

/**
 * Generates an interactive, color-coded Head-to-Head Payoff Matrix.
 * @param {import('../math/dice.js').Die[]} diceList
 * @returns {string} HTML string
 */
export function renderOddsMatrixHTML(diceList) {
  const n = diceList.length;

  let headers = '<th class="p-3 text-xs font-mono uppercase tracking-wider text-slate-400 text-left">Die A \\ Die B</th>';
  for (const d of diceList) {
    headers += `<th class="p-3 text-xs font-bold text-center" style="color: ${d.color}">${d.name.split(' ')[0]}</th>`;
  }

  let rows = '';
  for (let i = 0; i < n; i++) {
    const dieA = diceList[i];
    let rowCells = `<td class="p-3 text-xs font-bold font-mono whitespace-nowrap" style="color: ${dieA.color}">${dieA.name}</td>`;

    for (let j = 0; j < n; j++) {
      const dieB = diceList[j];
      if (i === j) {
        rowCells += `<td class="p-3 text-center text-xs font-mono text-slate-500 bg-slate-900/40">—</td>`;
      } else {
        const stats = calculatePairwiseProbabilities(dieA, dieB);
        const pctA = (stats.pA * 100).toFixed(1);
        const fracStr = stats.fractionA.string;

        let bgClass = 'bg-slate-900/60 text-slate-400';
        if (stats.pA > 0.5) {
          bgClass = 'bg-emerald-950/40 text-emerald-300 font-semibold border border-emerald-500/20';
        } else if (stats.pA < 0.5) {
          bgClass = 'bg-rose-950/40 text-rose-300 font-semibold border border-rose-500/20';
        }

        rowCells += `
          <td class="p-2.5 text-center text-xs font-mono transition-all duration-200 hover:scale-105 rounded-lg ${bgClass}" title="${dieA.name} vs ${dieB.name}: ${fracStr}">
            <div>${pctA}%</div>
            <div class="text-[10px] opacity-75">(${fracStr})</div>
          </td>
        `;
      }
    }
    rows += `<tr class="border-b border-slate-800/80 hover:bg-slate-800/30 transition-colors">${rowCells}</tr>`;
  }

  return `
    <div class="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 backdrop-blur-md shadow-2xl p-2">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-slate-800">${headers}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Renders a Player HUD Banner with Shards, Score, and Status.
 * @param {import('../game/state.js').PlayerState} player
 * @returns {string} HTML string
 */
export function renderPlayerHUDHTML(player) {
  const f = player.faction;
  const shardsBadges = Array.from({ length: 5 }, (_, i) => {
    const filled = i < player.shards;
    return `<span class="inline-block w-2.5 h-2.5 rounded-full transition-all duration-300 ${filled ? 'bg-amber-400 shadow-[0_0_8px_#facc15]' : 'bg-slate-800 border border-slate-700'}"></span>`;
  }).join(' ');

  const scorePips = Array.from({ length: 5 }, (_, i) => {
    const filled = i < player.score;
    return `<span class="inline-block w-3.5 h-3.5 rounded-md transition-all duration-300 ${filled ? 'bg-indigo-500 shadow-[0_0_10px_#6366f1]' : 'bg-slate-800/80 border border-slate-700'}"></span>`;
  }).join(' ');

  return `
    <div class="player-hud relative p-4 rounded-2xl border ${f.borderClass} bg-gradient-to-b ${f.bgGradient} backdrop-blur-md shadow-xl transition-all duration-300">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl flex items-center justify-center text-lg bg-slate-900/80 border border-slate-700 shadow-inner">
            ${f.symbol}
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              ${player.name}
              ${player.isAI ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">AI</span>' : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono">YOU</span>'}
            </h3>
            <div class="text-[11px] text-slate-400 font-mono">${player.currentDie.name}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase font-mono tracking-wider text-slate-400">Score</div>
          <div class="text-xl font-black font-mono text-white">${player.score}</div>
        </div>
      </div>

      <div class="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] text-slate-400">Shards:</span>
          <div class="flex gap-1">${shardsBadges}</div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] text-slate-400">Dominance:</span>
          <div class="flex gap-1">${scorePips}</div>
        </div>
      </div>

      ${player.activeShard ? `
        <div class="mt-2 text-[11px] px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono flex items-center gap-1">
          ⚡ Shard Active: ${player.activeShard}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Renders the Paradox Comparison (1 die vs 2 dice reversal).
 * @param {import('../math/dice.js').Die} dieA
 * @param {import('../math/dice.js').Die} dieB
 * @returns {string} HTML string
 */
export function renderParadoxComparisonHTML(dieA, dieB) {
  const single = calculateMultiDicePairwise(dieA, 1, dieB, 1);
  const double = calculateMultiDicePairwise(dieA, 2, dieB, 2);

  const singlePctA = (single.pA * 100).toFixed(1);
  const singlePctB = (single.pB * 100).toFixed(1);
  const doublePctA = (double.pA * 100).toFixed(1);
  const doublePctB = (double.pB * 100).toFixed(1);

  const reversed = (single.pA > single.pB && double.pB > double.pA) || (single.pB > single.pA && double.pA > double.pB);

  return `
    <div class="p-5 rounded-2xl border border-indigo-500/30 bg-slate-950/80 backdrop-blur-md shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="text-sm font-bold text-white flex items-center gap-2">
          <span>${dieA.name}</span>
          <span class="text-slate-500">vs</span>
          <span>${dieB.name}</span>
        </div>
        ${reversed ? `
          <span class="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-fuchsia-950/80 border border-fuchsia-500/50 text-fuchsia-300 animate-pulse">
            🌀 PARADOX CONFIRMED (Reversal)
          </span>
        ` : `
          <span class="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-800 text-slate-400">
            Transitive Behavior
          </span>
        `}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- 1 Die Matchup -->
        <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div class="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
            <span>Rolling 1 Die Each</span>
            <span class="text-emerald-400 font-mono font-bold">Winner: ${single.winner}</span>
          </div>
          <div class="space-y-1.5 text-xs font-mono">
            <div class="flex justify-between text-slate-300">
              <span>${dieA.name}:</span>
              <span class="${single.pA > single.pB ? 'text-emerald-400 font-bold' : 'text-slate-400'}">${singlePctA}%</span>
            </div>
            <div class="flex justify-between text-slate-300">
              <span>${dieB.name}:</span>
              <span class="${single.pB > single.pA ? 'text-emerald-400 font-bold' : 'text-slate-400'}">${singlePctB}%</span>
            </div>
          </div>
        </div>

        <!-- 2 Dice Matchup -->
        <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div class="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
            <span>Rolling 2 Dice Each (Sum)</span>
            <span class="text-fuchsia-400 font-mono font-bold">Winner: ${double.winner}</span>
          </div>
          <div class="space-y-1.5 text-xs font-mono">
            <div class="flex justify-between text-slate-300">
              <span>${dieA.name} (2x):</span>
              <span class="${double.pA > double.pB ? 'text-emerald-400 font-bold' : 'text-slate-400'}">${doublePctA}%</span>
            </div>
            <div class="flex justify-between text-slate-300">
              <span>${dieB.name} (2x):</span>
              <span class="${double.pB > double.pA ? 'text-emerald-400 font-bold' : 'text-slate-400'}">${doublePctB}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
