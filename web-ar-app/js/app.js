/**
 * app.js — Controller principale
 *
 * Flusso:
 *   1. Bottone START
 *   2. Tap → tenta WebXR AR (user gesture!) → se no, camera + fallback
 *   3. Farfalle + hand tracking + overlay SVG
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

    this._startScreen = document.getElementById('start-screen');
    this._startBtn    = document.getElementById('start-btn');
    this._videoEl     = document.getElementById('camera-feed');
  }

  async init() {
    console.log('[App] Pronto — premi START');
    this._startBtn.addEventListener('click', () => this._onStartClicked());
  }

  async _onStartClicked() {
    this._startBtn.disabled = true;

    try {
      /* 1. Scena Three.js */
      this.tunnelScene = new TunnelScene();
      this._startRenderLoop();

      /* 2. Attiva SEMPRE la camera per hand tracking + sfondo video */
      await this._startCamera();

      /* 3. Tenta WebXR AR (user gesture dal tap START) */
      await this.tunnelScene.startARSession();

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
    }

    // Rimuovi start screen
    this._startScreen.classList.add('fade-out');
    setTimeout(() => { this._startScreen.style.display = 'none'; }, 500);
  }

  async _startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 }, height: { ideal: 720 },
        },
        audio: false,
      });
      this._videoEl.srcObject = stream;
      await this._videoEl.play();
      console.log('[App] Camera attiva');
    } catch (err) {
      console.warn('[App] Camera non disponibile:', err);
      // Continua senza camera — tunnel su sfondo nero
    }
  }

  _startRenderLoop() {
    this.tunnelScene.start((delta, timestamp) => {
      if (this.butterflySystem) {
        this.butterflySystem.update(delta, timestamp);
      }
    });
  }

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

document.addEventListener('DOMContentLoaded', () => {
  new ARApp().init();
});
