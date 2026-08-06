/* Detail Valley — before/after compare sliders.
   Progressive enhancement: the markup already renders a readable 50/50 split
   with no JS at all. This file adds drag, click and keyboard control, plus a
   one-time nudge the first time a slider scrolls into view so it's obvious
   the photo is draggable. */
(function () {
  'use strict';

  var els = document.querySelectorAll('.ba');
  if (!els.length) return;

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init(el) {
    var pos = 50, hintRaf = 0, touched = false;

    function paint() {
      el.style.setProperty('--pos', pos + '%');
      el.style.setProperty('--posn', pos);
      el.setAttribute('aria-valuenow', Math.round(pos));
    }
    function set(p) {
      pos = p < 0 ? 0 : p > 100 ? 100 : p;
      paint();
    }
    function fromX(x) {
      var r = el.getBoundingClientRect();
      if (r.width) set(((x - r.left) / r.width) * 100);
    }
    /* Any real input cancels the hint and hands control to the visitor. */
    function claim() {
      touched = true;
      if (hintRaf) { cancelAnimationFrame(hintRaf); hintRaf = 0; }
      el.classList.remove('hinting');
    }

    el.addEventListener('pointerdown', function (e) {
      claim();
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      fromX(e.clientX);
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (el.hasPointerCapture(e.pointerId)) fromX(e.clientX);
    });
    function end(e) {
      el.classList.remove('dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    el.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 12 : 4, k = e.key;
      if (k === 'ArrowLeft')       set(pos - step);
      else if (k === 'ArrowRight') set(pos + step);
      else if (k === 'Home')       set(0);
      else if (k === 'End')        set(100);
      else return;
      claim();
      e.preventDefault();
    });

    /* Sweep the handle once, the first time the slider is seen. */
    function hint() {
      if (touched || reduced) return;
      var stops = [50, 72, 30, 50], dur = 1500, start = null;
      el.classList.add('hinting');
      hintRaf = requestAnimationFrame(function step(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / dur);
        /* Walk the stop list with an ease-in-out between each pair. */
        var seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
        var lt = t * (stops.length - 1) - seg;
        var e2 = lt < 0.5 ? 2 * lt * lt : 1 - Math.pow(-2 * lt + 2, 2) / 2;
        set(stops[seg] + (stops[seg + 1] - stops[seg]) * e2);
        if (t < 1 && !touched) hintRaf = requestAnimationFrame(step);
        else { hintRaf = 0; el.classList.remove('hinting'); }
      });
    }

    paint();

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          io.unobserve(el);
          hint();
        });
      }, { threshold: 0.55 });
      io.observe(el);
    }
  }

  Array.prototype.forEach.call(els, init);
})();
