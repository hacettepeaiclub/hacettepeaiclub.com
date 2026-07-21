/**
 * Landing Page Chevron Animation Controller
 * Manages the chevron bracket animation beside the hero title.
 */

(() => {
  'use strict';

  // ── Chevron animation timing (ms) ──────────────────────────────────────────
  const CHEVRON_TIMING = {
    appearDelay: [0, 250, 250],
    holdDelay: 275,
    disappearDelay: [0, 250, 250],
    pauseBetweenPhases: 200,
  };

  class ChevronController {
    constructor() {
      this.running = false;
    }

    init() {
      this.running = true;
      // Start the chevron animation after a short delay for page load
      setTimeout(() => this._initChevronAnimation(), 600);
    }

    destroy() {
      this.running = false;
    }

    // ── Chevron Animation ──────────────────────────────────────────────────

    _initChevronAnimation() {
      const leftContainer = document.getElementById('chevrons-left');
      const rightContainer = document.getElementById('chevrons-right');
      if (!leftContainer || !rightContainer) return;

      this._runChevronLoop(leftContainer, rightContainer);
    }

    async _runChevronLoop(leftEl, rightEl) {
      const { appearDelay, holdDelay, disappearDelay, pauseBetweenPhases } = CHEVRON_TIMING;

      while (this.running) {
        // Phase A: inward pointing  < left,  > right
        await this._animateChevronPhase(leftEl, rightEl, '‹', '›', appearDelay, holdDelay, disappearDelay);

        await this._sleep(pauseBetweenPhases);

        // Phase B: outward pointing  > left,  < right
        await this._animateChevronPhase(leftEl, rightEl, '›', '‹', appearDelay, holdDelay, disappearDelay);

        await this._sleep(pauseBetweenPhases);
      }
    }

    async _animateChevronPhase(leftEl, rightEl, leftChar, rightChar, appearDelays, holdDelay, disappearDelays) {
      if (!this.running) return;
      const leftSpans = [];
      const rightSpans = [];

      // Appear: add chevrons one by one
      for (let i = 0; i < 3; i++) {
        if (i > 0) await this._sleep(appearDelays[i]);
        if (!this.running) return;

        const lSpan = document.createElement('span');
        lSpan.className = 'hero-chevron hero-chevron-appear';
        lSpan.textContent = leftChar;
        leftEl.insertBefore(lSpan, leftEl.firstChild);
        leftSpans.unshift(lSpan);

        const rSpan = document.createElement('span');
        rSpan.className = 'hero-chevron hero-chevron-appear';
        rSpan.textContent = rightChar;
        rightEl.appendChild(rSpan);
        rightSpans.push(rSpan);
      }

      // Hold
      await this._sleep(holdDelay);
      if (!this.running) return;

      // Disappear: remove backwards (last added first)
      for (let i = 0; i < 3; i++) {
        if (i > 0) await this._sleep(disappearDelays[i]);
        if (!this.running) return;

        const lSpan = leftSpans[i];
        const rSpan = rightSpans[2 - i];

        if (lSpan) lSpan.classList.remove('hero-chevron-appear');
        if (lSpan) lSpan.classList.add('hero-chevron-disappear');
        if (rSpan) rSpan.classList.remove('hero-chevron-appear');
        if (rSpan) rSpan.classList.add('hero-chevron-disappear');
      }

      // Wait for fade-out animation to complete, then clean up DOM
      await this._sleep(300);
      if (!this.running) return;
      leftEl.innerHTML = '';
      rightEl.innerHTML = '';
    }

    _sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  const controller = new ChevronController();
  const initNeuralBg = () => controller.init();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNeuralBg);
  } else {
    initNeuralBg();
  }

  if (typeof window !== 'undefined') {
    window.NeuralBackground = ChevronController;
    window.initNeuralBg = initNeuralBg;
  }
})();
