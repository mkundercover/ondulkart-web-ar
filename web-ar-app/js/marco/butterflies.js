/**
 * WEB AR APP — Marco's Module
 * butterflies.js
 *
 * Marco si occupa di:
 * - Sistema di farfalle low-poly che scorrono nel tunnel
 * - Gradiente colore: #ce0058 (destra) → #fe5000 (sinistra)
 * - Battito ali procedurale
 * - Movimento organico (brownian soft)
 *
 * Coordinate tunnel:
 *   X: -3.15 (sinistra) … +3.15 (destra)
 *   Y:  0.00 (pavimento) …  2.85 (soffitto)
 *   Z:  0.00 (ingresso)   … -25.0 (fondo)
 */

/* ============================================================
   MARCO: ButterflySystem — Gestione farfalle
   ============================================================ */
class ButterflySystem {

  /**
   * @param {THREE.Scene} scene — scena Three.js
   */
  constructor(scene) {
    this.scene = scene;

    /* --- Configurazione --- */
    this.minButterflies = 15;
    this.maxButterflies = 25;
    this.count = 20; // numero attivo

    /* --- Dimensioni tunnel (devono matchare scene.js) --- */
    this.tunnelHalfWidth = 3.15;
    this.tunnelHeight   = 2.85;
    this.tunnelLength   = 25.0;

    /* --- Colori gradiente ---
     * Nascita (destra, progress ≈ 0.0): #ce0058
     * Metà    (centro, progress ≈ 0.5): #fe5000
     * Uscita  (sinistra, progress ≈ 1.0): resta #fe5000 */
    this.colorBorn  = new THREE.Color(0xce0058); // magenta/rosso
    this.colorMid   = new THREE.Color(0xfe5000); // arancione

    /* --- Pool di farfalle --- */
    this.butterflies = [];

    /* --- Geometria condivisa (istanziata una volta) --- */
    this._sharedGeometry = this._createButterflyGeometry();

    /* --- Materiale condiviso (clone per colore individuale) --- */
    this._baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xce0058,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false, // evita artefatti di profondità in AR
    });

    /* --- Inizializza il pool --- */
    this._initPool();
  }

  /* ----------------------------------------------------------
   *  MARCO: Geometria low-poly farfalla
   *
   *  Due piani (PlaneGeometry) ruotati a V per formare le ali.
   *  Ogni ala è un rettangolo schiacciato.
   * ---------------------------------------------------------- */
  _createButterflyGeometry() {
    // Usiamo una BufferGeometry custom per 2 triangoli per ala = 4 tot
    // Forma: due "ali" a V, ciascuna fatta di 2 triangoli
    const s = 0.08;  // scala semi-larghezza ala
    const h = 0.12;  // lunghezza ala

    // 4 triangoli: 12 vertici
    const vertices = new Float32Array([
      // Ala sinistra (aperta a sinistra)
      0, 0, 0,
      -s, h * 0.6, 0,
      -s * 0.3, -h, 0,

      0, 0, 0,
      -s * 0.3, -h, 0,
      -s, h * 0.6, 0,

      // Ala destra (aperta a destra)
      0, 0, 0,
      s, h * 0.6, 0,
      s * 0.3, -h, 0,

      0, 0, 0,
      s * 0.3, -h, 0,
      s, h * 0.6, 0,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /* ----------------------------------------------------------
   *  MARCO: Inizializza il pool di farfalle
   * ---------------------------------------------------------- */
  _initPool() {
    for (let i = 0; i < this.count; i++) {
      const mesh = this._createButterflyMesh();
      const data = this._randomizeButterfly(i);

      // Posizione iniziale
      mesh.position.set(data.x, data.y, data.z);
      mesh.rotation.set(0, 0, data.rotZ);

      this.scene.add(mesh);
      this.butterflies.push({ mesh, ...data });
    }
  }

  /* ----------------------------------------------------------
   *  MARCO: Crea il mesh di una singola farfalla
   * ---------------------------------------------------------- */
  _createButterflyMesh() {
    const mat = this._baseMaterial.clone();
    const mesh = new THREE.Mesh(this._sharedGeometry, mat);
    // Le ali sono nel piano XY, la farfalla guarda verso +Z
    // Ruotiamo per farle guardare verso -Z (direzione del tunnel)
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  /* ----------------------------------------------------------
   *  MARCO: Randomizza i parametri di una farfalla
   *
   *  @param {number} index — indice nel pool (per distribuzione)
   *  @returns {Object} dati della farfalla
   * ---------------------------------------------------------- */
  _randomizeButterfly(index) {
    // Distribuisci le farfalle lungo tutto il tunnel inizialmente
    const progress = index / this.count; // 0 … ~1

    return {
      // Posizione: nasce a destra, distribuita lungo Z
      x: this.tunnelHalfWidth * (0.3 + Math.random() * 0.6),
      y: 0.2 + Math.random() * (this.tunnelHeight - 0.4),
      z: -Math.random() * this.tunnelLength,

      // Velocità verso sinistra (m/s)
      speed: 1.2 + Math.random() * 0.8,

      // Battito ali
      wingPhase: Math.random() * Math.PI * 2,
      wingFreq: 4 + Math.random() * 4,   // 4-8 Hz
      wingAmplitude: 0.3 + Math.random() * 0.2,

      // Movimento organico (brownian)
      brownianPhaseY: Math.random() * Math.PI * 2,
      brownianPhaseZ: Math.random() * Math.PI * 2,
      brownianAmpY: 0.03 + Math.random() * 0.04,
      brownianAmpZ: 0.02 + Math.random() * 0.03,

      // Rotazione iniziale (leggera variazione)
      rotZ: (Math.random() - 0.5) * 0.4,

      // Tempo accumulato per animazione
      timeAlive: Math.random() * 100,
    };
  }

  /* ----------------------------------------------------------
   *  MARCO: Interpola il colore della farfalla
   *
   *  progress = 0.0 → destra (nascita)  → #ce0058
   *  progress = 0.5 → centro (metà)     → #fe5000
   *  progress = 1.0 → sinistra (uscita) → #fe5000
   *
   *  Interpolazione lineare da 0.0 a 0.5, poi resta #fe5000.
   *
   *  @param {number} progress — 0.0 … 1.0
   *  @returns {THREE.Color}
   * ---------------------------------------------------------- */
  interpolateButterflyColor(progress) {
    const t = Math.min(Math.max(progress, 0), 1);

    if (t <= 0.5) {
      // Da #ce0058 a #fe5000
      const localT = t / 0.5; // 0 → 1
      return new THREE.Color().lerpColors(this.colorBorn, this.colorMid, localT);
    }
    // Oltre metà: resta arancione
    return this.colorMid.clone();
  }

  /* ----------------------------------------------------------
   *  MARCO: Calcola il "progress" di una farfalla nel tunnel
   *
   *  Basato sulla posizione X:
   *    x = +3.15 (destra) → progress = 0.0
   *    x = -3.15 (sinistra) → progress = 1.0
   *
   *  @param {number} x — posizione X
   *  @returns {number} progress 0.0 … 1.0
   * ---------------------------------------------------------- */
  _getProgress(x) {
    return (this.tunnelHalfWidth - x) / (2 * this.tunnelHalfWidth);
  }

  /* ----------------------------------------------------------
   *  MARCO: Update — chiamato ogni frame
   *
   *  @param {number} delta — tempo dal frame precedente (secondi)
   *  @param {number} timestamp — tempo totale (ms)
   * ---------------------------------------------------------- */
  update(delta, timestamp) {
    const t = timestamp * 0.001; // secondi

    for (let i = 0; i < this.butterflies.length; i++) {
      const b = this.butterflies[i];

      /* --- Movimento principale: destra → sinistra --- */
      b.x -= b.speed * delta;

      /* --- Movimento organico Y (oscillazione verticale) --- */
      const brownianY = Math.sin(t * 1.5 + b.brownianPhaseY) * b.brownianAmpY;
      const brownianZ = Math.cos(t * 1.2 + b.brownianPhaseZ) * b.brownianAmpZ;

      /* --- Aggiorna posizione --- */
      b.mesh.position.x = b.x;
      b.mesh.position.y = Math.max(0.1,
        Math.min(this.tunnelHeight - 0.1, b.y + brownianY)
      );
      b.mesh.position.z = b.z + brownianZ;

      /* --- Battito ali ---
       * Ruota le ali su asse X per simulare il battito.
       * Usiamo la mesh già ruotata di PI/2 su X,
       * aggiungiamo l'oscillazione sull'asse Z locale. */
      const wingAngle = Math.sin(t * b.wingFreq + b.wingPhase) * b.wingAmplitude;
      b.mesh.rotation.z = b.rotZ + wingAngle;

      /* --- Colore basato su posizione --- */
      const progress = this._getProgress(b.x);
      const color = this.interpolateButterflyColor(progress);
      b.mesh.material.color.copy(color);

      /* --- Se esce a sinistra, ricomincia a destra --- */
      if (b.x < -this.tunnelHalfWidth) {
        const newData = this._randomizeButterfly(i);
        b.x = newData.x;
        b.y = newData.y;
        b.z = newData.z;
        b.speed = newData.speed;
        b.wingPhase = newData.wingPhase;
        b.wingFreq = newData.wingFreq;
        b.wingAmplitude = newData.wingAmplitude;
        b.brownianPhaseY = newData.brownianPhaseY;
        b.brownianPhaseZ = newData.brownianPhaseZ;
        b.brownianAmpY = newData.brownianAmpY;
        b.brownianAmpZ = newData.brownianAmpZ;
        b.rotZ = newData.rotZ;
        b.timeAlive = 0;

        b.mesh.position.set(b.x, b.y, b.z);
      }
    }
  }
}
