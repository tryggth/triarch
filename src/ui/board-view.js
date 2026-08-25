/**
 * TRIARCH: Cyclic Edge - Central Board Battlefield & 3D Dice Engine
 * Renders the Penrose Tri-Die watermark background and provides realistic
 * CSS 3D preserved transform tumbling dice cubes for both Go-First and Combat dice.
 */

import { sfx } from '../audio/sfx.js';

export class BoardStageManager {
  /**
   * @param {HTMLElement} containerElement
   */
  constructor(containerElement) {
    this.container = containerElement;
    this.diceCubes = {}; // 'ruby', 'cyan', 'amber'
    this.isClashing = false;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="relative w-full overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/80 via-slate-950/95 to-slate-950 p-6 sm:p-8 shadow-2xl">
        
        <!-- Center Penrose Tri-Die SVG Watermark -->
        <div id="board-watermark" class="pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-700 select-none overflow-hidden" style="opacity: 0.07; mix-blend-mode: screen;">
          <img src="triarch.svg" alt="TRIARCH Watermark" class="w-4/5 max-w-[480px] aspect-square animate-spin-slow" />
        </div>

        <!-- Battlefield Arena Content Layer -->
        <div class="relative z-10 space-y-6">
          
          <!-- 3D Tumbling Combat Dice Stage -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 items-center justify-items-center py-4">
            <div id="stage-die-ruby" class="flex flex-col items-center gap-3"></div>
            <div id="stage-die-cyan" class="flex flex-col items-center gap-3"></div>
            <div id="stage-die-amber" class="flex flex-col items-center gap-3"></div>
          </div>

          <!-- Round Outcome Announcement Banner -->
          <div id="stage-clash-banner" class="hidden transform transition-all duration-300"></div>

        </div>

      </div>
    `;

    // Initialize 3D Cube Dice
    this.diceCubes.ruby = new CSS3DDiceCube(
      this.container.querySelector('#stage-die-ruby'),
      'ruby',
      'Ruby Archon (A)',
      [2, 2, 4, 4, 9, 9],
      '#fb7185',
      'from-rose-500 to-rose-700'
    );

    this.diceCubes.cyan = new CSS3DDiceCube(
      this.container.querySelector('#stage-die-cyan'),
      'cyan',
      'Cyan Sentinel (B)',
      [1, 1, 6, 6, 8, 8],
      '#22d3ee',
      'from-cyan-500 to-cyan-700'
    );

    this.diceCubes.amber = new CSS3DDiceCube(
      this.container.querySelector('#stage-die-amber'),
      'amber',
      'Amber Keeper (C)',
      [3, 3, 5, 5, 7, 7],
      '#facc15',
      'from-amber-400 to-amber-600'
    );
  }

  /**
   * Triggers realistic 3D tumbling animations for all 3 dice cubes simultaneously.
   * @param {Object} rolls - { ruby: { raw, modified }, cyan: {...}, amber: {...} }
   * @param {Function} onComplete
   */
  async rollCombatShowdown(rolls, onComplete) {
    this.setWatermarkActive(true);
    sfx.playDiceRoll();

    const pRuby = this.diceCubes.ruby.rollToFace(rolls.ruby.raw, rolls.ruby.modified);
    const pCyan = this.diceCubes.cyan.rollToFace(rolls.cyan.raw, rolls.cyan.modified);
    const pAmber = this.diceCubes.amber.rollToFace(rolls.amber.raw, rolls.amber.modified);

    await Promise.all([pRuby, pCyan, pAmber]);
    this.setWatermarkActive(false);

    if (onComplete) onComplete();
  }

  /**
   * Elevates watermark opacity and energy during active clashes.
   */
  setWatermarkActive(active) {
    const wm = this.container.querySelector('#board-watermark');
    if (wm) {
      wm.style.opacity = active ? '0.14' : '0.07';
      wm.style.transform = active ? 'scale(1.04)' : 'scale(1)';
    }
  }

  showResult(reason, winnerId) {
    const banner = this.container.querySelector('#stage-clash-banner');
    if (!banner) return;

    banner.classList.remove('hidden');
    let bg = 'bg-slate-900/90 border-slate-700 text-slate-200';
    if (winnerId === 'ruby') bg = 'bg-rose-950/80 border-rose-500/50 text-rose-200 shadow-[0_0_20px_#f43f5e30]';
    else if (winnerId === 'cyan') bg = 'bg-cyan-950/80 border-cyan-500/50 text-cyan-200 shadow-[0_0_20px_#06b6d430]';
    else if (winnerId === 'amber') bg = 'bg-amber-950/80 border-amber-500/50 text-amber-200 shadow-[0_0_20px_#eab30830]';

    banner.innerHTML = `
      <div class="p-4 rounded-2xl border ${bg} text-center space-y-1 backdrop-blur-xl animate-scale-in">
        <div class="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">Clash Outcome</div>
        <div class="text-base font-bold">${reason}</div>
      </div>
    `;
  }

  hideResult() {
    const banner = this.container.querySelector('#stage-clash-banner');
    if (banner) banner.classList.add('hidden');
  }
}

/**
 * High-Fidelity CSS 3D Preserved Transform Cube (`transform-style: preserve-3d`)
 */
export class CSS3DDiceCube {
  constructor(mountNode, seatId, name, faces, accentColor, gradientClass) {
    this.mount = mountNode;
    this.seatId = seatId;
    this.name = name;
    this.faces = faces; // Array of 6 numbers
    this.accent = accentColor;
    this.gradient = gradientClass;
    this.currentRoll = faces[0];

    this.render();
  }

  render() {
    this.mount.innerHTML = `
      <div class="flex flex-col items-center gap-3">
        <!-- 3D Perspective Scene Container -->
        <div class="scene-3d w-20 h-20 sm:w-24 sm:h-24 relative" style="perspective: 600px;">
          <div class="dice-cube-3d w-full h-full relative" style="transform-style: preserve-3d; transition: transform 1.2s cubic-bezier(0.15, 0.9, 0.3, 1.2);">
            
            <!-- 6 Cube Faces with Preserved 3D Rotations -->
            <div class="cube-face face-front absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br ${this.gradient} shadow-2xl font-mono text-2xl sm:text-3xl font-black text-white" style="transform: translateZ(48px);">
              ${this.faces[0]}
            </div>
            <div class="cube-face face-back absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br ${this.gradient} shadow-2xl font-mono text-2xl sm:text-3xl font-black text-white" style="transform: rotateY(180deg) translateZ(48px);">
              ${this.faces[1]}
            </div>
            <div class="cube-face face-right absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br ${this.gradient} shadow-2xl font-mono text-2xl sm:text-3xl font-black text-white" style="transform: rotateY(90deg) translateZ(48px);">
              ${this.faces[2]}
            </div>
            <div class="cube-face face-left absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br ${this.gradient} shadow-2xl font-mono text-2xl sm:text-3xl font-black text-white" style="transform: rotateY(-90deg) translateZ(48px);">
              ${this.faces[3]}
            </div>
            <div class="cube-face face-top absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br ${this.gradient} shadow-2xl font-mono text-2xl sm:text-3xl font-black text-white" style="transform: rotateX(90deg) translateZ(48px);">
              ${this.faces[4]}
            </div>
            <div class="cube-face face-bottom absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-white/20 bg-gradient-to-br ${this.gradient} shadow-2xl font-mono text-2xl sm:text-3xl font-black text-white" style="transform: rotateX(-90deg) translateZ(48px);">
              ${this.faces[5]}
            </div>

          </div>
        </div>

        <!-- Sub-Label -->
        <div class="text-center">
          <div class="text-xs font-bold" style="color: ${this.accent}">${this.name.split(' ')[0]}</div>
          <div class="text-[10px] font-mono text-slate-400 faces-str">[${this.faces.join(',')}]</div>
        </div>
      </div>
    `;

    this.cubeEl = this.mount.querySelector('.dice-cube-3d');
  }

  /**
   * Computes Euler target rotation angles matching the rolled face.
   */
  rollToFace(rawVal, modifiedVal = null) {
    return new Promise((resolve) => {
      // Find matching face index
      let faceIdx = this.faces.indexOf(rawVal);
      if (faceIdx === -1) faceIdx = 0;

      // Update face value text if modified by face shifter
      const frontEl = this.mount.querySelector('.face-front');
      if (frontEl) frontEl.textContent = modifiedVal || rawVal;

      // Tumble rotations (random multi-spins + final face alignment)
      const spinsX = (Math.floor(Math.random() * 3) + 2) * 360;
      const spinsY = (Math.floor(Math.random() * 3) + 2) * 360;

      const faceRotations = [
        { x: 0, y: 0 },         // Front (0)
        { x: 0, y: 180 },       // Back (1)
        { x: 0, y: -90 },       // Right (2)
        { x: 0, y: 90 },        // Left (3)
        { x: -90, y: 0 },       // Top (4)
        { x: 90, y: 0 }         // Bottom (5)
      ];

      const target = faceRotations[faceIdx];
      const finalX = spinsX + target.x;
      const finalY = spinsY + target.y;

      if (this.cubeEl) {
        this.cubeEl.style.transform = `rotateX(${finalX}deg) rotateY(${finalY}deg)`;
      }

      setTimeout(() => {
        resolve();
      }, 1200);
    });
  }
}
