/**
 * TRIARCH: Cyclic Edge - Mobile Tactile Haptics Engine
 * Provides rich vibration patterns for dice tumbling, impact clashes, and victories.
 * Gracefully no-ops on desktop or unsupported devices.
 */

class HapticsEngine {
  constructor() {
    this.hasVibration = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    this.enabled = true;

    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('triarch_haptics_enabled');
      if (stored !== null) {
        this.enabled = stored === 'true';
      }
    }
  }

  vibrate(pattern) {
    if (!this.enabled || !this.hasVibration) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }

  /**
   * Subtle tick for button taps, die selection, and shard purchases.
   */
  light() {
    this.vibrate(10);
  }

  /**
   * Multi-pulse vibration for 3D tumbling dice animations.
   */
  roll() {
    this.vibrate([15, 30, 15]);
  }

  /**
   * Heavy percussive impact when combat dice resolve against each other.
   */
  impact() {
    this.vibrate([40, 20, 60]);
  }

  /**
   * Celebratory pattern on round victory or tournament game win.
   */
  victory() {
    this.vibrate([30, 50, 30, 50, 100]);
  }

  /**
   * Alert buzz on invalid action or error.
   */
  error() {
    this.vibrate([60, 40, 60]);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('triarch_haptics_enabled', this.enabled ? 'true' : 'false');
    }
    if (this.enabled) this.light();
    return this.enabled;
  }
}

export const haptics = new HapticsEngine();
