/* ── Import ES modules ── */
import { TunnelScene } from './marco/scene.js';
import { ButterflySystem } from './marco/butterflies.js';
import { HandTracker } from './sandrx/handTracking.js';
import { SVGOverlay } from './sandrx/svgOverlay.js';

/**
 * WEB AR APP — Controller
 *
 * Flusso:
 *   1. Scena 3D in background (tunnel visibile)
 *   2. Schermata START sopra (bottone HTML)
 *   3. Tap START → avvia AR/fallback + farfalle + hand tracking
 */

class ARApp {

  constructor() {
    this.tunnelScene     = null;
    this.butterflySystem = null;
    this.handTracker     = null;
    this.svgOverlay      = null;

    this._startScreen = document.getElementById('start-screen');
    this._startBtn    = document.getElementById('start-btn');
  }

  async init() {
    console.log('═══ AR Tunnel Experience ═══');

    try {
      /* ── PASSO 1: Scena 3D subito (tunnel visibile dietro) ── */
      this.tunnelScene = new TunnelScene();
      this._startRenderLoop();

      /* ── PASSO 2: Bottone START sullo schermo ── */
      this._startBtn.addEventListener('click', () => this._onStartClicked());

    } catch (err) {
      console.error('[App] Errore:', err);
    }
  }

  /* ----------------------------------------------------------
   *  SANDRO: Tap sul bottone START
   * ---------------------------------------------------------- */
  async _onStartClicked() {
    this._startBtn.disabled = true;
    this._startScreen.classList.add('fade-out');

    try {
      /* AR o fallback desktop */
      await this.tunnelScene.initAR();

      /* Farfalle */
      this.butterflySystem = new ButterflySystem(this.tunnelScene.scene);

      /* Hand tracking */
      this.handTracker = new HandTracker();
      this.handTracker.onHandDetected = (d) => this._onHandDetected(d);
      this.handTracker.onHandLost    = ()    => this._onHandLost();
      await this.handTracker.init();

      /* SVG Overlay */
      this.svgOverlay = new SVGOverlay(document.getElementById('svg-overlay'));

      console.log('[App] ✓ Esperienza avviata');
    } catch (err) {
      console.error('[App] Errore START:', err);
      // Rimuovi schermata start comunque
    }

    setTimeout(() => {
      this._startScreen.style.display = 'none';
    }, 500);
  }

  /* ----------------------------------------------------------
   *  MARCO: Render loop (sempre attivo)
   * ---------------------------------------------------------- */
  _startRenderLoop() {
    this.tunnelScene.start((delta, timestamp) => {
      if (this.butterflySystem) {
        this.butterflySystem.update(delta, timestamp);
      }
    });
  }

  /* ----------------------------------------------------------
   *  Callbacks Hand Tracking
   * ---------------------------------------------------------- */
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
}

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', () => {
  const app = new ARApp();
  app.init();
  window.__arApp = app;
});
