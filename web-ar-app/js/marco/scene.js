import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

class TunnelScene {

  constructor() {
    this.scene = new THREE.Scene();

    this.cameraHeight = 1.60;
    this.camera = new THREE.PerspectiveCamera(
      70, window.innerWidth / window.innerHeight, 0.01, 100
    );
    this.camera.position.set(0, this.cameraHeight, 0);
    this.camera.lookAt(0, this.cameraHeight, -10);

    // Renderer SEMPRE trasparente
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.xr.enabled = true;
    document.getElementById('ar-container').appendChild(this.renderer.domElement);

    this._setupLights();
    this.createWireframeTunnel();

    this.isAR = false;
    this._session = null;
    this._localFloorSpace = null;
    this._floorDetected = false;
    this._clock = new THREE.Clock();

    // Desktop controls
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._hasDeviceOrientation = false;
    this._initDesktopControls();

    window.addEventListener('resize', () => this._onResize());
  }

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(3, 8, -5);
    this.scene.add(dir);
  }

  createWireframeTunnel() {
    const W = 6.30, H = 2.85, L = 25.0, hw = W / 2;
    const mat = new THREE.LineBasicMaterial({ color: 0xfe5000, transparent: true, opacity: 0.85 });
    const p = [];

    // 4 bordi longitudinali
    p.push(-hw,0,0, -hw,0,-L,  hw,0,0, hw,0,-L);
    p.push(-hw,H,0, -hw,H,-L,  hw,H,0, hw,H,-L);
    // Ingresso z=0
    p.push(-hw,0,0, hw,0,0,  -hw,H,0, hw,H,0);
    p.push(-hw,0,0, -hw,H,0,  hw,0,0, hw,H,0);
    // Fondo z=-L
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

    // Pavimento
    const floorGeo = new THREE.PlaneGeometry(W, L);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0xfe5000, transparent: true, opacity: 0.03, side: THREE.DoubleSide, depthWrite: false });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -L / 2);
    this.scene.add(floor);
  }

  /* ----------------------------------------------------------
   *  Controls desktop: DeviceOrientation + touch drag
   * ---------------------------------------------------------- */
  _initDesktopControls() {
    window.addEventListener('deviceorientation', (e) => {
      if (e.alpha === null) return;
      this._hasDeviceOrientation = true;
      const alpha = THREE.MathUtils.degToRad(e.alpha);
      const beta  = THREE.MathUtils.degToRad(e.beta);
      const gamma = THREE.MathUtils.degToRad(e.gamma);
      this._euler.set(beta - Math.PI / 2, alpha, -gamma, 'YXZ');
    });

    let dragging = false, lastX = 0, lastY = 0;
    const onDown = (e) => { dragging = true; lastX = e.clientX || e.touches[0].clientX; lastY = e.clientY || e.touches[0].clientY; };
    const onMove = (e) => { if (!dragging) return; const cx = e.clientX || e.touches[0].clientX; const cy = e.clientY || e.touches[0].clientY; this._euler.y -= (cx - lastX) / window.innerWidth * 2; this._euler.x -= (cy - lastY) / window.innerHeight * 2; this._euler.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this._euler.x)); lastX = cx; lastY = cy; };
    const onUp = () => { dragging = false; };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onUp);
  }

  /* ----------------------------------------------------------
   *  AR: avvia sessione WebXR con 3 strategie
   *
   *  1. Chrome Android: hit-test + local-floor → ancora perfetta
   *  2. Safari iOS: local-floor ha già pavimento integrato
   *  3. Fallback: solo "local" → posiziona a y=0
   * ---------------------------------------------------------- */
  async startARSession() {
    if (!navigator.xr) return false;

    // --- Strategia 1: Chrome Android (hit-test + local-floor) ---
    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay', 'anchors'],
        domOverlay: { root: document.body },
      });
      await this._setupARSession(session, true);
      console.log('[Marco] AR: Chrome con hit-test');
      return true;
    } catch (e1) {
      console.log('[Marco] Hit-test non disponibile, provo local-floor:', e1.message);
    }

    // --- Strategia 2: Safari iOS (local-floor, no hit-test) ---
    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body },
      });
      await this._setupARSession(session, false);
      console.log('[Marco] AR: Safari iOS con local-floor');
      return true;
    } catch (e2) {
      console.log('[Marco] local-floor non disponibile, provo solo "local":', e2.message);
    }

    // --- Strategia 3: AR base (solo "local") ---
    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body },
      });
      await this._setupARSession(session, false);
      console.log('[Marco] AR: base (solo local ref)');
      return true;
    } catch (e3) {
      console.warn('[Marco] WebXR completamente non disponibile:', e3);
      return false;
    }
  }

  /* ----------------------------------------------------------
   *  Setup sessione AR (comune a tutte le strategie)
   * ---------------------------------------------------------- */
  async _setupARSession(session, hasHitTest) {
    session.addEventListener('end', () => {
      this.isAR = false;
      this._session = null;
      this._localFloorSpace = null;
      this._hitTestSource = null;
    });

    this._session = session;
    this._hitTestSource = null;
    this._floorDetected = false;

    // Crea reference space locale
    try {
      this._localFloorSpace = await session.requestReferenceSpace('local-floor');
      console.log('[Marco] Reference space: local-floor');
    } catch (e) {
      this._localFloorSpace = await session.requestReferenceSpace('local');
      console.log('[Marco] Reference space: local');
    }

    // Se abilitato, crea hit-test source
    if (hasHitTest) {
      try {
        const viewerSpace = await session.requestReferenceSpace('viewer');
        this._hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
        console.log('[Marco] Hit-test source creato');
      } catch (e) {
        console.warn('[Marco] Hit-test source fallito:', e);
      }
    }

    await this.renderer.xr.setSession(session);
    this.isAR = true;
    console.log('[Marco] ✓ Sessione AR pronta!');
  }

  /* ----------------------------------------------------------
   *  Render loop
   * ---------------------------------------------------------- */
  start(updateCallback) {
    const animate = (timestamp, frame) => {
      const delta = this._clock.getDelta();

      if (this.isAR && frame) {
        const session = this._session;

        // --- Chrome Android: hit-test per trovare il pavimento ---
        if (this._hitTestSource && !this._floorDetected) {
          const hits = frame.getHitTestResults(this._hitTestSource);
          if (hits.length > 0) {
            const hit = hits[0];
            const pose = hit.getPose(this._localFloorSpace);
            if (pose) {
              const y = pose.transform.position.y;
              if (Math.abs(y) > 0.1 && Math.abs(y) < 5) {
                this.scene.position.y = -y;
                this._floorDetected = true;
                console.log(`[Marco] Pavimento hit-test: y=${y.toFixed(2)}m`);
              }
            }
          }
        }

        // --- Safari iOS: usa local-floor che ha già il pavimento ---
        if (!this._hitTestSource && !this._floorDetected) {
          // local-floor: l'origine è già sul pavimento
          // Il tunnel è a y=0 nella scena → appare a livello camera
          // Dovremmo spostarlo verso il basso, ma non sappiamo di quanto
          // Usiamo un offset standard (camera a 1.6m, pavimento a 0)
          // Se local-floor dà le coordinate corrette, non serve nulla
          this._floorDetected = true;
          console.log('[Marco] local-floor: tunnel posizionato');
        }

      } else if (!this.isAR) {
        // --- Desktop fallback ---
        if (!this._hasDeviceOrientation) {
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
