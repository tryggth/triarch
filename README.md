# TRIARCH: Cyclic Edge 🎲🔺🔷🟡

> A strategic 3-player non-transitive tabletop game PWA powered by a mathematically verified dice engine, discrete convolutions, serverless WebRTC 3-node mesh discovery, and cryptographic SHA-256 commit-reveal stance concealment.

![TRIARCH Cyclic Logo](triarch.svg)

---

## 🌟 Overview

**TRIARCH: Cyclic Edge** is a zero-build, static Progressive Web App (PWA) built with pure native ES Modules and Tailwind CSS. It explores the fascinating realm of **non-transitive game theory**—where standard transitive hierarchies ($A > B \land B > C \implies A > C$) break down into cyclic dominance loops.

### Key Highlights
- 🧠 **Verified Mathematical Core:** Exact discrete probability matrices, generating function convolutions for multi-dice sums, and graph cycle detection.
- 🌐 **Zero-Backend P2P Multiplayer Mesh:** 3-node WebRTC mesh with instant room discovery (4-character room codes like `TR-9X` and auto-generated SVG QR codes).
- 🔒 **Cryptographic Commit-Reveal Protocol:** Native WebCrypto SHA-256 zero-knowledge stance concealment preventing peer snooping and counter-picking.
- ⚡ **Zero-Build Architecture:** Pure native ES modules with zero bundler friction. Compatible with GitHub Pages out of the box.
- 📲 **PWA & Offline First:** Service Worker caching (`sw.js`) with cache-first / stale-while-revalidate strategy, Web App Manifest, automated update detection, and home-screen installability.
- 🔊 **Procedural Web Audio:** Zero external audio files. Real-time acoustic synthesis for dice tumbling, impact clashes, and resonant harmonic chords.
- 🤖 **Game-Theoretic AI Bots:** Automated bot profiles (*Cyclic Exploiter*, *Max-EV Strategist*, *Shard Tactician*) for unclaimed multiplayer seats or solo play.
- 🚀 **Automated CI/CD:** GitHub Actions workflow executing mathematical and network verification tests before deploying to GitHub Pages.

---

## 📐 The Mathematics of Non-Transitive Dice

In standard numbers, the relation $>$ is strictly transitive. With discrete random variables (dice), pairwise superiority forms a tournament graph $(V, E)$ that can contain directed cycles.

### The TRIARCH Balanced Triad
The standard game uses three custom 6-sided dice with **equal expected value** ($E[X] = 5.0$, Sum = 30):

| Archon / Die | Face Configuration | Expected Value $E[X]$ | Variance $\text{Var}(X)$ | Strategic Role |
| :--- | :--- | :---: | :---: | :--- |
| **Ruby Archon (A)** | `[2, 2, 4, 4, 9, 9]` | **5.00** | 9.33 | High explosive ceiling (Twin 9s) |
| **Cyan Sentinel (B)** | `[1, 1, 6, 6, 8, 8]` | **5.00** | 8.00 | Balanced consistency (Mid-high rungs) |
| **Amber Keeper (C)** | `[3, 3, 5, 5, 7, 7]` | **5.00** | 2.67 | Stable central distribution |

#### Exact Pairwise Proofs:
$$\begin{aligned}
P(A > B) &= \frac{20}{36} = \frac{5}{9} \approx 55.56\% \\
P(B > C) &= \frac{20}{36} = \frac{5}{9} \approx 55.56\% \\
P(C > A) &= \frac{20}{36} = \frac{5}{9} \approx 55.56\%
\end{aligned}$$

With **zero possible ties** in pairwise head-to-head combat!

---

## 🔒 Cryptographic Commit-Reveal Protocol

To prevent peers from inspecting opponent selections and counter-picking in real-time P2P matches, TRIARCH incorporates a native WebCrypto commitment scheme:

1. **Commit Phase:**
   $$\text{Salt} = \text{random 32-byte hex (256-bit cryptographic entropy)}$$
   $$\text{Commitment} = \text{SHA-256}(\text{ChosenDie} \parallel \text{Salt})$$
   * Player broadcasts only `{ type: 'DRAFT_COMMIT', seat: 'ruby', commitment: '<64-char-hex>' }`.
2. **Reveal Phase (Clash Resolution):**
   * Player broadcasts `{ type: 'DRAFT_REVEAL', seat: 'ruby', die: 'ruby-a', salt: '<64-char-hex>' }`.
   * All peer nodes independently verify $\text{SHA-256}(\text{die} \parallel \text{salt}) \equiv \text{commitment}$. If tampered, a security alert is triggered and the round is flagged.

---

## 🌐 Serverless P2P WebRTC Seating & Mesh

- **Room Codes:** 4-letter alphanumeric codes (e.g., `TR-9X`).
- **QR Discovery:** Real-time SVG QR code generated in-browser with copyable join link (`?room=TR-9X`).
- **Camera Scanner:** Built-in mobile device camera scanner for instant QR code joining.
- **3-Seat Topology:** Ruby ($P_1$), Cyan ($P_2$), Amber ($P_3$) with live round-trip latency pings (e.g., `🟢 24ms`). Unoccupied seats can be toggled to local AI bot profiles.

---

## 📂 Repository File Tree

```
triarch/
├── index.html                    # Responsive PWA UI with Tailwind CSS CDN, Canvas & HUDs
├── manifest.json                 # Web App Manifest for mobile/desktop PWA installation
├── sw.js                         # Service Worker for offline asset caching & lifecycle
├── version.json                  # Semantic versioning and build manifest for auto-updates
├── package.json                  # Project metadata & npm test script
├── triarch.svg                   # Vector brandmark & Penrose cyclic die geometry
├── assets/
│   └── qr-scanner.min.js         # Lightweight camera QR scanner helper
├── icons/
│   ├── icon-192.png              # 192x192 PWA app icon
│   ├── icon-512.png              # 512x512 PWA app icon
│   └── icon-maskable.png         # 512x512 Maskable PWA icon
├── src/
│   ├── crypto/
│   │   ├── commit.js             # WebCrypto SHA-256 commitment & salt generation
│   │   └── index.js              # Crypto barrel export
│   ├── network/
│   │   ├── protocol.js           # Action envelope schemas, validation & state checksums
│   │   ├── signaling.js          # Serverless WebRTC signaling & multi-tab fallback
│   │   ├── peer-mesh.js          # 3-node DataChannel topology, heartbeats & seat negotiation
│   │   └── index.js              # Network barrel export
│   ├── math/
│   │   ├── dice.js               # Die class, validation, statistical analysis & presets
│   │   ├── probability.js        # Exact pairwise matrix, discrete convolutions, Monte Carlo
│   │   └── index.js              # Math module barrel export
│   ├── game/
│   │   ├── rules.js              # Game rules, phase machine constants & shard definitions
│   │   ├── bots.js               # AI decision engine (Cyclic Exploiter, Max EV, Tactician)
│   │   ├── state.js              # GameStateManager, round resolution & history ledger
│   │   ├── network-state.js      # Network state adapter & commit-reveal synchronizer
│   │   └── index.js              # Game engine barrel export
│   ├── audio/
│   │   └── sfx.js                # Procedural Web Audio synthesizer (rolls, clashes, chimes)
│   └── ui/
│       ├── visualizer.js         # Canvas cyclic graph renderer & 3D dice animations
│       ├── components.js         # DOM renderers (HUDs, Odds Matrix, Paradox visualizer)
│       ├── toast.js              # Glassmorphic toast notification queue
│       ├── tour.js               # First-time interactive guided tour modal
│       ├── qr.js                 # Pure SVG QR code generator & camera reader adapter
│       ├── lobby-view.js         # Multiplayer lobby modal, QR display & seat claim HUD
│       └── app.js                # Master application controller & PWA lifecycle hooks
├── test/
│   ├── crypto.test.js            # SHA-256 commit-reveal integrity & tamper tests
│   ├── network.test.js           # Protocol serialization, state checksums & seating tests
│   ├── dice.test.js              # Mathematical proofs for Die class, EV, variance & presets
│   ├── probability.test.js       # Convolutions, 3-way clash, Monte Carlo & graph cycles
│   └── game.test.js              # State transitions, bot behavior & clash resolutions
└── .github/
    └── workflows/
        └── deploy.yml            # CI/CD pipeline verifying math tests & deploying to Pages
```

---

## 🛠️ Local Development & Testing

### Running Tests
Execute the native Node.js automated test runner:
```bash
npm test
```

### Running Locally
Run any lightweight static web server:
```bash
# Using Python 3
python3 -m http.server 8080

# Or using npx serve
npx -y serve .
```
Then open `http://localhost:8080` in your web browser. To test multiplayer locally, open two browser tabs with `http://localhost:8080?room=TEST`.

---

## 📜 License
MIT License. Created for mathematics enthusiasts, game theorists, and tabletop strategists.
