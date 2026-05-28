/**
 * WEB AR APP — Sandro's Module
 * handTracking.js
 *
 * Sandro si occupa di:
 * - Tracciamento mano via MediaPipe Hands (da CDN come ES module)
 * - Riconoscimento mano aperta/chiusa
 * - Coordinate normalizzate del palmo per overlay SVG
 * - Callback per eventi hand-detected / hand-lost
 *
 * Usa la fotocamera POSTERIORE (environment) per AR,
 * con fallback sulla fotocamera frontale (user).
 */

/* ── Import ES module da CDN ──
   @mediapipe/tasks-vision è puro ESM, quindi lo importiamo
   direttamente come modulo dal CDN (skip jsdelivr/nosniff issues). */
import {
  FilesetResolver,
  HandLandmarker,
} from 'https://esm.run/@mediapipe/tasks-vision@0.10.18';

/* ============================================================
   SANDRO: HandTracker — MediaPipe Hands integration
   ============================================================ */
class HandTracker {

  constructor() {
    /* --- Stato --- */
    this.isHandVisible = false;
    this.wasHandVisible = false;
    this.handPosition = { x: 0.5, y: 0.5 }; // normalizzato 0-1
    this.handedness = 'unknown'; // 'Left' | 'Right'
    this.landmarks = null;

    /* --- Callbacks (collegate da app.js) --- */
    this.onHandDetected = null;  // fn({ x, y, handedness, landmarks })
    this.onHandLost = null;      // fn()

    /* --- Elemento video per MediaPipe --- */
    this.videoElement = null;

    /* --- Stato interno --- */
    this._handLandmarker = null;
    this._running = false;
    this._lastVideoTime = -1;
  }

  /* ----------------------------------------------------------
   *  SANDRO: Inizializza MediaPipe Hands + fotocamera
   *
   *  Carica il modello, crea un <video> element, avvia
   *  la fotocamera e il loop di detection.
   * ---------------------------------------------------------- */
  async init() {
    try {
      // 1. Carica il resolver e il modello HandLandmarker
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );

      // Prova GPU prima, poi fallback a CPU
      try {
        this._handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (gpuErr) {
        console.warn('[Sandro] GPU delegate fallito, provo CPU:', gpuErr);
        this._handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }

      console.log('[Sandro] HandLandmarker caricato');

      // 2. Usa il video element della camera principale (già attivo!)
      // Se non esiste ancora, crealo — ma MEGLIO condividere lo stesso stream
      this.videoElement = document.getElementById('camera-feed');
      if (!this.videoElement || !this.videoElement.srcObject) {
        // Fallback: crea video + camera propria
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);
        await this._startCamera();
      } else {
        console.log('[Sandro] Riutilizzo camera principale per hand tracking');
      }

      // 3. Avvia loop detection
      this._running = true;
      this._detectLoop();

      console.log('[Sandro] Hand tracking attivo');
    } catch (err) {
      console.error('[Sandro] Errore inizializzazione hand tracking:', err);
      // Disabilita tracking — l'app continua senza mano
      this._running = false;
    }
  }

  /* ----------------------------------------------------------
   *  SANDRO: Avvia fotocamera
   *
   *  Prova prima 'environment' (posteriore), poi 'user' (frontale).
   *  In fallback desktop, usa qualsiasi fotocamera disponibile.
   * ---------------------------------------------------------- */
  async _startCamera() {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = stream;
      await this.videoElement.play();
      console.log('[Sandro] Fotocamera attiva (environment)');
    } catch (err) {
      console.warn('[Sandro] Camera environment non disponibile, provo user:', err);
      // Fallback: fotocamera frontale
      constraints.video.facingMode = { ideal: 'user' };
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.videoElement.srcObject = stream;
        await this.videoElement.play();
        console.log('[Sandro] Fotocamera attiva (user/frontale)');
      } catch (err2) {
        console.error('[Sandro] Nessuna fotocamera disponibile:', err2);
        throw err2;
      }
    }
  }

  /* ----------------------------------------------------------
   *  SANDRO: Loop di detection
   *
   *  Esegue detectForVideo a ogni frame del video.
   *  Usa requestAnimationFrame per sincronizzazione efficiente.
   * ---------------------------------------------------------- */
  async _detectLoop() {
    if (!this._running || !this._handLandmarker) return;

    const video = this.videoElement;

    // Solo se il video ha un nuovo frame
    if (video.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = video.currentTime;

      try {
        const results = this._handLandmarker.detectForVideo(
          video,
          performance.now()
        );

        if (results.landmarks && results.landmarks.length > 0) {
          // Prendi la prima mano rilevata
          const landmarks = results.landmarks[0];
          const handedness = results.handednesses[0]?.[0]?.categoryName || 'unknown';

          // Landmark 9 = MIDDLE_FINGER_MCP (centro del palmo)
          const palmCenter = landmarks[9];

          this.handPosition = {
            x: palmCenter.x,
            y: palmCenter.y,
          };
          this.handedness = handedness;
          this.landmarks = landmarks;
          this.wasHandVisible = this.isHandVisible;
          this.isHandVisible = true;

          // Callback: mano rilevata
          if (this.onHandDetected) {
            this.onHandDetected({
              x: this.handPosition.x,
              y: this.handPosition.y,
              handedness: this.handedness,
              landmarks: this.landmarks,
            });
          }
        } else {
          // Nessuna mano rilevata
          if (this.isHandVisible) {
            this.wasHandVisible = true;
            this.isHandVisible = false;

            // Callback: mano persa
            if (this.onHandLost) {
              this.onHandLost();
            }
          }
        }
      } catch (err) {
        // Errore non fatale — continua il loop
        // console.warn('[Sandro] Detection error:', err);
      }
    }

    // Prossimo frame
    requestAnimationFrame(() => this._detectLoop());
  }

  /* ----------------------------------------------------------
   *  SANDRO: Restituisci coordinate schermo della mano
   *
   *  Converte le coordinate normalizzate (0-1) in pixel sullo schermo.
   *  Se la fotocamera è frontale (user), specchia X.
   *
   *  @returns {Object} { screenX, screenY } in pixel
   * ---------------------------------------------------------- */
  getScreenPosition() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Se fotocamera frontale, specchia X
    const isFrontCamera = this._isFrontCamera();
    const screenX = isFrontCamera
      ? (1 - this.handPosition.x) * w
      : this.handPosition.x * w;
    const screenY = this.handPosition.y * h;

    return { screenX, screenY };
  }

  /* ----------------------------------------------------------
   *  SANDRO: Verifica se la fotocamera attiva è frontale
   * ---------------------------------------------------------- */
  _isFrontCamera() {
    if (!this.videoElement || !this.videoElement.srcObject) return false;
    const track = this.videoElement.srcObject.getVideoTracks()[0];
    if (!track) return false;
    const settings = track.getSettings();
    return settings.facingMode === 'user';
  }

  /* ----------------------------------------------------------
   *  SANDRO: Stop tracking
   * ---------------------------------------------------------- */
  stop() {
    this._running = false;
    if (this.videoElement && this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach(t => t.stop());
    }
  }
}

export { HandTracker };
