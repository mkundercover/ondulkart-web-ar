/**
 * scene.js — Marco
 *
 * Setup Three.js con renderer TRASPARENTE sopra il video camera.
 * Su mobile: WebXR AR gestisce pose + proiezione.
 * Su desktop: camera fissa simulata che guarda il pavimento.
 *
 * Tunnel dimensioni reali: 6.30m x 2.85m x 25m
 */

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

class TunnelScene {

  constructor() {
    /* --- Scena --- */
    this.scene = new THREE.Scene();

    /* --- Camera --- */
    this.cameraHeight = 1.60;
    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, 100
    );
    this.camera.position.set(0, this.cameraHeight, -12.5);
    this.camera.lookAt(0, this.cameraHeight, -25);

    /* --- Renderer: SEMPRE trasparente (video dietro) --- */
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0); // trasparente!
    this.renderer.xr.enabled = true;
    document.getElementById('ar-container').appendChild(this.renderer.domElement);

    /* --- Luci --- */
    this._setupLights();

    /* --- Tunnel --- */
    this.createWireframeTunnel();

    /* --- Stato --- */
    this.isAR = false;
    this.fallbackAngle = 0;
    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => this._onResize());
  }

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, -5);
    this.scene.add(dir);
  }

  /* ----------------------------------------------------------
   *  Tunnel wireframe — dimensioni reali
   *  6.30m x 2.85m x 25m, utente a z=-12.5 m
   * ---------------------------------------------------------- */
  createWireframeTunnel() {
    const W = 6.30, H = 2.85, L = 25.0, hw = W / 2;

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xfe5000,
      transparent: true,
      opacity: 0.8,
    });

    const pos = [];

    // 4 bordi longitudinali
    pos.push(-hw,0,0, -hw,0,-L,  hw,0,0, hw,0,-L);
    pos.push(-hw,H,0, -hw,H,-L,  hw,H,0, hw,H,-L);

    // 4 bordi trasversali z=0
    pos.push(-hw,0,0, hw,0,0,  -hw,H,0, hw,H,0);
    pos.push(-hw,0,0, -hw,H,0,  hw,0,0, hw,H,0);

    // 4 bordi trasversali z=-L
    pos.push(-hw,0,-L, hw,0,-L,  -hw,H,-L, hw,H,-L);
    pos.push(-hw,0,-L, -hw,H,-L,  hw,0,-L, hw,H,-L);

    // Traverse ogni 2.5m
    for (let i = 0; i <= 10; i++) {
      const z = -i * 2.5;
      pos.push(-hw,0,z, hw,0,z,  -hw,H,z, hw,H,z);
      pos.push(-hw,0,z, -hw,H,z,  hw,0,z, hw,H,z);
    }

    // Diagonali ogni 5m
    for (let i = 0; i <= 10; i += 2) {
      const z = -i * 2.5;
      pos.push(-hw,0,z, hw,H,z,  hw,0,z, -hw,H,z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.scene.add(new THREE.LineSegments(geo, lineMat));

    // Pavimento semi-trasparente
    const floorGeo = new THREE.PlaneGeometry(W, L);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0xfe5000,
      transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -L / 2);
    this.scene.add(floor);
  }

  /* ----------------------------------------------------------
   *  Avvio: tenta WebXR AR, altrimenti fallback camera reale
   * ---------------------------------------------------------- */
  async initAR() {
    // Prova WebXR (iOS Safari)
    if (navigator.xr) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (supported) {
          this.renderer.xr.addEventListener('sessionstart', () => {
            this.isAR = true;
          });
          this.renderer.xr.addEventListener('sessionend', () => {
            this.isAR = false;
          });
          console.log('[Marco] WebXR AR disponibile — in attesa sessione');
          return;
        }
      } catch (e) {
        console.warn('[Marco] WebXR non supportato:', e);
      }
    }

    // Fallback desktop: camera simulata orizzontale (vado verso -Z)
    console.log('[Marco] Fallback desktop — camera fissa verso tunnel');
    this.isAR = false;
    this.camera.position.set(0, this.cameraHeight, 0);
    this.camera.lookAt(0, this.cameraHeight, -25);
  }

  /* ----------------------------------------------------------
   *  Render loop
   * ---------------------------------------------------------- */
  start(updateCallback) {
    const animate = (timestamp, frame) => {
      const delta = this.clock.getDelta();

      // Se AR attiva: WebXR gestisce camera+proiezione
      if (!this.isAR && frame) {
        // WebXR: il frame contiene la view corretta
        // Non toccare camera
      }

      if (!this.isAR) {
        // Desktop fallback: leggero movimento ondulatorio
        const t = timestamp * 0.0001;
        this.camera.position.x = Math.sin(t) * 0.3;
        this.camera.position.y = this.cameraHeight + Math.sin(t * 1.3) * 0.05;
        this.camera.lookAt(0, this.cameraHeight, -10);
      }

      if (updateCallback) updateCallback(delta, timestamp);
      this.renderer.render(this.scene, this.camera);
    };
    this.renderer.setAnimationLoop(animate);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}

export { TunnelScene };
