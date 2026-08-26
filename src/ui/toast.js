/**
 * TRIARCH: Cyclic Edge - Toast Notification System
 * Non-blocking, glassmorphic toast notification queue for PWA updates, combat events, and warnings.
 */

class ToastManager {
  constructor() {
    this.container = null;
  }

  _getContainer() {
    if (typeof document === 'undefined') return null;
    if (!this.container) {
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none w-11/12 max-w-md items-center';
        document.body.appendChild(this.container);
      }
    }
    return this.container;
  }

  /**
   * Shows a toast message.
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} [type='info']
   * @param {number} [duration=3500]
   * @param {{ label: string, onClick: () => void }} [action]
   */
  show(message, type = 'info', duration = 3500, action = null) {
    const container = this._getContainer();
    if (!container || typeof document === 'undefined') return;
    const toast = document.createElement('div');

    const styles = {
      info: 'bg-slate-900/95 border-indigo-500/50 text-indigo-200 shadow-[0_0_20px_#6366f140]',
      success: 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200 shadow-[0_0_20px_#10b98140]',
      warning: 'bg-amber-950/95 border-amber-500/50 text-amber-200 shadow-[0_0_20px_#f59e0b40]',
      error: 'bg-rose-950/95 border-rose-500/50 text-rose-200 shadow-[0_0_20px_#f43f5e40]'
    };

    const icons = {
      info: '✨',
      success: '👑',
      warning: '⚠️',
      error: '💥'
    };

    toast.className = `pointer-events-auto px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl text-xs sm:text-sm font-bold flex items-center justify-between gap-3 transform transition-all duration-300 translate-y-[-10px] opacity-0 ${styles[type] || styles.info}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'flex items-center gap-2.5';
    contentDiv.innerHTML = `<span class="text-base">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    toast.appendChild(contentDiv);

    if (action) {
      const btn = document.createElement('button');
      btn.className = 'px-3 py-1 rounded-xl bg-white text-slate-950 font-bold text-xs font-mono hover:bg-slate-200 transition-colors pointer-events-auto';
      btn.textContent = action.label;
      btn.onclick = () => {
        action.onClick();
        this.dismiss(toast);
      };
      toast.appendChild(btn);
    }

    container.appendChild(toast);

    // Animate In
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-[-10px]', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast);
      }, duration);
    }
  }

  dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('translate-y-[-10px]', 'opacity-0');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }
}

export const toast = new ToastManager();
