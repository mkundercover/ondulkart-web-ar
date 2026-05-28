/**
 * scene.js — Marco
 *
 * Renderer Three.js TRASPARENTE sopra il video camera.
 *
 * Tunnel: 6.30m x 2.85m x 25m
 * Ingresso a z=0 (dove sta l'utente), si estende verso -Z.
 *
 * Su WebXR AR: la camera è gestita da WebXR (hit-test pavimento).
 * Su desktop: DeviceOrientation muove la camera, altrimenti mouse/touch.
 */

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

class TunnelScene {

  constructor() {
    this.scene = new THREE.Scene();

    this.cameraHeight = 1.60;
    this.camera = new THREE.PerspectiveCamera(
      70, window.innerWidth / window.innerHeight, 0.01, 100
    );
    // Camera all'ingresso del tunnel, guarda verso -Z
    this.camera.position.set(0, this.cameraHeight, 0);
    this.camera.lookAt(0, this.cameraHeight, -10);

    // Renderer SEMPRE trasparente (video camera dietro)
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.xr.enabled = true;
    document.getElementById('ar-container').appendChild(this.renderer.domElement);

    this._setupLights();
    this.createWireframeTunnel();

    this.isAR = false;
    this.clock = new THREE.Clock();

    // Fallback desktop: orientamento iniziale
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._initDesktopControls();

    window.addEventListener('resize', () => this._onResize());
  }

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(3, 8, -5);
    this.scene.add(dir);
  }

  /* ----------------------------------------------------------
   *  Tunnel wireframe — 6.30 x 2.85 x 25 m
   *  Ingresso z=0, fondo z=-25
   * ---------------------------------------------------------- */
  createWireframeTunnel() {
    const W = 6.30, H = 2.85, L = 25.0, hw = W / 2;

    const mat = new THREE.LineBasicMaterial({
      color: 0xfe5000, transparent: true, opacity: 0.85,
    });

    const p = [];

    // 4 bordi longitudinali
    p.push(-hw,0,0, -hw,0,-L,  hw,0,0, hw,0,-L);
    p.push(-hw,H,0, -hw,H,-L,  hw,H,0, hw,H,-L);

    // Ingresso z=0 (4 lati)
    p.push(-hw,0,0, hw,0,0,  -hw,H,0, hw,H,0);
    p.push(-hw,0,0, -hw,H,0,  hw,0,0, hw,H,0);

    // Fondo z=-L (4 lati)
    p.push(-hw,0,-L, hw,0,-L,  -hw,H,-L, hw,H,-L);
    p.push(-hw,0,-L, -hw,H,-L,  hw,0,-L, hw,H,-L);

    // Traverse ogni 2.5m
    for (let i = 1; i <= 10; i++) {
      const z = -i * 2.5;
      p.push(-hw,0,z, hw,0,z,  -hw,H,z, hw,H,z);
      p.push(-hw,0,z, -hw,H,z,  hw,0,z, hw,H,z);
    }

    // Diagonali ogni 5m
    for (let i = 2; i <= 10; i += 2) {
      const z = -i * 2.5;
      p.push(-hw,0,z, hw,H,z,  hw,0,z, -hw,H,z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    this.scene.add(new THREE.LineSegments(geo, mat));

    // Pavimento leggero
    const floorGeo = new THREE.PlaneGeometry(W, L);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0xfe5000, transparent: true, opacity: 0.03,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -L / 2);
    this.scene.add(floor);
  }

  /* ----------------------------------------------------------
   *  Controlli desktop: DeviceOrientation + mouse/touch drag
   * ---------------------------------------------------------- */
  _initDesktopControls() {
    // DeviceOrientation (mobile senza WebXR)
    this._hasDeviceOrientation = false;
    window.addEventListener('deviceorientation', (e) => {
      if (e.alpha === null) return;
      this._hasDeviceOrientation = true;

      // Converti gradi → radianti
      const alpha = THREE.MathUtils.degToRad(e.alpha); // compass
      const beta  = THREE.MathUtils.degToRad(e.beta);  // front-back tilt
      const gamma = THREE.MathUtils.degToRad(e.gamma); // left-right tilt

      // Orientamento naturale: telefono in piedi, guarda davanti
      this._euler.set(beta - Math.PI / 2, alpha, -gamma, 'YXZ');
    });

    // Mouse/touch drag per desktop senza giroscopio
    let dragging = false, lastX = 0, lastY = 0;

    const onDown = (e) => {
      dragging = true;
      lastX = e.clientX || e.touches[0].clientX;
      lastY = e.clientY || e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (!dragging) return;
      const cx = e.clientX || e.touches[0].clientX;
      const cy = e.clientY || e.touches[0].clientY;
      const dx = (cx - lastX) / window.innerWidth;
      const dy = (cy - lastY) / window.innerHeight;
      lastX = cx; lastY = cy;

      this._euler.y -= dx * 2;   // pan orizzontale
      this._euler.x -= dy * 2;   // pan verticale
      this._euler.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this._euler.x));
    };
    const onUp = () => { dragging = false; };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onUp);
  }

  /* ----------------------------------------------------------
   *  Avvio AR (chiamato dal tap START = user gesture)
   * ---------------------------------------------------------- */
  async startARSession() {
    if (!navigator.xr) return false;

    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        optionalFeatures: ['dom-overlay', 'hit-test'],
        domOverlay: { root: document.body },
      });

      session.addEventListener('end', () => {
        this.isAR = false;
        console.log('[Marco] Sessione AR terminata');
      });

      await this.renderer.xr.setSession(session);
      this.isAR = true;
      console.log('[Marco] ✓ Sessione AR attiva!');
      return true;
    } catch (e) {
      console.warn('[Marco] WebXR non disponibile:', e);
      return false;
    }
  }

  /* ----------------------------------------------------------
   *  Render loop
   * ---------------------------------------------------------- */
  start(updateCallback) {
    const animate = (timestamp, frame) => {
      const delta = this.clock.getDelta();

      if (this.isAR && frame) {
        // WebXR gestisce tutto — camera, proiezione, anchoring
      } else if (!this.isAR) {
        // Desktop/mobile fallback: applica orientamento
        if (!this._hasDeviceOrientation) {
          // Leggera animazione idle
          const t = timestamp * 0.0003;
          this._euler.y = Math.sin(t) * 0.3;
        }
        this.camera.quaternion.setFromEuler(this._euler);
        this.camera.position.set(0, this.cameraHeight, 0);
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
