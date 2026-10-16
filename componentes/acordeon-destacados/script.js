/* =========================================================
   Premium Vertical Image Accordion · comportamiento
   - Clic (o toque) expande un panel.
   - En equipos con mouse, pasar el cursor también lo expande.
   - Teclado: flechas, Inicio y Fin mueven el panel activo.
   - Rotación automática opcional (data-autoplay="ms"); se pausa
     al interactuar y se desactiva con "movimiento reducido".
   - El botón "Ver detalles" emite el evento
     "acordeon:ver-detalles" con el id del producto.
   ========================================================= */

(function () {
  'use strict';

  const HOVER_DELAY = 120; // evita expandir al pasar el cursor de largo

  document.querySelectorAll('[data-acordeon]').forEach(initAcordeon);

  function initAcordeon(root) {
    const panels = Array.from(root.querySelectorAll('[data-panel]'));
    if (panels.length === 0) return;

    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const autoplayMs = Number(root.dataset.autoplay) || 0;

    let activeIndex = Math.max(0, panels.findIndex(p => p.classList.contains('is-active')));
    let hoverTimer = null;
    let autoplayTimer = null;
    let userInteracted = false;

    function setActive(index, { focus = false } = {}) {
      activeIndex = (index + panels.length) % panels.length;
      panels.forEach((panel, i) => {
        const isActive = i === activeIndex;
        panel.classList.toggle('is-active', isActive);
        const trigger = panel.querySelector('.panel__disparador');
        const content = panel.querySelector('.panel__contenido');
        trigger.setAttribute('aria-expanded', String(isActive));
        // El botón del panel abierto sale del orden de tabulación; el CTA toma el foco.
        trigger.tabIndex = isActive ? -1 : 0;
        content.inert = !isActive;
      });
      if (focus) {
        const target = panels[activeIndex].querySelector('[data-cta]') || panels[activeIndex];
        target.focus({ preventScroll: true });
      }
    }

    function stopAutoplay() {
      userInteracted = true;
      window.clearInterval(autoplayTimer);
    }

    function startAutoplay() {
      if (!autoplayMs || reduceMotion || userInteracted) return;
      window.clearInterval(autoplayTimer);
      autoplayTimer = window.setInterval(() => setActive(activeIndex + 1), autoplayMs);
    }

    panels.forEach((panel, index) => {
      const trigger = panel.querySelector('.panel__disparador');

      trigger.addEventListener('click', () => {
        stopAutoplay();
        setActive(index, { focus: true });
      });

      if (canHover) {
        panel.addEventListener('mouseenter', () => {
          window.clearTimeout(hoverTimer);
          hoverTimer = window.setTimeout(() => {
            stopAutoplay();
            setActive(index);
          }, HOVER_DELAY);
        });
        panel.addEventListener('mouseleave', () => window.clearTimeout(hoverTimer));
      }

      const cta = panel.querySelector('[data-cta]');
      if (cta) {
        cta.addEventListener('click', (event) => {
          const detail = { productId: panel.dataset.productId };
          const handled = !root.dispatchEvent(new CustomEvent('acordeon:ver-detalles', { detail, bubbles: true, cancelable: true }));
          // Si quien integra el componente llama preventDefault(), no se sigue el enlace.
          if (handled) event.preventDefault();
        });
      }
    });

    // Navegación con teclado dentro del acordeón
    root.addEventListener('keydown', (event) => {
      const horizontal = window.matchMedia('(min-width: 721px)').matches;
      const next = horizontal ? 'ArrowRight' : 'ArrowDown';
      const prev = horizontal ? 'ArrowLeft' : 'ArrowUp';
      let target = null;
      if (event.key === next) target = activeIndex + 1;
      else if (event.key === prev) target = activeIndex - 1;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = panels.length - 1;
      if (target === null) return;
      event.preventDefault();
      stopAutoplay();
      setActive(target, { focus: true });
    });

    // La rotación automática se detiene mientras el usuario está dentro del componente.
    root.addEventListener('focusin', stopAutoplay);

    setActive(activeIndex);
    startAutoplay();
  }
})();
