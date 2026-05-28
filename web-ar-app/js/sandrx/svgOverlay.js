/**
 * WEB AR APP — Sandro's Module
 * svgOverlay.js
 *
 * Sandro si occupa di:
 * - Motion Graphics SVG futuristica che appare sopra il palmo
 * - Dati dinamici (CO2 risparmiata) mostrati nell'overlay
 * - Animazioni fluide di entrata/uscita
 * - Layout pulito e futuristico
 */

/* ============================================================
   SANDRO: SVGOverlay — Motion Graphics e UI dati
   ============================================================ */
class SVGOverlay {

  /**
   * @param {HTMLElement} overlayElement — il div #svg-overlay
   */
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.wrapper = null;
    this.co2ValueEl = null;
    this.isVisible = false;
    this._dataInterval = null;
    this._currentCO2 = 45;

    this._createSVG();
    this._startDataSimulation();
  }

  /* ----------------------------------------------------------
   *  SANDRO: Crea la Motion Graphics SVG completa
   *
   *  Layout futuristico con:
   *  - Anello esterno rotante
   *  - Anello interno tratteggio
   *  - Cerchio centrale con dato CO2
   *  - Bracket angolari
   *  - Particelle decorative
   * ---------------------------------------------------------- */
  _createSVG() {
    // Wrapperposizionato dinamicamente
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'motion-graphics-wrapper';
    this.wrapper.classList.add('hidden');

    // SVG inline — viewBox 400×400 per scalabilità
    this.wrapper.innerHTML = `
<svg id="motion-graphics" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Gradiente radiale cerchio centrale -->
    <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#00ff88" stop-opacity="0.08" />
      <stop offset="70%"  stop-color="#00ff88" stop-opacity="0.03" />
      <stop offset="100%" stop-color="#00ff88" stop-opacity="0"    />
    </radialGradient>

    <!-- Gradiente lineare anello esterno -->
    <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#00ff88" />
      <stop offset="50%"  stop-color="#00cc66" />
      <stop offset="100%" stop-color="#00ff88" />
    </linearGradient>

    <!-- Gradiente anello interno -->
    <linearGradient id="ring-inner-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#fe5000" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#ffaa00" stop-opacity="0.4" />
    </linearGradient>

    <!-- Glow filter -->
    <filter id="glow-filter" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <!-- Shadow filter per testo -->
    <filter id="text-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feFlood flood-color="#00ff88" flood-opacity="0.6" />
      <feComposite in2="blur" operator="in" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- ═══ ANELLO ESTERNO ROTANTE ═══ -->
  <g class="ring-outer">
    <circle cx="200" cy="200" r="140"
      fill="none"
      stroke="url(#ring-grad)"
      stroke-width="1.2"
      opacity="0.7" />
    <!-- Segmento evidenziato -->
    <circle cx="200" cy="200" r="140"
      fill="none"
      stroke="#00ff88"
      stroke-width="2.5"
      stroke-dasharray="30 250"
      opacity="0.9"
      filter="url(#glow-filter)" />
  </g>

  <!-- ═══ ANELLO INTERNO TRATTEGGIATO ═══ -->
  <g class="ring-inner">
    <circle cx="200" cy="200" r="118"
      fill="none"
      stroke="url(#ring-inner-grad)"
      stroke-width="0.8"
      stroke-dasharray="8,12"
      opacity="0.6" />
  </g>

  <!-- ═══ CERCHIO CENTRALE ═══ -->
  <circle class="center-circle" cx="200" cy="200" r="78"
    fill="url(#center-glow)"
    stroke="#00ff88"
    stroke-width="0.8"
    opacity="0.8" />

  <!-- ═══ ICONA/IMMAGINE CENTRALE ═══ -->
  <!-- Simbolo foglia stilizzato (path) -->
  <g transform="translate(200,172)" opacity="0.9">
    <path d="M0,-18 C8,-8 12,4 4,16 C0,18 0,18 -4,16 C-12,4 -8,-8 0,-18Z"
      fill="#00ff88"
      filter="url(#glow-filter)" />
    <path d="M0,-14 L0,12"
      stroke="#003322"
      stroke-width="1"
      fill="none" />
    <path d="M0,-4 L-6,-10 M0,2 L5,-2 M0,8 L-5,4"
      stroke="#003322"
      stroke-width="0.7"
      fill="none" />
  </g>

  <!-- ═══ DATO CO₂ ═══ -->
  <text class="data-value"
    x="200" y="220"
    text-anchor="middle"
    fill="#ffffff"
    font-family="'Courier New', monospace"
    font-size="32"
    font-weight="bold"
    filter="url(#text-glow)"
    letter-spacing="2">
    <tspan id="co2-percent">45%</tspan>
  </text>

  <!-- ═══ LABEL ═══ -->
  <text x="200" y="245"
    text-anchor="middle"
    fill="#00ff88"
    font-family="'Courier New', monospace"
    font-size="10"
    letter-spacing="3"
    opacity="0.8">
    CO₂ SAVED
  </text>

  <!-- ═══ SOTTO-LABEL ═══ -->
  <text x="200" y="260"
    text-anchor="middle"
    fill="rgba(0,255,136,0.4)"
    font-family="'Courier New', monospace"
    font-size="8"
    letter-spacing="1">
    TONNES THIS YEAR
  </text>

  <!-- ═══ BRACKET ANGOLARI ═══ -->
  <g class="corner-bracket" opacity="0.7">
    <!-- Top-left -->
    <path d="M58,58 L58,36 L80,36" fill="none" stroke="#00ff88" stroke-width="1.5" />
    <!-- Top-right  -->
    <path d="M342,58 L342,36 L320,36" fill="none" stroke="#00ff88" stroke-width="1.5" />
    <!-- Bottom-left -->
    <path d="M58,342 L58,364 L80,364" fill="none" stroke="#00ff88" stroke-width="1.5" />
    <!-- Bottom-right -->
    <path d="M342,342 L342,364 L320,364" fill="none" stroke="#00ff88" stroke-width="1.5" />
  </g>

  <!-- ═══ PARTICELLE DECORATIVE ═══ -->
  <g opacity="0.5">
    <circle class="particle-dot" cx="150" cy="120" r="1.5" fill="#00ff88"
      style="animation-delay: 0s;" />
    <circle class="particle-dot" cx="260" cy="130" r="1" fill="#fe5000"
      style="animation-delay: 0.5s;" />
    <circle class="particle-dot" cx="280" cy="280" r="1.2" fill="#00ff88"
      style="animation-delay: 1s;" />
    <circle class="particle-dot" cx="130" cy="270" r="0.8" fill="#fe5000"
      style="animation-delay: 1.5s;" />
    <circle class="particle-dot" cx="200" cy="100" r="1" fill="#00ff88"
      style="animation-delay: 2s;" />
    <circle class="particle-dot" cx="310" cy="200" r="1.3" fill="#fe5000"
      style="animation-delay: 0.8s;" />
    <circle class="particle-dot" cx="100" cy="200" r="0.9" fill="#00ff88"
      style="animation-delay: 1.3s;" />
  </g>

  <!-- ═══ LINCE TRATTESSE ATTORNO (accento) ═══ -->
  <g class="ring-dashed" opacity="0.3">
    <circle cx="200" cy="200" r="155"
      fill="none"
      stroke="#ffffff"
      stroke-width="0.5"
      stroke-dasharray="2,20" />
  </g>
</svg>`;

    this.overlay.appendChild(this.wrapper);

    // Riferimento al testo CO2
    this.co2ValueEl = this.wrapper.querySelector('#co2-percent');
  }

  /* ----------------------------------------------------------
   *  SANDRO: Mostra l'overlay alla posizione della mano
   *
   *  @param {number} normalizedX — coordinata X normalizzata (0-1)
   *  @param {number} normalizedY — coordinata Y normalizzata (0-1)
   * ---------------------------------------------------------- */
  showAtPosition(normalizedX, normalizedY) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Conversione in pixel
    let screenX = normalizedX * w;
    const screenY = normalizedY * h;

    // Se la fotocamera è frontale (user), specchia X
    // Il wrapper traduce già di -50%, -50% tramite CSS
    // quindi il centro dell'SVG sarà esattamente su screenX, screenY

    // Limiti: non far uscire l'SVG dallo schermo
    const halfSize = 180; // metà di 360px
    screenX = Math.max(halfSize, Math.min(w - halfSize, screenX));
    const clampedY = Math.max(halfSize, Math.min(h - halfSize, screenY));

    this.wrapper.style.left = `${screenX}px`;
    this.wrapper.style.top  = `${clampedY}px`;

    // Animazione di entrata
    this.wrapper.classList.remove('hidden');
    this.wrapper.classList.add('visible');
    this.isVisible = true;
  }

  /* ----------------------------------------------------------
   *  SANDRO: Nasconde l'overlay (animazione di uscita)
   * ---------------------------------------------------------- */
  hide() {
    if (!this.isVisible) return;

    this.wrapper.classList.remove('visible');
    this.wrapper.classList.add('hidden');
    this.isVisible = false;
  }

  /* ----------------------------------------------------------
   *  SANDRO: Aggiorna il valore CO₂ mostrato
   *
   *  @param {number} percent — valore percentuale (0-100)
   * ---------------------------------------------------------- */
  updateData(percent) {
    if (!this.co2ValueEl) return;
    const rounded = Math.round(Math.max(0, Math.min(100, percent)));
    this._currentCO2 = rounded;
    this.co2ValueEl.textContent = `${rounded}%`;

    // Aggiungi un effetto flash sull'aggiornamento
    this.co2ValueEl.style.transition = 'opacity 0.1s';
    this.co2ValueEl.style.opacity = '0.5';
    setTimeout(() => {
      this.co2ValueEl.style.opacity = '1';
    }, 100);
  }

  /* ----------------------------------------------------------
   *  SANDRO: Simula dati dinamici CO₂
   *
   *  Aggiorna il valore ogni 2 secondi con variazione
   *  pseudo-reale (variazione graduale).
   * ---------------------------------------------------------- */
  _startDataSimulation() {
    this._currentCO2 = 35 + Math.random() * 30; // inizia tra 35% e 65%

    this._dataInterval = setInterval(() => {
      if (!this.isVisible) return;

      // Variazione graduale: ±3%
      const delta = (Math.random() - 0.5) * 6;
      this._currentCO2 = Math.max(10, Math.min(95, this._currentCO2 + delta));
      this.updateData(this._currentCO2);
    }, 2000);
  }

  /* ----------------------------------------------------------
   *  SANDRO: Pulizia risorse
   * ---------------------------------------------------------- */
  destroy() {
    if (this._dataInterval) {
      clearInterval(this._dataInterval);
    }
    this.overlay.innerHTML = '';
  }
}

export { SVGOverlay };
