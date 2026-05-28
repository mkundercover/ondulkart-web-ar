/**
 * app.js — Controller principale
 *
 * Flusso:
 *   1. Bottone START sullo schermo
 *   2. Tap → getUserMedia camera posteriore (sfondo video)
 *   3. Camera attiva → video visibile, Three.js trasparente sopra
 *   4. initAR() → WebXR (mobile) o fallback desktop
 *   5. Farfalle + hand tracking + overlay SVG
 */

import { TunnelScene } from './marco/scene.js';
import { ButterflySystem } from './marco/butterflies.js';
import { HandTracker } from './sandrx/handTracking.js';
import { SVGOverlay } from './sandrx/svgOverlay.js';

class ARApp {

  constructor() {
    this.tunnelScene     = null;
    this.butterflySystem = null;
    this.handTracker     = null;
    this.svgOverlay      = null;
    this.cameraStream    = null;

    this._startScreen = document.getElementById('start-screen');
    this._startBtn    = document.getElementById('start-btn');
    this._videoEl     = document.getElementById('camera-feed');
  }

  async init() {
    console.log('[App] Pronto — premi START');

    this._startBtn.addEventListener('click', () => this._onStartClicked());
  }

  /* ----------------------------------------------------------
   *  Tap START: camera → AR → esperienza
   * ---------------------------------------------------------- */
  async _onStartClicked() {
    this._startBtn.disabled = true;

    try {
      /* 1. Accendi la camera (posteriore) */
      await this._startCamera();

      /* 2. Tre.js scene (trasparente sopra il video) */
      this.tunnelScene = new TunnelScene();
      this._startRenderLoop();

      /* 3. Avvia WebXR AR o fallback desktop */
      await this.tunnelScene.initAR();
      // Su iPad: serve un secondo user gesture per WebXR,
      // quindi il webxr session parte tramite listener nel video click
      this._setupWebXRGesture();

      /* 4. Farfalle */
      this.butterflySystem = new ButterflySystem(this.tunnelScene.scene);

      /* 5. Hand tracking */
      this.handTracker = new HandTracker();
      this.handTracker.onHandDetected = (d) => this._onHandDetected(d);
      this.handTracker.onHandLost    = ()    => this._onHandLost();
      await this.handTracker.init();

      /* 6. SVG Overlay */
      this.svgOverlay = new SVGOverlay(document.getElementById('svg-overlay'));

      console.log('[App] ✓ Esperienza avviata');
    } catch (err) {
      console.error('[App] Errore:', err);
      document.body.innerHTML =
        `<div style="color:#fff;font-family:monospace;text-align:center;padding:40px;">
          <div style="color:#fe5000;font-size:16px;margin-bottom:12px;">Errore</div>
          <div style="font-size:12px;opacity:0.6;">${err.message}</div>
          <button onclick="location.reload()" style="margin-top:20px;padding:8px 20px;
            background:#fe5000;color:#fff;border:none;border-radius:4px;cursor:pointer;">
            Riprova
          </button>
        </div>`;
    }

    // Rimuovi start screen
    this._startScreen.classList.add('fade-out');
    setTimeout(() => { this._startScreen.style.display = 'none'; }, 500);
  }

  /* ----------------------------------------------------------
   *  Camera reale come sfondo
   * ---------------------------------------------------------- */
  async _startCamera() {
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // posteriore
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (err) {
      // Fallback: qualsiasi camera
      console.warn('[App] Camera posteriore fallita, provo qualsiasi:', err);
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true, audio: false,
      });
    }

    this._videoEl.srcObject = this.cameraStream;
    await this._videoEl.play();
    console.log('[App] Camera attiva');
  }

  /* ----------------------------------------------------------
   *  Su iOS Safari, WebXR richiede un user gesture.
   *  Tap sul video per avviare la sessione AR.
   * ---------------------------------------------------------- */
  _setupWebXRGesture() {
    if (!navigator.xr) return;

    const videoTap = async () => {
      if (this.tunnelScene.isAR) return;
      try {
        const session = await navigator.xr.requestSession('immersive-ar', {
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: document.body },
        });
        await this.tunnelScene.renderer.xr.setSession(session);
        this.tunnelScene.isAR = true;
        console.log('[App] Sessione AR avviata!');
      } catch (e) {
        console.log('[App] WebXR non disponibile su questo browser:', e);
      }
      this._videoEl.removeEventListener('click', videoTap);
    };

    this._videoEl.addEventListener('click', videoTap);
  }

  /* ----------------------------------------------------------
   *  Render loop
   * ---------------------------------------------------------- */
  _startRenderLoop() {
    this.tunnelScene.start((delta, timestamp) => {
      if (this.butterflySystem) {
        this.butterflySystem.update(delta, timestamp);
      }
    });
  }

  /* ----------------------------------------------------------
   *  Hand tracking callbacks
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
  new ARApp().init();
});
