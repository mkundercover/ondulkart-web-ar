/* ── Import ES modules ── */
import { TunnelScene } from './marco/scene.js';
import { ButterflySystem } from './marco/butterflies.js';
import { HandTracker } from './sandrx/handTracking.js';
import { SVGOverlay } from './sandrx/svgOverlay.js';

/**
 * WEB AR APP — Controller principale
 *
 * Flusso:
 *   FASE 0: Schermata orientamento ("metti il telefono dritto")
 *   FASE 1: Mostra bottone START 3D sul pavimento
 *   FASE 2: Tap su START → avvia AR (WebXR) o fallback desktop
 *   FASE 3: Inizializza farfalle, hand tracking, overlay SVG
 *   FASE 4: Render loop
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
    this._initialized      = false;
    this._orientationReady = false;
    this._startButtonShown = false;
    this._arStarted        = false;

    /* --- Elementi DOM orientamento --- */
    this._orientGuide    = document.getElementById('orientation-guide');
    this._orientPhone    = document.getElementById('orient-phone');
    this._orientBar      = document.getElementById('orient-bar');
    this._orientReady    = document.getElementById('orient-ready');
    this._orientText     = document.getElementById('orient-instruction');
  }

  /* ----------------------------------------------------------
   *  BOOT — Avvia il flusso dall'inizio
   * ---------------------------------------------------------- */
  async init() {
    console.log('═══ AR Tunnel Experience ═══');
    console.log('[App] Inizializzazione…');

    try {
      /* ── FASE -1: Prepara subito la scena 3D (camera, tunnel) ── */
      console.log('[App] [Marco] Creazione scena Three.js…');
      this.tunnelScene = new TunnelScene();

      // Avvia subito il render loop per mostrare il tunnel animato
      // durante orientamento e attesa tap su START.
      // Il loading screen rimane visibile (z-index 100 > z-index scena).
      this._startRenderLoop();

      /* ── FASE 0: Attendi orientamento corretto ── */
      console.log('[App] [Sandro] Attesa orientamento dispositivo…');
      await this._waitForOrientation();

      /* ── FASE 1: Mostra bottone START 3D sul pavimento ── */
      console.log('[App] [Marco] Mostra bottone START…');
      this._showStartButton();

      /* ── FASE 2: Bottone START → avvia AR ── */
      // Il tap sul bottone viene gestito da _setupStartButtonListener()
      // che chiama _onStartTapped()

      // NOTA: il resto dell'inizializzazione (farfalle, hand tracking, render loop)
      // avviene DOPO il tap su START in _onStartTapped()

    } catch (err) {
      console.error('[App] Errore inizializzazione:', err);
      this._showError(err.message);
    }
  }

  /* ============================================================
     FASE 0 — SANDRO: Orientamento telefono
     ============================================================ */

  /* ----------------------------------------------------------
   *  SANDRO: Ascolta DeviceOrientation finché il telefono
   *  non è "dritto" (beta tra 70° e 110°).
   *
   *  Aggiorna la barra di progresso e l'icona telefono.
   *  Quando stabile per 1.5s → resolve la Promise.
   * ---------------------------------------------------------- */
  _waitForOrientation() {
    return new Promise((resolve) => {
      // Su desktop (nessun deviceorientation) → salta dopo 1.5s
      let hasDeviceOrientation = false;
      let stableTimer = null;
      let lastBeta = null;

      const BETA_MIN = 45;
      const BETA_MAX = 135;
      const STABLE_MS = 1500;

      const checkOrientation = (event) => {
        const beta = event.beta; // -180 … 180. 0=piatto, 90=dritto
        if (beta === null) return;

        hasDeviceOrientation = true;

        // Calcolo qualità orientamento (0 → 100)
        let quality;
        if (beta >= BETA_MIN && beta <= BETA_MAX) {
          // Zona corretta: map da angolo a 70-100%
          const center = 90;
          const dist = Math.abs(beta - center);
          quality = 100 - (dist / (BETA_MAX - center)) * 30; // 70–100%

          // Colora il telefono di verde
          this._orientPhone.classList.add('correct');
        } else {
          // Fuori zona: 0–30%
          const nearest = beta < BETA_MIN ? BETA_MIN : BETA_MAX;
          const dist = Math.abs(beta - nearest);
          quality = Math.max(0, 30 - dist);
          this._orientPhone.classList.remove('correct');
        }

        // Aggiorna barra
        this._orientBar.style.width = `${quality}%`;

        // Controlla stabilità
        if (beta >= BETA_MIN && beta <= BETA_MAX) {
          if (lastBeta !== null && Math.abs(beta - lastBeta) < 3) {
            // Beta stabile nella zona corretta
            if (!stableTimer) {
              stableTimer = setTimeout(() => {
                console.log('[App] [Sandro] Orientamento corretto confermato');
                window.removeEventListener('deviceorientation', checkOrientation);
                this._onOrientationReady();
                resolve();
              }, STABLE_MS);
            }
          } else {
            // Beta nella zona ma non stabile → reset timer
            if (stableTimer) {
              clearTimeout(stableTimer);
              stableTimer = null;
            }
          }
        } else {
          // Fuori zona → reset timer
          if (stableTimer) {
            clearTimeout(stableTimer);
            stableTimer = null;
          }
        }

        lastBeta = beta;
      };

      window.addEventListener('deviceorientation', checkOrientation);

      // Fallback desktop: se dopo 2s niente evento, salta
      setTimeout(() => {
        if (!hasDeviceOrientation) {
          console.log('[App] [Sandro] DeviceOrientation non disponibile, salta orientamento');
          window.removeEventListener('deviceorientation', checkOrientation);
          this._onOrientationReady();
          resolve();
        }
      }, 2000);
    });
  }

  /* ----------------------------------------------------------
   *  SANDRO: Orientamento corretto → aggiorna UI
   * ---------------------------------------------------------- */
  _onOrientationReady() {
    this._orientationReady = true;

    // Mostra "completato"
    this._orientReady.classList.add('visible');
    this._orientText.innerHTML = 'Orientamento <span class="correct-label">corretto</span>';

    // Dopo 1s mostra il bottone START
    setTimeout(() => {
      this._orientGuide.classList.add('fade-out');
      setTimeout(() => {
        this._orientGuide.style.display = 'none';
      }, 400);
    }, 1000);
  }

  /* ============================================================
     FASE 1 — MARCO: Bottone START 3D
     ============================================================ */

  /* ----------------------------------------------------------
   *  MARCO: Crea e mostra il bottone START sul pavimento
   * ---------------------------------------------------------- */
  _showStartButton() {
    this.tunnelScene.createStartButton();
    this._startButtonShown = true;

    // Listener per il tap sul bottone
    this._setupStartButtonListener();
  }

  /* ----------------------------------------------------------
   *  MARCO: Listener tap sul bottone START (raycaster 3D)
   * ---------------------------------------------------------- */
  _setupStartButtonListener() {
    const onTap = async (e) => {
      // Coordinate del tap
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);

      if (clientX === undefined || clientY === undefined) return;

      if (this.tunnelScene.hitTestStartButton(clientX, clientY)) {
        console.log('[App] [Marco] Bottone START premuto!');
        // Rimuovi listener
        document.removeEventListener('click', onTap);
        document.removeEventListener('touchstart', onTap);

        // Rimuovi bottone e avvia AR
        this.tunnelScene.removeStartButton();
        await this._onStartTapped();
      }
    };

    document.addEventListener('click', onTap);
    document.addEventListener('touchstart', onTap);
  }

  /* ============================================================
     FASE 2 → 3: Dopo tap su START
     ============================================================ */

  /* ----------------------------------------------------------
   *  Avvia il resto dell'app dopo il tap su START
   * ---------------------------------------------------------- */
  async _onStartTapped() {
    this._arStarted = true;

    try {
      /* ── FASE 2a: Avvia sessione AR (o fallback) ── */
      console.log('[App] Avvio sessione AR…');
      await this.tunnelScene.initAR();
      // initAR() su Chrome desktop va in fallback automaticamente
      // Su Safari iOS, aspetta user gesture → sessionstart

      /* ── FASE 3a: Farfalle ── */
      console.log('[App] [Marco] Creazione sistema farfalle…');
      this.butterflySystem = new ButterflySystem(this.tunnelScene.scene);

      /* ── FASE 3b: Hand Tracking ── */
      console.log('[App] [Sandro] Inizializzazione hand tracking…');
      this.handTracker = new HandTracker();
      this.handTracker.onHandDetected = (data) => this._onHandDetected(data);
      this.handTracker.onHandLost    = ()    => this._onHandLost();
      await this.handTracker.init();

      /* ── FASE 3c: SVG Overlay ── */
      console.log('[App] [Sandro] Creazione overlay SVG…');
      const overlayEl = document.getElementById('svg-overlay');
      this.svgOverlay = new SVGOverlay(overlayEl);

      /* ── FASE 4: Nascondi loading (render loop già attivo da _startRenderLoop) ── */
      this._hideLoadingScreen();

      // Gestore resize su finestra
      this._setupUserGestureForAR();

      this._initialized = true;
      console.log('[App] ✓ Inizializzazione completata');

    } catch (err) {
      console.error('[App] Errore post-START:', err);
      this._showError(err.message);
    }
  }

  /* ----------------------------------------------------------
   *  MARCO: Render loop — avviato subito, gira per tutta la durata
   *
   *  Anima il tunnel, il bottone START (se presente),
   *  e le farfalle (se inizializzate).
   * ---------------------------------------------------------- */
  _startRenderLoop() {
    this.tunnelScene.start((delta, timestamp) => {
      // Bottone START (fase 1: prima del tap)
      if (this.tunnelScene.startButton) {
        this.tunnelScene.updateStartButton(delta);
      }

      // Farfalle (fase 3: dopo tap su START)
      if (this.butterflySystem) {
        this.butterflySystem.update(delta, timestamp);
      }
    });
  }

  /* ----------------------------------------------------------
   *  MARCO: Su Safari iOS, il tap serve anche per avviare WebXR
   *  Questo gestore rimane attivo dopo START per forzare
   *  la sessione AR su click/touch (user gesture richiesto)
   * ---------------------------------------------------------- */
  _setupUserGestureForAR() {
    const startAR = async () => {
      if (this.tunnelScene && !this.tunnelScene.isAR) {
        await this.tunnelScene.startARSession();
      }
      document.removeEventListener('click', startAR);
      document.removeEventListener('touchstart', startAR);
    };
    document.addEventListener('click', startAR);
    document.addEventListener('touchstart', startAR);
  }

  /* ============================================================
     SANDRO: Callbacks Hand Tracking
     ============================================================ */

  _onHandDetected(data) {
    const dot = document.getElementById('hand-dot');
    const text = document.getElementById('hand-status-text');
    if (dot) dot.classList.add('active');
    if (text) text.textContent = `${data.handedness} hand ✓`;

    if (this.svgOverlay) {
      this.svgOverlay.showAtPosition(data.x, data.y);
    }
  }

  _onHandLost() {
    const dot = document.getElementById('hand-dot');
    const text = document.getElementById('hand-status-text');
    if (dot) dot.classList.remove('active');
    if (text) text.textContent = 'No hand';

    if (this.svgOverlay) {
      this.svgOverlay.hide();
    }
  }

  /* ============================================================
     UI: Utilità
     ============================================================ */

  _hideLoadingScreen() {
    const loader = document.getElementById('loading-screen');
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => {
        loader.style.display = 'none';
      }, 500);
    }
  }

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
  window.__arApp = app;
});
