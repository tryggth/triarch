/**
 * TRIARCH: Cyclic Edge - Procedural Web Audio Sound Engine
 * Zero external audio assets required. Generates tactile acoustic feedback
 * for dice tumbling, clashes, cyclic dominance resonances, and UI interactions.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = typeof localStorage !== 'undefined'
      ? localStorage.getItem('triarch_sfx_muted') === 'true'
      : false;
  }

  /**
   * Initializes or resumes AudioContext on user gesture.
   */
  _ensureContext() {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('triarch_sfx_muted', String(muted));
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Subtle click for button taps and toggle switches.
   */
  playClick() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.045);
  }

  /**
   * Realistic tumbling dice sound with randomized acoustic impacts.
   */
  playDiceRoll() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const impactCount = 4 + Math.floor(Math.random() * 3);

    for (let i = 0; i < impactCount; i++) {
      const impactTime = now + (i * 0.07) + (Math.random() * 0.03);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      const freq = 120 + Math.random() * 180;
      osc.frequency.setValueAtTime(freq, impactTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, impactTime + 0.05);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(350 + Math.random() * 200, impactTime);
      filter.Q.setValueAtTime(3, impactTime);

      const vol = 0.12 * (1 - (i / impactCount) * 0.4);
      gain.gain.setValueAtTime(vol, impactTime);
      gain.gain.exponentialRampToValueAtTime(0.001, impactTime + 0.06);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(impactTime);
      osc.stop(impactTime + 0.07);
    }
  }

  /**
   * Punchy energetic clash sound for round combat evaluation.
   */
  playClash() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Sub thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);

    // High snap
    const snapOsc = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snapOsc.type = 'sawtooth';
    snapOsc.frequency.setValueAtTime(650, now);
    snapOsc.frequency.exponentialRampToValueAtTime(100, now + 0.08);

    snapGain.gain.setValueAtTime(0.12, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    snapOsc.connect(snapGain);
    snapGain.connect(ctx.destination);
    snapOsc.start(now);
    snapOsc.stop(now + 0.09);
  }

  /**
   * Resonant harmonic arpeggio for cyclic dominance loops and match victory.
   */
  playDominanceChime() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Harmonic triad: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
    const notes = [523.25, 659.25, 783.99, 1046.50];

    notes.forEach((freq, idx) => {
      const noteTime = now + (idx * 0.09);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.15, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.55);
    });
  }
}

export const sfx = new SoundEngine();
