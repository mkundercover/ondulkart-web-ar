/**
 * WEB AR APP — Marco's Module
 * scene.js
 *
 * Marco si occupa di:
 * - Setup scena Three.js (camera, renderer, luci)
 * - Creazione tunnel wireframe in AR dimensioni reali
 * - Sessione WebXR (immersive-ar) + fallback desktop
 * - Render loop principale
 *
 * Dimensioni reali tunnel:
 *   Lunghezza: 25 m  |  Altezza: 285 cm (2.85 m)  |  Larghezza: 630 cm (6.30 m)
 * L'utente è a metà tunnel (z = -12.5 m), guarda verso -Z.
 */

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

/* ============================================================
   MARCO: TunnelScene — Setup completo scene Three.js + WebXR
   ============================================================ */
class TunnelScene {

  constructor() {
    /* --- Scena --- */
    this.scene = new THREE.Scene();
    // Nessun sfondo: alpha renderer = true → video AR visibile sotto

    /* --- Camera ---
     * FOV 75° tipico smartphone, near 0.1 m, far 100 m.
     * Altezza camera = 1.60 m (media occhio umano in piedi). */
    this.cameraHeight = 1.60;
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    // Utente a metà tunnel
    this.camera.position.set(0, this.cameraHeight, -12.5);
    this.camera.lookAt(0, this.cameraHeight, -25);

    /* --- Renderer ---
     * Su desktop/fallback: sfondo scuro opaco (#0a0a0a) per vedere il tunnel.
     * Su AR (WebXR): diventa trasparente per vedere il feed video. */
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x0a0a0a, 1); // sfondo scuro opaco (fallback desktop)
    this.renderer.xr.enabled = true;
    document.getElementById('ar-container').appendChild(this.renderer.domElement);

    /* --- Luci --- */
    this._setupLights();

    /* --- Tunnel --- */
    this.createWireframeTunnel();

    /* --- Stato --- */
    this.isAR = false;
    this.fallbackX = 15;  // posizione X simulata nel fallback
    this.clock = new THREE.Clock();

    /* --- Resize --- */
    window.addEventListener('resize', () => this._onResize());
  }

  /* ----------------------------------------------------------
   *  MARCO: Illuminazione scena
   * ---------------------------------------------------------- */
  _setupLights() {
    // Ambient light lieve per non avere zone completamente nere
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Direzionale principale — simula sole/luce ambientale
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, -5);
    this.scene.add(dirLight);

    // Secondario per riempire ombre dal basso
    const fillLight = new THREE.DirectionalLight(0xccccff, 0.3);
    fillLight.position.set(-3, -2, 5);
    this.scene.add(fillLight);
  }

  /* ----------------------------------------------------------
   *  MARCO: Tunnel Wireframe
   *
   *  Dimensioni reali:
   *    width  = 6.30 m  (X: -3.15 … +3.15)
   *    height = 2.85 m  (Y:  0.00 …  2.85)
   *    length = 25.0 m  (Z:  0.00 … -25.0)
   *
   *  L'utente è a z = -12.5 (metà tunnel).
   *
   *  Costruiamo le 4 "pareti" come piani sottili, poi
   *  estraggiamo gli spigoli con EdgesGeometry → LineSegments.
   *  Aggiungiamo anche traverse ogni 2.5 m.
   * ---------------------------------------------------------- */
  createWireframeTunnel() {
    const W = 6.30;   // larghezza totale (X)
    const H = 2.85;   // altezza totale  (Y)
    const L = 25.0;   // lunghezza totale (Z)
    const hw = W / 2; // mezza larghezza = 3.15

    // Materiale wireframe — grigio chiaro semi-trasparente
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.75,
      linewidth: 1,
    });

    /* --- Geometria combinata: tutte le linee del tunnel ---
     * Costruiamo manualmente i vertici dei bordi per avere
     * il pieno controllo su traverse e spigoli. */
    const positions = [];

    // ══════════════════════════════════════════════
    // 4 bordi longitudinali (lungo Z, da 0 a -25)
    // ══════════════════════════════════════════════
    // Bottom-left  (x=-hw, y=0)
    positions.push(-hw, 0, 0,  -hw, 0, -L);
    // Bottom-right (x=+hw, y=0)
    positions.push(hw, 0, 0,   hw, 0, -L);
    // Top-left     (x=-hw, y=H)
    positions.push(-hw, H, 0,  -hw, H, -L);
    // Top-right    (x=+hw, y=H)
    positions.push(hw, H, 0,   hw, H, -L);

    // ══════════════════════════════════════════════
    // 4 bordi trasversali all'ingresso (z = 0)
    // ══════════════════════════════════════════════
    // Bottom edge
    positions.push(-hw, 0, 0,   hw, 0, 0);
    // Top edge
    positions.push(-hw, H, 0,   hw, H, 0);
    // Left edge
    positions.push(-hw, 0, 0,  -hw, H, 0);
    // Right edge
    positions.push(hw, 0, 0,   hw, H, 0);

    // ══════════════════════════════════════════════
    // 4 bordi trasversali alla fine (z = -L)
    // ══════════════════════════════════════════════
    positions.push(-hw, 0, -L,   hw, 0, -L);
    positions.push(-hw, H, -L,   hw, H, -L);
    positions.push(-hw, 0, -L,  -hw, H, -L);
    positions.push(hw, 0, -L,   hw, H, -L);

    // ══════════════════════════════════════════════
    // Traverse interne ogni 2.5 m (10 sezioni)
    // Sezione trasversale = rettangolo a z = -i*2.5
    // ══════════════════════════════════════════════
    const segmentLength = 2.5;
    const numSegments = Math.floor(L / segmentLength); // 10
    for (let i = 0; i <= numSegments; i++) {
      const z = -i * segmentLength;
      // Bottom edge
      positions.push(-hw, 0, z,   hw, 0, z);
      // Top edge
      positions.push(-hw, H, z,   hw, H, z);
      // Left edge
      positions.push(-hw, 0, z,  -hw, H, z);
      // Right edge
      positions.push(hw, 0, z,   hw, H, z);
    }

    // ══════════════════════════════════════════════
    // Linee diagonali di rinforzo ogni 5 m
    // (da bottom-left a top-right e viceversa)
    // ══════════════════════════════════════════════
    for (let i = 0; i <= numSegments; i += 2) {
      const z = -i * segmentLength;
      // Diagonale inferiore: bottom-left → bottom-right (già c'è)
      // Diagonale verticale sinistra: bottom-left → top-left (già c'è)
      // Diametro posteriore
      positions.push(-hw, 0, z,  hw, H, z);
      positions.push(hw, 0, z,  -hw, H, z);
    }

    // ══════════════════════════════════════════════
    // BufferGeometry → LineSegments
    // ══════════════════════════════════════════════
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',
      new THREE.Float32BufferAttribute(positions, 3)
    );

    const tunnelLines = new THREE.LineSegments(geo, lineMat);
    this.scene.add(tunnelLines);

    /* --- Piano di riferimento a terra (tenue) --- */
    const floorGeo = new THREE.PlaneGeometry(W, L);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -L / 2);
    this.scene.add(floor);
  }

  /* ----------------------------------------------------------
   *  MARCO: Avvia sessione AR
   *
   *  Su WebXR (iOS Safari): avvia沉浸式 AR con sfondo video.
   *  Desktop/fallback: il renderer resta opaco con sfondo #0a0a0a.
   *
   *  Quando la sessione AR parte, il renderer diventa trasparente.
   * ---------------------------------------------------------- */
  async initAR() {
    if (navigator.xr) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (supported) {
          this.renderer.xr.addEventListener('sessionstart', () => {
            this.isAR = true;
            // AR attivo → renderer trasparente per vedere video
            this.renderer.setClearColor(0x000000, 0);
            console.log('[Marco] Sessione AR attiva — renderer trasparente');
          });
          return;
        }
      } catch (e) {
        console.warn('[Marco] WebXR AR non supportato:', e);
      }
    }

    // Fallback desktop: nessun AR, sfondo scuro opaco
    this.isAR = false;
    this.renderer.setClearColor(0x0a0a0a, 1);
    console.log('[Marco] Fallback desktop — camera simulata');
    document.getElementById('fallback-message').classList.add('visible');
    this._enterFallbackMode();
  }

  /* ----------------------------------------------------------
   *  MARCO: Modalità fallback (desktop senza AR)
   *
   *  La camera si muove lungo X da +15 a -15 simula
   *  lo scorrimento del tunnel da destra a sinistra.
   * ---------------------------------------------------------- */
  _enterFallbackMode() {
    this.isAR = false;
    this.fallbackX = 15;
    this.camera.position.set(this.fallbackX, this.cameraHeight, -5);
    this.camera.lookAt(0, this.cameraHeight, -15);
  }

  /* ----------------------------------------------------------
   *  MARCO: Render loop principale
   *
   *  Usa setAnimationLoop di Three.js (compatibile WebXR).
   *  Chiamato a ogni frame: aggiorna farfalle, camera,
   *  e renderizza la scena.
   *
   *  @param {Function} updateCallback — chiamata esterna
   *    per aggiornare sistemi (es. farfalle).
   * ---------------------------------------------------------- */
  start(updateCallback) {
    const animate = (timestamp, frame) => {
      const delta = this.clock.getDelta();

      // Se AR: il frame WebXR provvede alla view/projection
      if (!this.isAR) {
        // Fallback: muovi camera da destra verso sinistra
        this.fallbackX -= 1.8 * delta; // ~1.8 m/s
        if (this.fallbackX < -15) this.fallbackX = 15;
        this.camera.position.x = this.fallbackX;
        this.camera.lookAt(0, this.cameraHeight, -15);
      }

      // Callback per aggiornare sistemi esterni (farfalle, ecc.)
      if (updateCallback) updateCallback(delta, timestamp);

      // Render
      this.renderer.render(this.scene, this.camera);
    };

    this.renderer.setAnimationLoop(animate);
  }

  /* ----------------------------------------------------------
   *  MARCO: Aggiorna le dimensioni camera/renderer al resize
   * ---------------------------------------------------------- */
  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /* ----------------------------------------------------------
   *  MARCO: Utility — restituisci posizione 3D utile per Sandro
   *
   *  Centro del tunnel nello spazio world: (0, 1.425, -12.5)
   * ---------------------------------------------------------- */
  getTunnelWorldPosition() {
    return new THREE.Vector3(0, 2.85 / 2, -12.5);
  }

  /* ----------------------------------------------------------
   *  MARCO: Avvia sessione AR su click (user gesture)
   * ---------------------------------------------------------- */
  async startARSession() {
    if (navigator.xr && !this.isAR) {
      try {
        const session = await navigator.xr.requestSession('immersive-ar', {
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: document.body },
        });
        await this.renderer.xr.setSession(session);
        this.isAR = true;
        console.log('[Marco] Sessione AR avviata');
      } catch (e) {
        console.warn('[Marco] Impossibile avviare AR:', e);
        this._enterFallbackMode();
      }
    }
  }

}

export { TunnelScene };
