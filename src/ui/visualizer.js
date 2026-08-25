/**
 * TRIARCH: Cyclic Edge - Canvas & SVG Visualizer Engine
 * Renders the interactive cyclic tournament graph with animated energy flows,
 * dynamic odds heatmaps, and tumbling dice animations.
 */

export class CyclicGraphRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.animationFrameId = null;
    this.phase = 0;
    this.activeHighlightEdge = null; // e.g. { from: 0, to: 1 }

    this.nodes = [
      { id: 'ruby', name: 'Ruby (A)', color: '#fb7185', glow: 'rgba(251, 113, 133, 0.6)', x: 0.5, y: 0.22 },
      { id: 'cyan', name: 'Cyan (B)', color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.6)', x: 0.78, y: 0.75 },
      { id: 'amber', name: 'Amber (C)', color: '#facc15', glow: 'rgba(250, 204, 21, 0.6)', x: 0.22, y: 0.75 }
    ];

    // Directed edges: 0 -> 1 (Ruby beats Cyan), 1 -> 2 (Cyan beats Amber), 2 -> 0 (Amber beats Ruby)
    this.edges = [
      { from: 0, to: 1, label: '55.6% (5/9)', color: '#fb7185' },
      { from: 1, to: 2, label: '55.6% (5/9)', color: '#22d3ee' },
      { from: 2, to: 0, label: '55.6% (5/9)', color: '#facc15' }
    ];

    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
    this.startAnimation();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 360) * dpr;
    this.canvas.height = (rect.height || 320) * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width || 360;
    this.height = rect.height || 320;
  }

  startAnimation() {
    const render = () => {
      this.draw();
      this.phase = (this.phase + 0.015) % 1;
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  stopAnimation() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  highlightEdge(fromNodeId, toNodeId) {
    const fromIdx = this.nodes.findIndex(n => n.id === fromNodeId);
    const toIdx = this.nodes.findIndex(n => n.id === toNodeId);
    if (fromIdx !== -1 && toIdx !== -1) {
      this.activeHighlightEdge = { from: fromIdx, to: toIdx, expire: Date.now() + 2500 };
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // Compute absolute pixel positions
    const pos = this.nodes.map(n => ({
      x: n.x * w,
      y: n.y * h
    }));

    // 1. Draw central cyclic glow ring
    const centerX = w * 0.5;
    const centerY = h * 0.57;
    const ringRadius = Math.min(w, h) * 0.32;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.restore();

    // 2. Draw Directed Cyclic Curved Edges
    this.edges.forEach((edge, idx) => {
      const p1 = pos[edge.from];
      const p2 = pos[edge.to];

      // Curved control point bowed outwards
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Normal vector
      const nx = -dy / dist;
      const ny = dx / dist;
      const curvature = 24;
      const ctrlX = midX + nx * curvature;
      const ctrlY = midY + ny * curvature;

      const isHighlighted = this.activeHighlightEdge &&
                            this.activeHighlightEdge.from === edge.from &&
                            this.activeHighlightEdge.to === edge.to &&
                            Date.now() < this.activeHighlightEdge.expire;

      // Draw Edge Path
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(ctrlX, ctrlY, p2.x, p2.y);
      ctx.strokeStyle = isHighlighted ? '#ffffff' : edge.color;
      ctx.lineWidth = isHighlighted ? 3.5 : 2;
      ctx.shadowColor = edge.color;
      ctx.shadowBlur = isHighlighted ? 18 : 8;
      ctx.stroke();

      // Draw flowing particles along quadratic curve
      const particleCount = 3;
      for (let p = 0; p < particleCount; p++) {
        const t = (this.phase + (p / particleCount)) % 1;
        // Quadratic bezier formula: (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
        const px = Math.pow(1 - t, 2) * p1.x + 2 * (1 - t) * t * ctrlX + Math.pow(t, 2) * p2.x;
        const py = Math.pow(1 - t, 2) * p1.y + 2 * (1 - t) * t * ctrlY + Math.pow(t, 2) * p2.y;

        ctx.beginPath();
        ctx.arc(px, py, isHighlighted ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = edge.color;
        ctx.shadowBlur = 10;
        ctx.fill();
      }

      // Draw Edge Probability Badge on the curve midpoint
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = isHighlighted ? '#ffffff' : 'rgba(241, 245, 249, 0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(edge.label, ctrlX, ctrlY);

      ctx.restore();
    });

    // 3. Draw Nodes (Archon Orbs)
    this.nodes.forEach((node, idx) => {
      const p = pos[idx];
      const radius = 26;

      ctx.save();
      // Outer glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = node.glow;
      ctx.shadowColor = node.color;
      ctx.shadowBlur = 20;
      ctx.fill();

      // Core orb
      const grad = ctx.createRadialGradient(p.x - 6, p.y - 6, 2, p.x, p.y, radius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, node.color);
      grad.addColorStop(1, '#090d16');

      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Node text
      ctx.font = '700 11px "JetBrains Mono", sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(node.name, p.x, p.y + radius + 15);

      ctx.restore();
    });
  }
}

/**
 * Creates an animated 3D visual dice element with dynamic roll face cycling.
 * @param {HTMLElement} container
 * @param {import('../math/dice.js').Die} die
 * @returns {{ roll: (finalValue: number, onComplete?: () => void) => void }}
 */
export function createDiceVisual(container, die) {
  container.innerHTML = `
    <div class="dice-wrapper relative flex flex-col items-center justify-center p-4 bg-slate-900/60 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-slate-500">
      <div class="die-cube w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black shadow-2xl transition-transform duration-500 transform cursor-pointer select-none"
           style="background: radial-gradient(circle at 30% 30%, ${die.color}dd, #0f172a); border: 2px solid ${die.color}; box-shadow: 0 0 25px ${die.color}40;"
           aria-label="${die.name} face value">
        <span class="die-face-value text-white drop-shadow-md">?</span>
      </div>
      <div class="mt-3 text-center">
        <div class="text-xs font-bold uppercase tracking-wider text-slate-300">${die.name}</div>
        <div class="text-[11px] font-mono text-slate-400 mt-0.5">${die.toFaceString()}</div>
      </div>
    </div>
  `;

  const cube = container.querySelector('.die-cube');
  const valSpan = container.querySelector('.die-face-value');

  return {
    roll: (finalValue, onComplete) => {
      let ticks = 0;
      const maxTicks = 12;
      cube.classList.add('animate-spin');

      const interval = setInterval(() => {
        const randFace = die.faces[Math.floor(Math.random() * die.faces.length)];
        valSpan.textContent = randFace;
        ticks++;

        if (ticks >= maxTicks) {
          clearInterval(interval);
          cube.classList.remove('animate-spin');
          valSpan.textContent = finalValue;
          cube.classList.add('scale-110');
          setTimeout(() => cube.classList.remove('scale-110'), 250);
          if (onComplete) onComplete();
        }
      }, 55);
    },
    setValue: (val) => {
      valSpan.textContent = val;
    }
  };
}
