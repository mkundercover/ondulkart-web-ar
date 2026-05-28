/* ── Import ES module: HandTracker (MediaPipe wrapper) ── */
import { HandTracker } from './sandrx/handTracking.js';

/**
 * WEB AR APP — Controller principale
 *
 * Colla i moduli di Marco (scena 3D, tunnel, farfalle)
 * con quelli di Sandro (hand tracking, SVG overlay, UI dati).
 *
 * Flusso:
 *   1. Inizializza scena Three.js (Marco)
 *   2. Inizializza sistema farfalle (Marco)
 *   3. Inizializza hand tracking (Sandro)
 *   4. Inizializza overlay SVG (Sandro)
 *   5. Collega callback mano ↔ overlay
 *   6. Avvia render loop
 */

/* ============================================================
   ARApp — Entry point
   ============================================================ */
class ARApp {

  constructor() {
    /* --- Moduli Marco --- */
    this.tunnelScene    = null;
    this.butterflySystem = null;

    /* --- Moduli Sandro --- */
    this.handTracker = null;
    this.svgOverlay  = null;

    /* --- Stato --- */
    this._initialized = false;
  }

  /* ----------------------------------------------------------
   *  Inizializzazione completa
   * ---------------------------------------------------------- */
  async init() {
    console.log('═══ AR Tunnel Experience ═══');
    console.log('[App] Inizializzazione…');

    try {
      /* ── FASE 1: Marco — Scena 3D ── */
      console.log('[App] [Marco] Creazione scena Three.js…');
      this.tunnelScene = new TunnelScene();
      await this.tunnelScene.initAR();

      /* ── FASE 2: Marco — Farfalle ── */
      console.log('[App] [Marco] Creazione sistema farfalle…');
      this.butterflySystem = new ButterflySystem(this.tunnelScene.scene);

      /* ── FASE 3: Sandro — Hand Tracking ── */
      console.log('[App] [Sandro] Inizializzazione hand tracking…');
      this.handTracker = new HandTracker();

      // Collega callback Sandro ↔ Overlay
      this.handTracker.onHandDetected = (data) => {
        this._onHandDetected(data);
      };
      this.handTracker.onHandLost = () => {
        this._onHandLost();
      };

      await this.handTracker.init();

      /* ── FASE 4: Sandro — SVG Overlay ── */
      console.log('[App] [Sandro] Creazione overlay SVG…');
      const overlayEl = document.getElementById('svg-overlay');
      this.svgOverlay = new SVGOverlay(overlayEl);

      /* ── FASE 5: Avvia render loop (Marco) ── */
      console.log('[App] [Marco] Avvio render loop…');
      this.tunnelScene.start((delta, timestamp) => {
        // Aggiorna farfalle (Marco)
        if (this.butterflySystem) {
          this.butterflySystem.update(delta, timestamp);
        }
      });

      /* ── FASE 6: UI ── */
      this._hideLoadingScreen();
      this._setupUserGesture();

      this._initialized = true;
      console.log('[App] ✓ Inizializzazione completata');

    } catch (err) {
      console.error('[App] Errore inizializzazione:', err);
      this._showError(err.message);
    }
  }

  /* ----------------------------------------------------------
   *  SANDRO: Callback — mano rilevata
   *
   *  Chiamata quando MediaPipe rileva una mano aperta.
   *  Mostra l'SVG overlay alla posizione del palmo.
   *
   *  @param {Object} data — { x, y, handedness, landmarks }
   * ---------------------------------------------------------- */
  _onHandDetected(data) {
    // Aggiorna indicatore UI
    const dot = document.getElementById('hand-dot');
    const text = document.getElementById('hand-status-text');
    if (dot) dot.classList.add('active');
    if (text) text.textContent = `${data.handedness} hand ✓`;

    // Mostra overlay SVG alla posizione della mano
    if (this.svgOverlay) {
      this.svgOverlay.showAtPosition(data.x, data.y);
    }
  }

  /* ----------------------------------------------------------
   *  SANDRO: Callback — mano persa
   *
   *  Chiamata quando la mano esce dall'inquadratura.
   *  Nasconde immediatamente l'overlay.
   * ---------------------------------------------------------- */
  _onHandLost() {
    // Aggiorna indicatore UI
    const dot = document.getElementById('hand-dot');
    const text = document.getElementById('hand-status-text');
    if (dot) dot.classList.remove('active');
    if (text) text.textContent = 'No hand';

    // Nasconde overlay
    if (this.svgOverlay) {
      this.svgOverlay.hide();
    }
  }

  /* ----------------------------------------------------------
   *  MARCO: Gestione user gesture per avvio AR
   *
   *  WebXR richiede un user gesture per avviare la sessione.
   *  Aggiungiamo un tap/click listener globale.
   * ---------------------------------------------------------- */
  _setupUserGesture() {
    const startAR = async () => {
      if (this.tunnelScene && !this.tunnelScene.isAR) {
        await this.tunnelScene.startARSession();
      }
      // Rimuovi il listener dopo il primo gesture
      document.removeEventListener('click', startAR);
      document.removeEventListener('touchstart', startAR);
    };

    document.addEventListener('click', startAR);
    document.addEventListener('touchstart', startAR);
  }

  /* ----------------------------------------------------------
   *  UI: Nasconde schermata di caricamento
   * ---------------------------------------------------------- */
  _hideLoadingScreen() {
    const loader = document.getElementById('loading-screen');
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => {
        loader.style.display = 'none';
      }, 500);
    }
  }

  /* ----------------------------------------------------------
   *  UI: Mostra errore
   * ---------------------------------------------------------- */
  _showError(message) {
    const loader = document.getElementById('loading-screen');
    if (loader) {
      loader.innerHTML = `
        <div style="color: #ff3333; font-family: monospace; text-align: center; padding: 20px;">
          <div style="font-size: 24px; margin-bottom: 16px;">⚠</div>
          <div style="font-size: 14px; margin-bottom: 8px;">Initialization Error</div>
          <div style="font-size: 11px; opacity: 0.6;">${message}</div>
          <button onclick="location.reload()"
            style="margin-top: 20px; padding: 8px 20px; background: #fe5000;
                   color: white; border: none; border-radius: 4px;
                   font-family: monospace; cursor: pointer;">
            Retry
          </button>
        </div>
      `;
    }
  }
}

/* ============================================================
   BOOT — Avvia l'app quando il DOM è pronto
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const app = new ARApp();
  app.init();

  // Esponi per debug in console
  window.__arApp = app;
});
