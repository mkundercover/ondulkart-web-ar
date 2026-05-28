/* ── Import ES modules ── */
import { TunnelScene } from './marco/scene.js';
import { ButterflySystem } from './marco/butterflies.js';
import { HandTracker } from './sandrx/handTracking.js';
import { SVGOverlay } from './sandrx/svgOverlay.js';

/**
 * WEB AR APP — Controller principale
 *
 * Flusso:
 *   1. Crea scena 3D (tunnel visibile con sfondo scuro)
 *   2. Mostra orientamento (SOLO su mobile con giroscopio)
 *   3. Mostra bottone START 3D sul pavimento
 *   4. Tap START → farfalle + hand tracking + overlay SVG
 */

class ARApp {

  constructor() {
    this.tunnelScene     = null;
    this.butterflySystem = null;
    this.handTracker     = null;
    this.svgOverlay      = null;

    this._orientReady    = false;
    this._arStarted      = false;

    // Elementi DOM
    this._loadingScreen  = document.getElementById('loading-screen');
    this._orientGuide    = document.getElementById('orientation-guide');
    this._orientPhone    = document.getElementById('orient-phone');
    this._orientBar      = document.getElementById('orient-bar');
    this._orientReady    = document.getElementById('orient-ready');
    this._orientText     = document.getElementById('orient-instruction');
  }

  async init() {
    console.log('═══ AR Tunnel Experience ═══');

    try {
      /* ── PASSO 1: Scena 3D (subito, tunnel visibile) ── */
      this.tunnelScene = new TunnelScene();
      this._startRenderLoop();
      this._hideLoadingScreen();

      /* ── PASSO 2: Orientamento (solo mobile con DeviceOrientation) ── */
      await this._waitForOrientation();
      this._hideOrientationGuide();

      /* ── PASSO 3: Bottone START 3D sul pavimento ── */
      this.tunnelScene.createStartButton();

      /* ── PASSO 4: Aspetta il tap sul bottone START ── */
      await this._waitForStartTap();

      /* ── PASSO 5: Avvia AR/fallback + farfalle + hand tracking ── */
      await this._startExperience();

      console.log('[App] ✓ Esperienza avviata');
    } catch (err) {
      console.error('[App] Errore:', err);
      this._showError(err.message);
    }
  }

  /* ============================================================
     RENDER LOOP (sempre attivo)
     ============================================================ */
  _startRenderLoop() {
    this.tunnelScene.start((delta, timestamp) => {
      if (this.tunnelScene.startButton) {
        this.tunnelScene.updateStartButton(delta);
      }
      if (this.butterflySystem) {
        this.butterflySystem.update(delta, timestamp);
      }
    });
  }

  /* ============================================================
     PASSO 2 — Orientamento
     ============================================================ */
  _waitForOrientation() {
    return new Promise((resolve) => {
      let hasOrientation = false;
      let stableTimer = null;
      let lastBeta = null;

      const onOrientation = (e) => {
        if (e.beta === null) return;
        hasOrientation = true;

        const beta = e.beta; // 0=piatto, 90=dritto
        const inRange = (beta >= 50 && beta <= 130);

        // Barra progresso
        let pct;
        if (inRange) {
          const dist = Math.abs(beta - 90);
          pct = 100 - (dist / 40) * 30; // 70-100%
          this._orientPhone.classList.add('correct');
        } else {
          pct = Math.max(0, 50 - Math.abs(beta - 90) + 40);
          this._orientPhone.classList.remove('correct');
        }
        this._orientBar.style.width = `${Math.min(100, pct)}%`;

        // Stabile per 1s → pronto
        if (inRange) {
          if (lastBeta !== null && Math.abs(beta - lastBeta) < 2) {
            if (!stableTimer) {
              stableTimer = setTimeout(() => {
                window.removeEventListener('deviceorientation', onOrientation);
                this._orientReady = true;
                this._orientGuide.querySelector('.orient-ready').classList.add('visible');
                this._orientText.innerHTML = 'Ten il telefono <span class="correct-label">dritto</span>';
                resolve();
              }, 1000);
            }
          } else {
            if (stableTimer) { clearTimeout(stableTimer); stableTimer = null; }
          }
        } else {
          if (stableTimer) { clearTimeout(stableTimer); stableTimer = null; }
        }

        lastBeta = beta;
      };

      window.addEventListener('deviceorientation', onOrientation);

      // Desktop: niente giroscopio → salta subito
      setTimeout(() => {
        if (!hasOrientation) {
          console.log('[Sandro] No giroscopio — salto orientamento');
          window.removeEventListener('deviceorientation', onOrientation);
          this._orientGuide.style.display = 'none';
          resolve();
        }
      }, 1500);
    });
  }

  /* ============================================================
     PASSO 4 — Tap sul bottone START (raycaster 3D)
     ============================================================ */
  _waitForStartTap() {
    return new Promise((resolve) => {
      const onTap = (e) => {
        const cx = e.clientX || (e.touches && e.touches[0].clientX);
        const cy = e.clientY || (e.touches && e.touches[0].clientY);
        if (cx === undefined) return;

        if (this.tunnelScene.hitTestStartButton(cx, cy)) {
          console.log('[App] START premuto!');
          document.removeEventListener('click', onTap);
          document.removeEventListener('touchstart', onTap);
          this.tunnelScene.removeStartButton();
          resolve();
        }
      };
      document.addEventListener('click', onTap);
      document.addEventListener('touchstart', onTap);
    });
  }

  /* ============================================================
     PASSO 5 — Avvia l'esperienza
     ============================================================ */
  async _startExperience() {
    // AR o fallback desktop
    await this.tunnelScene.initAR();

    // Farfalle
    this.butterflySystem = new ButterflySystem(this.tunnelScene.scene);

    // Hand tracking
    this.handTracker = new HandTracker();
    this.handTracker.onHandDetected = (d) => this._onHandDetected(d);
    this.handTracker.onHandLost    = ()    => this._onHandLost();
    await this.handTracker.init();

    // Overlay SVG
    const overlayEl = document.getElementById('svg-overlay');
    this.svgOverlay = new SVGOverlay(overlayEl);

    this._arStarted = true;
  }

  /* ============================================================
     CALLBACKS
     ============================================================ */
  _onHandDetected(data) {
    const dot = document.getElementById('hand-dot');
    const txt = document.getElementById('hand-status-text');
    if (dot) dot.classList.add('active');
    if (txt) txt.textContent = `${data.handedness} ✓`;
    if (this.svgOverlay) this.svgOverlay.showAtPosition(data.x, data.y);
  }

  _onHandLost() {
    const dot = document.getElementById('hand-dot');
    const txt = document.getElementById('hand-status-text');
    if (dot) dot.classList.remove('active');
    if (txt) txt.textContent = 'No hand';
    if (this.svgOverlay) this.svgOverlay.hide();
  }

  /* ============================================================
     UI HELPERS
     ============================================================ */
  _hideLoadingScreen() {
    if (this._loadingScreen) {
      this._loadingScreen.classList.add('fade-out');
      setTimeout(() => { this._loadingScreen.style.display = 'none'; }, 500);
    }
  }

  _hideOrientationGuide() {
    if (this._orientGuide) {
      this._orientGuide.classList.add('fade-out');
      setTimeout(() => { this._orientGuide.style.display = 'none'; }, 400);
    }
  }

  _showError(msg) {
    document.body.innerHTML = `<div style="color:#ff3333;font-family:monospace;
      text-align:center;padding:40px 20px;">
      <div style="font-size:32px;margin-bottom:16px;">⚠</div>
      <div style="font-size:14px;margin-bottom:8px;">Errore</div>
      <div style="font-size:11px;opacity:0.6;">${msg}</div>
      <button onclick="location.reload()" style="margin-top:24px;padding:10px 24px;
        background:#fe5000;color:#fff;border:none;border-radius:4px;
        font-family:monospace;cursor:pointer;">Riprova</button>
    </div>`;
  }
}

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', () => {
  const app = new ARApp();
  app.init();
  window.__arApp = app;
});
