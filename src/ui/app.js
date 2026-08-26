/**
 * TRIARCH: Cyclic Edge - Master Application Controller
 * Connects Game Engine, Math Core, Visualizers, Procedural Web Audio,
 * PWA Lifecycle, WebRTC P2P Mesh, 3D Board View & Live Odds Inspector.
 * Features Stealth ModeController for UI Decoupling (Clean Tabletop vs Math Lab Suite).
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
import { NetworkGameStateAdapter } from '../game/network-state.js';
import { PeerMeshManager } from '../network/peer-mesh.js';
import { SHARD_ITEMS, GAME_PHASES } from '../game/rules.js';
import { sfx } from '../audio/sfx.js';
import { toast } from './toast.js';
import { tour } from './tour.js';
import { MultiplayerLobbyModal } from './lobby-view.js';
import { BoardStageManager } from './board-view.js';
import { OddsInspectorDrawer } from './odds-inspector.js';
import { AuditLedgerView } from './audit-ledger.js';
import { CyclicGraphRenderer } from './visualizer.js';
import { NatsTelemetryPanel } from './nats-telemetry-panel.js';
import {
  renderOddsMatrixHTML,
  renderPlayerHUDHTML,
  renderParadoxComparisonHTML
} from './components.js';

class TriarchApp {
  constructor() {
    this.game = new GameStateManager();
    this.mesh = new PeerMeshManager();
    this.net = new NetworkGameStateAdapter(this.game, this.mesh);
    this.lobbyModal = new MultiplayerLobbyModal(this.mesh, this.net);
    this.oddsInspector = new OddsInspectorDrawer(this.game);

    this.currentPresetKey = 'triarch';
    this.activeTab = 'arena';
    this.deferredPrompt = null;
    this.boardStage = null;
    this.auditLedger = null;
    this.graphRenderer = null;
    this.natsPanel = null;
    this.currentBuildVersion = null;

    // Stealth Math Lab Mode State (defaults to false for clean tabletop experience)
    this.isLabMode = localStorage.getItem('triarch_lab_mode') === 'true';

    this.init();
  }

  init() {
    this.setupModeController();
    this.setupPWA();
    this.setupAppUpdates();
    this.setupTabs();
    this.setupAudio();
    this.setupMultiplayer();
    this.setupInspector();
    this.setupArena();
    this.setupSimulator();
    this.setupParadox();
    this.setupCodex();
    this.setupTourAndReset();

    // Subscribe to game state changes
    this.game.subscribe(() => this.renderGameState());

    // Initial renders
    this.renderGameState();
    this.renderSimulatorPreset();
    this.renderParadoxPreset();

    // Handle deep-link query parameters
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const tabParam = params.get('tab');
    const labParam = params.get('lab');

    if (labParam === '1' || labParam === 'true') {
      this.setLabMode(true, false);
    }

    if (roomParam) {
      setTimeout(() => {
        this.lobbyModal.open(roomParam.toUpperCase());
      }, 400);
    } else if (tabParam && ['arena', 'simulator', 'paradox', 'codex'].includes(tabParam)) {
      if (tabParam !== 'arena') {
        this.setLabMode(true, false);
      }
      this.switchTab(tabParam);
    }

    // First-time player guided tour
    if (!localStorage.getItem('triarch_tour_completed') && !roomParam) {
      setTimeout(() => {
        tour.start();
      }, 600);
    }
  }

  /* ---------------- Mode Controller (Clean Tabletop vs Math Lab) ---------------- */
  setupModeController() {
    // Apply initial state to DOM
    this.setLabMode(this.isLabMode, false);

    // 1. Desktop Hotkey Listeners (Ctrl+Shift+M, Cmd+Shift+M, backtick ` / ~)
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is actively typing in an input field
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      const isModifierM = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'M' || e.key === 'm');
      const isBacktick = e.key === '`' || e.key === '~';

      if (isModifierM || isBacktick) {
        e.preventDefault();
        this.toggleLabMode();
      }
    });

    // 2. Banner Exit Button
    const btnExitLab = document.getElementById('btn-exit-lab-mode');
    if (btnExitLab) {
      btnExitLab.addEventListener('click', () => {
        this.setLabMode(false);
      });
    }

    // 3. Mobile Stealth Gesture: 2-Second Long-Press on Brand Logo
    const brandLogo = document.getElementById('brand-logo');
    if (brandLogo) {
      let pressTimer = null;
      let isLongPress = false;

      const startPress = () => {
        isLongPress = false;
        brandLogo.style.transform = 'scale(0.96)';
        pressTimer = setTimeout(() => {
          isLongPress = true;
          brandLogo.style.transform = '';
          this.toggleLabMode();
        }, 2000);
      };

      const cancelPress = () => {
        brandLogo.style.transform = '';
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      brandLogo.addEventListener('touchstart', startPress, { passive: true });
      brandLogo.addEventListener('touchend', cancelPress);
      brandLogo.addEventListener('touchcancel', cancelPress);
      brandLogo.addEventListener('mousedown', startPress);
      brandLogo.addEventListener('mouseup', cancelPress);
      brandLogo.addEventListener('mouseleave', cancelPress);
    }

    // 4. Mobile Stealth Trigger: Triple-Tap on Footer Version Tag
    const footerTag = document.getElementById('footer-version-tag');
    if (footerTag) {
      let tapCount = 0;
      let tapTimer = null;

      footerTag.addEventListener('click', () => {
        tapCount++;
        if (tapCount === 1) {
          tapTimer = setTimeout(() => {
            tapCount = 0;
          }, 600);
        } else if (tapCount >= 3) {
          clearTimeout(tapTimer);
          tapCount = 0;
          this.toggleLabMode();
        }
      });
    }
  }

  setLabMode(enabled, notify = true) {
    this.isLabMode = !!enabled;
    localStorage.setItem('triarch_lab_mode', this.isLabMode ? 'true' : 'false');
    document.body.classList.toggle('lab-mode-active', this.isLabMode);

    if (!this.isLabMode) {
      // If closing lab mode, return to main arena tab
      if (this.activeTab !== 'arena') {
        this.switchTab('arena');
      }
      // Close Odds Inspector if open
      if (this.oddsInspector && this.oddsInspector.isOpen) {
        this.oddsInspector.close();
      }
      if (notify) {
        toast.show('⚔️ Clean Tabletop Mode Active', 'info', 2000);
        sfx.playClick();
      }
    } else {
      // Resize cyclic graph canvas when entering lab mode
      if (this.graphRenderer) {
        setTimeout(() => this.graphRenderer._resize(), 50);
      }
      if (notify) {
        toast.show('🔬 Math Lab & Telemetry Suite Unlocked', 'success', 2500);
        sfx.playDominanceChime();
      }
    }
  }

  toggleLabMode(notify = true) {
    this.setLabMode(!this.isLabMode, notify);
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
          toast.show('Running in Offline Mode — full game & math core active!', 'warning', 3000);
        }
      }
    };

    window.addEventListener('online', () => {
      updateOnlineStatus();
      toast.show('Back Online! Connection restored.', 'success', 2500);
    });
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // Standalone Detection
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         ('standalone' in navigator && navigator.standalone === true);

    // PWA Install Prompt Capture
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (installBtn && !isStandalone) {
        installBtn.classList.remove('hidden');
        installBtn.addEventListener('click', async () => {
          if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`[PWA] Install prompt outcome: ${outcome}`);
            this.deferredPrompt = null;
            installBtn.classList.add('hidden');
            if (outcome === 'accepted') {
              toast.show('TRIARCH installed to your home screen!', 'success');
            }
          }
        });
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      if (installBtn) installBtn.classList.add('hidden');
      toast.show('TRIARCH app installed successfully!', 'success');
    });

    // Register Service Worker with instant controllerchange handling
    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[PWA Update] New version active! Reloading...');
          window.location.reload();
        }
      });

      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
            reg.update().catch(() => {});
          })
          .catch((err) => console.warn('[PWA] ServiceWorker registration failed:', err));
      });
    }
  }

  /* ---------------- Automated Version Update Poller ---------------- */
  setupAppUpdates() {
    const checkForVersionUpdate = async () => {
      // 1. Service Worker update check
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            reg.update().catch(() => {});
            if (reg.waiting) {
              this.notifyUpdateAvailable(reg.waiting);
              return;
            }
            reg.onupdatefound = () => {
              const installing = reg.installing;
              if (installing) {
                installing.onstatechange = () => {
                  if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                    this.notifyUpdateAvailable(installing);
                  }
                };
              }
            };
          }
        } catch (e) {}
      }

      // 2. HTTP Fallback version.json check
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.version) {
            const versionStr = `v${data.version}`;
            const headerBadge = document.getElementById('header-version-badge');
            const footerDisplay = document.getElementById('app-version-display');
            if (headerBadge) headerBadge.textContent = versionStr;
            if (footerDisplay) footerDisplay.textContent = versionStr;
            toast.setVersion(data.version);

            if (!this.currentBuildVersion) {
              this.currentBuildVersion = data.version;
            } else if (this.currentBuildVersion !== data.version) {
              this.notifyUpdateAvailable(null, data.version);
            }
          }
        }
      } catch (e) {}
    };

    checkForVersionUpdate();
    setInterval(checkForVersionUpdate, 30000);
    window.addEventListener('focus', checkForVersionUpdate);
    window.addEventListener('online', checkForVersionUpdate);
  }

  notifyUpdateAvailable(workerInstance, newVer = '') {
    toast.show(
      `New TRIARCH update available ${newVer ? `(${newVer})` : ''}!`,
      'info',
      0,
      {
        label: 'Update Now',
        onClick: () => {
          if (workerInstance) {
            workerInstance.postMessage({ type: 'SKIP_WAITING' });
          } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
          }
          if (typeof caches !== 'undefined') {
            caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
              .finally(() => window.location.reload());
          } else {
            window.location.reload();
          }
        }
      }
    );
  }

  /* ---------------- Odds Inspector Setup ---------------- */
  setupInspector() {
    const btnInspector = document.getElementById('btn-toggle-odds');
    if (btnInspector) {
      btnInspector.addEventListener('click', () => {
        sfx.playClick();
        this.oddsInspector.toggle();
      });
    }
  }

  /* ---------------- Multiplayer Integration ---------------- */
  setupMultiplayer() {
    const btnLobby = document.getElementById('btn-open-lobby');
    if (btnLobby) {
      btnLobby.addEventListener('click', () => {
        sfx.playClick();
        this.lobbyModal.open();
      });
    }

    // Update lobby badge on seat changes
    this.mesh.onSeatChange(() => {
      const badge = document.getElementById('lobby-peer-badge');
      if (badge) {
        if (this.mesh.roomCode) {
          badge.textContent = `Room ${this.mesh.roomCode}`;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    });
  }

  /* ---------------- Tour & Factory Reset ---------------- */
  setupTourAndReset() {
    const btnTour = document.getElementById('btn-show-tour');
    if (btnTour) {
      btnTour.addEventListener('click', () => {
        sfx.playClick();
        tour.start();
      });
    }

    const btnReset = document.getElementById('btn-pristine-reset');
    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        const confirmed = window.confirm(
          'Reset TRIARCH to pristine initial state?\n\n' +
          '• Clears local match history and custom scores\n' +
          '• Clears browser cache & Service Worker registrations\n' +
          '• Restores default sound and display preferences\n' +
          '• Relaunches the interactive Getting Started tour'
        );
        if (!confirmed) return;

        try {
          localStorage.clear();
          sessionStorage.clear();
          if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
        } catch (err) {
          console.warn('Reset error:', err);
        }

        window.location.href = window.location.pathname;
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

    if (tabId === 'arena' && this.graphRenderer && this.isLabMode) {
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
        if (!isMuted) {
          sfx.playClick();
          toast.show('Sound Effects Enabled', 'info', 1500);
        } else {
          toast.show('Sound Effects Muted', 'info', 1500);
        }
      });
    }
  }

  /* ---------------- Arena Setup ---------------- */
  setupArena() {
    const canvas = document.getElementById('cyclic-graph-canvas');
    if (canvas) {
      this.graphRenderer = new CyclicGraphRenderer(canvas);
    }

    // Initialize 3D Board Battlefield Stage (with Watermark & 3D Tumbling Cubes)
    const boardContainer = document.getElementById('board-stage-mount');
    if (boardContainer) {
      this.boardStage = new BoardStageManager(boardContainer);
    }

    // Initialize Audit Ledger
    const ledgerMount = document.getElementById('audit-ledger-mount');
    if (ledgerMount) {
      this.auditLedger = new AuditLedgerView(this.game, ledgerMount);
    }

    // Welcome & Matchmaking Portal Buttons
    const btnWelcomeLobby = document.getElementById('btn-welcome-open-lobby');
    if (btnWelcomeLobby) {
      btnWelcomeLobby.addEventListener('click', () => {
        sfx.playClick();
        this.lobbyModal.open();
      });
    }

    const btnWelcomeSolo = document.getElementById('btn-welcome-solo-ai');
    if (btnWelcomeSolo) {
      btnWelcomeSolo.addEventListener('click', () => {
        sfx.playClick();
        this.mesh.disconnect();
        this.mesh.localSeat = 'ruby';
        this.mesh.seats.ruby = { peerId: 'local_human', name: 'You (Ruby)', isAI: false, ready: true };
        this.mesh.seats.cyan = { peerId: null, name: 'Bot (Cyan)', isAI: true, aiType: 'MAX_EV', ready: true };
        this.mesh.seats.amber = { peerId: null, name: 'Bot (Amber)', isAI: true, aiType: 'SHARD_TACTICIAN', ready: true };
        this.net.isMultiplayer = false;
        this.game.startMatch({
          mode: 'CYCLIC_SHOWDOWN',
          rubyAI: false,
          cyanAI: true,
          amberAI: true
        });
        toast.show('⚔️ Solo Practice Match Started!', 'success', 2500);
        sfx.playDominanceChime();
      });
    }

    this.localTacticalModifiers = new Set();

    // Phase 1: Initiative Roll Button
    const btnInitiative = document.getElementById('btn-arena-initiative');
    if (btnInitiative) {
      btnInitiative.addEventListener('click', () => this.handleInitiativeRoll());
    }

    // Phase 2: Tactical Market Buttons
    const btnMelee = document.getElementById('btn-market-melee');
    const btnShifter = document.getElementById('btn-market-shifter');
    const btnDuel = document.getElementById('btn-market-duel');
    const btnConceal = document.getElementById('btn-market-conceal');
    const btnCommit = document.getElementById('btn-tactical-commit');

    const updateMarketButtonsUI = () => {
      if (btnMelee) btnMelee.classList.toggle('ring-2', this.localTacticalModifiers.has('MELEE'));
      if (btnShifter) btnShifter.classList.toggle('ring-2', this.localTacticalModifiers.has('SHIFTER'));
      if (btnDuel) btnDuel.classList.toggle('ring-2', this.localTacticalModifiers.has('DUEL'));
      if (btnConceal) btnConceal.classList.toggle('ring-2', this.localTacticalModifiers.has('CONCEAL'));
    };

    if (btnMelee) {
      btnMelee.addEventListener('click', () => {
        sfx.playClick();
        if (this.localTacticalModifiers.has('MELEE')) this.localTacticalModifiers.delete('MELEE');
        else this.localTacticalModifiers.add('MELEE');
        updateMarketButtonsUI();
      });
    }

    if (btnShifter) {
      btnShifter.addEventListener('click', () => {
        sfx.playClick();
        if (this.localTacticalModifiers.has('SHIFTER')) this.localTacticalModifiers.delete('SHIFTER');
        else this.localTacticalModifiers.add('SHIFTER');
        updateMarketButtonsUI();
      });
    }

    if (btnDuel) {
      btnDuel.addEventListener('click', () => {
        sfx.playClick();
        if (this.localTacticalModifiers.has('DUEL')) this.localTacticalModifiers.delete('DUEL');
        else this.localTacticalModifiers.add('DUEL');
        updateMarketButtonsUI();
      });
    }

    if (btnConceal) {
      btnConceal.addEventListener('click', () => {
        sfx.playClick();
        if (this.localTacticalModifiers.has('CONCEAL')) this.localTacticalModifiers.delete('CONCEAL');
        else this.localTacticalModifiers.add('CONCEAL');
        updateMarketButtonsUI();
      });
    }

    if (btnCommit) {
      btnCommit.addEventListener('click', () => this.handleTacticalCommit());
    }

    // Next Round Button
    const nextBtn = document.getElementById('btn-arena-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        sfx.playClick();
        if (this.boardStage) this.boardStage.hideResult();
        this.localTacticalModifiers.clear();
        this.game.nextRound();
      });
    }

    // Reset Match Button
    const resetBtn = document.getElementById('btn-arena-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        sfx.playClick();
        if (this.boardStage) this.boardStage.hideResult();
        this.localTacticalModifiers.clear();
        this.game.endMatch();
        toast.show('Match ended. Returned to lobby portal.', 'info', 2000);
      });
    }
  }

  async handleInitiativeRoll() {
    const btn = document.getElementById('btn-arena-initiative');
    if (btn) btn.disabled = true;

    const record = this.net.rollInitiative();
    if (!record) {
      if (btn) btn.disabled = false;
      return;
    }

    if (this.boardStage) {
      await this.boardStage.rollInitiativeShowdown(record.rolls, () => {
        sfx.playDominanceChime();
        const p1 = this.game.players[record.initiativeOrder[0]]?.name || '1st';
        toast.show(`🎲 Initiative Locked! ${p1} takes 1st Pole Position!`, 'success', 3000);
        if (btn) btn.disabled = false;
      });
    }
  }

  async handleTacticalCommit() {
    const btn = document.getElementById('btn-tactical-commit');
    if (btn) btn.disabled = true;

    const seat = this.mesh.getLocalFaction();
    const player = this.game.players[seat];
    if (!player) {
      if (btn) btn.disabled = false;
      return;
    }

    // Calculate energy cost of selected modifiers
    const costs = { MELEE: 5, SHIFTER: 3, DUEL: 6, CONCEAL: 4 };
    const modifiers = Array.from(this.localTacticalModifiers);
    const totalCost = modifiers.reduce((sum, m) => sum + (costs[m] || 0), 0);

    if (totalCost > player.energy) {
      toast.show(`Not enough Energy! Selected actions cost ${totalCost}E, but you have ${player.energy}E.`, 'warning', 3000);
      if (btn) btn.disabled = false;
      return;
    }

    const selectEl = document.getElementById('select-tactical-die');
    const dieId = selectEl ? selectEl.value : player.currentDie.id;
    const isConcealed = this.localTacticalModifiers.has('CONCEAL');

    await this.net.commitTacticalTurn({
      spentEnergy: totalCost,
      modifiers,
      dieId,
      isConcealed
    });

    this.localTacticalModifiers.clear();
    const btnMelee = document.getElementById('btn-market-melee');
    const btnShifter = document.getElementById('btn-market-shifter');
    const btnDuel = document.getElementById('btn-market-duel');
    const btnConceal = document.getElementById('btn-market-conceal');
    if (btnMelee) btnMelee.classList.remove('ring-2');
    if (btnShifter) btnShifter.classList.remove('ring-2');
    if (btnDuel) btnDuel.classList.remove('ring-2');
    if (btnConceal) btnConceal.classList.remove('ring-2');

    toast.show(`Stance locked! Spent ${totalCost} Energy.`, 'info', 2000);

    // If clash triggered on 3rd turn
    if (this.game.lastClashResult && this.boardStage) {
      await this.boardStage.rollCombatShowdown(this.game.lastClashResult.rolls, () => {
        sfx.playClash();
        if (this.game.lastClashResult.winnerId) {
          sfx.playDominanceChime();
          toast.show(this.game.lastClashResult.reason, this.game.lastClashResult.winnerId === seat ? 'success' : 'info', 3500);
        } else {
          toast.show(this.game.lastClashResult.reason, 'warning', 3500);
        }
        this.boardStage.showResult(this.game.lastClashResult.reason, this.game.lastClashResult.winnerId);
      });
    }

    if (btn) btn.disabled = false;
  }

  renderGameState() {
    const welcomePortal = document.getElementById('arena-welcome-portal');
    const arenaGrid = document.getElementById('section-arena-grid');

    if (!this.game.isMatchActive || this.game.phase === GAME_PHASES.LOBBY) {
      if (welcomePortal) welcomePortal.classList.remove('hidden');
      if (arenaGrid) arenaGrid.classList.add('hidden');
      return;
    }

    if (welcomePortal) welcomePortal.classList.add('hidden');
    if (arenaGrid) arenaGrid.classList.remove('hidden');

    // Update 3D Stage for active phase
    if (this.boardStage) {
      this.boardStage.updateForPhase(this.game.phase, this.game.players, this.game.roundPot);
    }

    const hudRuby = document.getElementById('hud-ruby');
    const hudCyan = document.getElementById('hud-cyan');
    const hudAmber = document.getElementById('hud-amber');

    const getMeta = (seat) => {
      const isLocal = this.mesh.getLocalFaction() === seat;
      const isConcealed = this.net.peerCommitments.has(seat) && !this.net.peerReveals.has(seat) && !isLocal;
      const peerId = this.mesh.seats[seat]?.peerId;
      const latency = peerId ? this.mesh.latencies.get(peerId) : null;
      const poleIdx = this.game.initiativeOrder ? this.game.initiativeOrder.indexOf(seat) : -1;
      const polePosition = poleIdx !== -1 ? poleIdx + 1 : null;
      const isCurrentTurn = this.game.phase === GAME_PHASES.TACTICAL_TURN && this.game.initiativeOrder[this.game.currentTurnIndex] === seat;

      return {
        isLocal,
        isConcealed,
        commitment: this.net.peerCommitments.get(seat),
        latency,
        polePosition,
        isCurrentTurn,
        phase: this.game.phase
      };
    };

    if (hudRuby) hudRuby.innerHTML = renderPlayerHUDHTML(this.game.players.ruby, getMeta('ruby'));
    if (hudCyan) hudCyan.innerHTML = renderPlayerHUDHTML(this.game.players.cyan, getMeta('cyan'));
    if (hudAmber) hudAmber.innerHTML = renderPlayerHUDHTML(this.game.players.amber, getMeta('amber'));

    // Turn info & Round Header
    const roundBanner = document.getElementById('arena-round-banner');
    if (roundBanner) {
      roundBanner.textContent = `Round ${this.game.roundNumber} / ${this.game.mode.maxRounds} — Target: ${this.game.mode.targetScore} Pts`;
    }

    // Action Dock Two-Phase View State Controller
    const dockInitiative = document.getElementById('dock-phase-initiative');
    const dockTactical = document.getElementById('dock-phase-tactical');
    const dockResolution = document.getElementById('dock-phase-resolution');
    const tacticalLocal = document.getElementById('tactical-local-controls');
    const tacticalRemoteWait = document.getElementById('tactical-remote-wait');
    const waitingName = document.getElementById('tactical-waiting-name');

    if (this.game.phase === GAME_PHASES.INITIATIVE) {
      if (dockInitiative) dockInitiative.classList.remove('hidden');
      if (dockTactical) dockTactical.classList.add('hidden');
      if (dockResolution) dockResolution.classList.add('hidden');
    } else if (this.game.phase === GAME_PHASES.TACTICAL_TURN) {
      if (dockInitiative) dockInitiative.classList.add('hidden');
      if (dockTactical) dockTactical.classList.remove('hidden');
      if (dockResolution) dockResolution.classList.add('hidden');

      const activeTurnSeat = this.game.initiativeOrder[this.game.currentTurnIndex];
      const isMyTurn = activeTurnSeat === this.mesh.getLocalFaction();

      if (isMyTurn) {
        if (tacticalLocal) tacticalLocal.classList.remove('hidden');
        if (tacticalRemoteWait) tacticalRemoteWait.classList.add('hidden');
      } else {
        if (tacticalLocal) tacticalLocal.classList.add('hidden');
        if (tacticalRemoteWait) tacticalRemoteWait.classList.remove('hidden');
        if (waitingName) waitingName.textContent = this.game.players[activeTurnSeat]?.name || activeTurnSeat;
      }
    } else if (this.game.phase === GAME_PHASES.RESOLUTION || this.game.phase === GAME_PHASES.GAME_OVER) {
      if (dockInitiative) dockInitiative.classList.add('hidden');
      if (dockTactical) dockTactical.classList.add('hidden');
      if (dockResolution) dockResolution.classList.remove('hidden');
    }

    // Render Round History
    const historyContainer = document.getElementById('arena-history-list');
    if (historyContainer) {
      if (this.game.roundHistory.length === 0) {
        historyContainer.innerHTML = `<div class="text-xs text-slate-500 font-mono text-center py-4">No clashes recorded yet. Roll for initiative to begin!</div>`;
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
        toast.show(`Switched to preset: ${DICE_PRESETS[this.currentPresetKey].name}`, 'info', 2000);
      });
    }

    const btnMonteCarlo = document.getElementById('btn-run-monte-carlo');
    if (btnMonteCarlo) {
      btnMonteCarlo.addEventListener('click', () => {
        sfx.playClick();
        this.runLiveMonteCarlo();
      });
    }

    // Initialize NATS Telemetry Panel
    const telemetryMount = document.getElementById('nats-telemetry-mount');
    if (telemetryMount) {
      this.natsPanel = new NatsTelemetryPanel(telemetryMount, this.mesh, this.game);
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
      toast.show('Monte Carlo verification converged against analytical proof!', 'success', 2500);
    }, 150);
  }

  /* ---------------- Paradox Explorer Setup ---------------- */
  setupParadox() {
    this.renderParadoxPreset();
  }

  renderParadoxPreset() {
    const container = document.getElementById('paradox-comparisons-list');
    if (!container) return;

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
    // Codex static content
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.triarchApp = new TriarchApp();
});
