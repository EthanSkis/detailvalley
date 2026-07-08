/* Detail Valley — animated hero background
   Drop <canvas class="dv-hero-bg" data-variant="sheen"></canvas> into the hero.
   data-variant:    "sheen" (recommended) | "alpine" | "droplets"
   data-intensity:  "calm" | "moderate" (default) | "lively"   (optional)
   No dependencies. ~3 KB. Auto-inits every canvas.dv-hero-bg on the page. */
(function () {
  function init(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var variant = canvas.getAttribute('data-variant') || 'sheen';
    var mult = ({ calm: 0.62, moderate: 1, lively: 1.55 })[canvas.getAttribute('data-intensity') || 'moderate'] || 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var R = Math.random;
    var w = 0, h = 0, t0 = 0, lastT = 0;
    var stars = [], sparks = [], ridges = [], drops = [], orbs = [], glints = [];

    /* Keep-out rectangles: the hero's text/UI boxes (logo, badge, headline,
       lead, button...) in canvas-normalised space, so decorative points never
       spawn on top of them. Falls back to no rectangles (pure random) if the
       layout can't be measured or there is no recognisable hero content. */
    function avoidEls() {
      var host = (canvas.closest && canvas.closest('header')) || canvas.parentElement;
      if (!host) return [];
      var scope = host.querySelector('.hero-inner') || host;
      var kids = scope.children, out = [];
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el === canvas || (el.classList && el.classList.contains('sheen'))) continue;
        out.push(el);
      }
      return out;
    }
    function avoidRects() {
      var cr = canvas.getBoundingClientRect(), rects = [];
      if (!cr.width || !cr.height) return rects;
      var els = avoidEls(), padX = 0.03, padY = 0.04;
      for (var i = 0; i < els.length; i++) {
        var b = els[i].getBoundingClientRect();
        if (!b.width || !b.height) continue;
        rects.push({
          x0: (b.left - cr.left) / cr.width - padX,
          y0: (b.top - cr.top) / cr.height - padY,
          x1: (b.right - cr.left) / cr.width + padX,
          y1: (b.bottom - cr.top) / cr.height + padY
        });
      }
      return rects;
    }
    function clear(x, y, rects) {
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return false;
      }
      return true;
    }
    /* A point in [0,1]x[yMin,yMin+ySpan] that clears every keep-out rect.
       Returns null after many tries (cramped layout) so the caller can skip it
       rather than place a star on the text. */
    function spot(rects, yMin, ySpan) {
      for (var k = 0; k < 40; k++) {
        var x = R(), y = yMin + R() * ySpan;
        if (clear(x, y, rects)) return { x: x, y: y };
      }
      return null;
    }

    function seed() {
      var av = avoidRects();
      if (variant === 'alpine') {
        stars = [];
        for (var i = 0; i < 44; i++) { var sp1 = spot(av, 0, 0.62); if (!sp1) continue; stars.push({ x: sp1.x, y: sp1.y, r: R()*1.3+0.4, ph: R()*6.28, sp: (R()*1.5+0.4)*mult, cu: R() < 0.16 }); }
        sparks = [];
        for (var j = 0; j < 4; j++) { var sp2 = spot(av, 0.06, 0.42); if (!sp2) continue; sparks.push({ x: sp2.x, y: sp2.y, ph: R()*6.28, sp: (R()*0.035+0.018)*mult, sz: R()*6+5 }); }
        ridges = [
          { baseY: 0.72, amp: 0.05,  sp: 0.006*mult, col: '#173f60', layers: [[1.3,0.0],[2.6,1.1],[0.8,2.0]] },
          { baseY: 0.83, amp: 0.07,  sp: 0.012*mult, col: '#0f2c48', layers: [[1.1,0.5],[2.2,1.7],[3.4,0.3]] },
          { baseY: 0.94, amp: 0.085, sp: 0.022*mult, col: '#0a2138', layers: [[0.9,1.2],[1.8,2.4],[2.6,0.7]] }
        ];
      } else if (variant === 'droplets') {
        drops = [];
        for (var k = 0; k < 26; k++) drops.push({ x: R(), y: R(), r: R()*38+14, vy: (R()*0.038+0.012)*mult, sway: R()*0.04+0.012, ph: R()*6.28, cu: R() < 0.15, hl: R()*0.55+0.4, popAt: R()*0.16+0.1, popping: false, popT: 0 });
      } else {
        orbs = [];
        for (var o = 0; o < 3; o++) orbs.push({ x: R(), y: R(), r: R()*0.42+0.42, ph: R()*6.28, sp: (R()*0.04+0.02)*mult });
        glints = [];
        for (var g = 0; g < 8; g++) { var sp3 = spot(av, 0.13, 0.7); if (!sp3) continue; glints.push({ x: sp3.x, y: sp3.y, sz: R()*6+5, ph: R()*6.28 }); }
      }
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var nw = r.width, nh = r.height;
      /* Ignore resize events that don't actually change our size. Mobile browsers
         fire 'resize' repeatedly while the URL bar slides in/out during scroll;
         re-running this (and re-seeding) on each one is what made the starfield
         appear to jump around ~every frame while scrolling. */
      if (Math.round(nw) === Math.round(w) && Math.round(nh) === Math.round(h)) return false;
      w = nw; h = nh;
      canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }

    function spark(x, y, size, alpha, rgb) {
      if (alpha <= 0.015) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(x, y, 0, x, y, size*1.7);
      g.addColorStop(0, 'rgba('+rgb+','+alpha+')'); g.addColorStop(0.5, 'rgba('+rgb+','+(alpha*0.22)+')');
      g.addColorStop(1, 'rgba('+rgb+',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, size*1.7, 0, 6.2832); ctx.fill();
      var sp = size*2.5;
      function line(x0, y0, x1, y1) { var l = ctx.createLinearGradient(x0, y0, x1, y1); l.addColorStop(0, 'rgba('+rgb+',0)'); l.addColorStop(0.5, 'rgba('+rgb+','+(alpha*0.9)+')'); l.addColorStop(1, 'rgba('+rgb+',0)'); return l; }
      ctx.lineWidth = Math.max(0.7, size*0.1);
      ctx.strokeStyle = line(x-sp, y, x+sp, y); ctx.beginPath(); ctx.moveTo(x-sp, y); ctx.lineTo(x+sp, y); ctx.stroke();
      ctx.strokeStyle = line(x, y-sp, x, y+sp); ctx.beginPath(); ctx.moveTo(x, y-sp); ctx.lineTo(x, y+sp); ctx.stroke();
      ctx.restore();
    }

    function drawAlpine(t) {
      var bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#07192c'); bg.addColorStop(0.55, '#0b2a45'); bg.addColorStop(1, '#0f3254');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      var hy = h*0.9, gg = ctx.createRadialGradient(w*0.5, hy, 0, w*0.5, hy, w*0.62);
      gg.addColorStop(0, 'rgba(184,99,44,0.32)'); gg.addColorStop(0.5, 'rgba(120,80,60,0.1)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      stars.forEach(function (st) {
        var a = (0.22+0.78*(0.5+0.5*Math.sin(t*st.sp+st.ph)))*0.85;
        ctx.fillStyle = 'rgba('+(st.cu?'214,150,96':'208,224,238')+','+a+')';
        ctx.beginPath(); ctx.arc(st.x*w, st.y*h, st.r, 0, 6.2832); ctx.fill();
      });
      ctx.restore();
      ridges.forEach(function (rg) {
        ctx.beginPath(); ctx.moveTo(0, h+2);
        var step = Math.max(5, w/140), ampsum = 0;
        rg.layers.forEach(function (L, i) { ampsum += 1/(i+1); });
        for (var x = 0; x <= w+step; x += step) {
          var u = x/w, sc = u+t*rg.sp, off = 0;
          rg.layers.forEach(function (L, i) { off += Math.sin(sc*L[0]*6.2832+L[1])*(1/(i+1)); });
          ctx.lineTo(x, (rg.baseY+(off/ampsum)*rg.amp)*h);
        }
        ctx.lineTo(w+2, h+2); ctx.closePath();
        ctx.fillStyle = rg.col; ctx.fill();
      });
      sparks.forEach(function (sk) {
        var prog = (t*sk.sp+sk.ph/6.2832)%1;
        var x = ((((sk.x-prog*0.12)%1)+1)%1)*w, y = (sk.y+prog*0.05)*h;
        spark(x, y, sk.sz, Math.sin(prog*Math.PI)*0.7, '226,182,124');
      });
    }

    function drawDroplets(t) {
      var dt = t-(lastT||t); lastT = t;
      if (dt < 0 || dt > 0.05) dt = 0.016;
      var bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#143a5c'); bg.addColorStop(1, '#091f33');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      var tg = ctx.createRadialGradient(w*0.5, -h*0.15, 0, w*0.5, -h*0.15, h*0.95);
      tg.addColorStop(0, 'rgba(120,165,215,0.18)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = tg; ctx.fillRect(0, 0, w, h); ctx.restore();
      var popDur = 0.5;
      drops.forEach(function (d) {
        var px = (d.x+Math.sin(t*0.5+d.ph)*d.sway)*w;
        if (d.popping) {
          d.popT += dt;
          var prog = Math.min(1, d.popT/popDur), ease = 1-Math.pow(1-prog, 2), py = d.y*h, r = d.r;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba('+(d.cu?'205,140,80':'170,205,235')+','+((1-prog)*0.5)+')';
          ctx.lineWidth = Math.max(0.6, r*0.06*(1-prog)+0.5);
          ctx.beginPath(); ctx.arc(px, py, r*(0.5+ease*1.5), 0, 6.2832); ctx.stroke();
          for (var i = 0; i < 7; i++) {
            var a = (i/7)*6.2832+d.ph, dist = r*(0.3+ease*1.3);
            var sx = px+Math.cos(a)*dist, sy = py+Math.sin(a)*dist+ease*r*0.35, sr = Math.max(0.6, r*0.1*(1-prog));
            ctx.fillStyle = 'rgba('+(d.cu?'216,152,92':'202,226,248')+','+((1-prog)*0.7)+')';
            ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.2832); ctx.fill();
          }
          ctx.restore();
          if (prog >= 1) { d.popping=false; d.popT=0; d.y=1.05; d.x=R(); d.r=R()*38+14; d.vy=(R()*0.038+0.012)*mult; d.sway=R()*0.04+0.012; d.ph=R()*6.28; d.cu=R()<0.15; d.hl=R()*0.55+0.4; d.popAt=R()*0.16+0.1; }
          return;
        }
        d.y -= d.vy*dt;
        if (d.y <= d.popAt) { d.popping = true; d.popT = 0; }
        var py2 = d.y*h, r2 = d.r;
        var g = ctx.createRadialGradient(px, py2, r2*0.05, px, py2, r2);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(150,190,225,0)');
        g.addColorStop(0.85, d.cu?'rgba(200,130,70,0.12)':'rgba(150,195,230,0.14)');
        g.addColorStop(0.97, 'rgba(220,235,250,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py2, r2, 0, 6.2832); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(225,240,255,'+(0.26*d.hl)+')';
        ctx.beginPath(); ctx.arc(px-r2*0.32, py2-r2*0.34, r2*0.12, 0, 6.2832); ctx.fill();
        ctx.restore();
      });
    }

    function drawSheen(t) {
      var bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#0a2640'); bg.addColorStop(1, '#0e3152');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      orbs.forEach(function (o) {
        var px = (o.x+Math.sin(t*o.sp+o.ph)*0.12)*w, py = (o.y+Math.cos(t*o.sp*0.8+o.ph)*0.08)*h, rr = o.r*Math.min(w, h);
        var g = ctx.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, 'rgba(45,95,155,0.20)'); g.addColorStop(1, 'rgba(45,95,155,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rr, 0, 6.2832); ctx.fill();
      });
      ctx.restore();
      var span = Math.hypot(w, h), prog = ((t*0.16*mult)%1.7)-0.35;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(w/2, h/2); ctx.rotate(-0.62);
      var bx = (prog-0.5)*span*1.25, bw = span*0.55;
      var lg = ctx.createLinearGradient(bx-bw/2, 0, bx+bw/2, 0);
      lg.addColorStop(0, 'rgba(130,175,225,0)'); lg.addColorStop(0.42, 'rgba(150,195,235,0.10)');
      lg.addColorStop(0.5, 'rgba(190,220,250,0.30)'); lg.addColorStop(0.58, 'rgba(205,150,95,0.16)');
      lg.addColorStop(1, 'rgba(130,175,225,0)');
      ctx.fillStyle = lg; ctx.fillRect(-span, -span, span*2, span*2);
      ctx.restore();
      glints.forEach(function (gl) {
        var sweep = Math.max(0, 1-Math.abs(gl.x-prog)*5);
        var tw = 0.4+0.6*Math.abs(Math.sin(t*1.1*mult+gl.ph));
        var a = Math.min(1, tw*0.5+sweep*0.95);
        spark(gl.x*w, gl.y*h, gl.sz, a*0.95, sweep>0.3?'226,190,150':'208,226,244');
      });
    }

    function paint(t) {
      if (!w || !h) return;
      variant === 'alpine' ? drawAlpine(t) : variant === 'droplets' ? drawDroplets(t) : drawSheen(t);
    }
    var running = false;
    function frame(ts) {
      if (!running) return;
      if (!t0) t0 = ts;
      paint((ts-t0)/1000);
      requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; requestAnimationFrame(frame); }
    function stop() { running = false; }

    /* Accessibility: under prefers-reduced-motion we don't animate, but instead of
       a blank canvas we paint a single calm static frame so the backdrop is still
       visible (no motion). Repaint that frame on resize. */
    var rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduce = !!(rm && rm.matches);
    function reseed() { seed(); if (reduce) paint(5.3); }
    /* Place once now, then re-place only when the layout genuinely changes, so the
       keep-out zones stay aligned with the text:
         - a real resize (resize() returns true) — NOT the mobile URL-bar scroll
           storm, which is filtered out, so this never causes the scrolling jitter;
         - once web fonts load, since the headline reflows and moves the text boxes.
       Positions are normalised (0..1) and scaled to w/h at draw time. */
    resize();
    seed();
    window.addEventListener('resize', function () { if (resize()) reseed(); });
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(reseed);
    if (reduce) paint(5.3);
    /* Run the loop only while the canvas is actually on screen — no point
       burning CPU/battery painting a backdrop the visitor has scrolled past.
       Time is absolute ((ts-t0)/1000), so resuming mid-timeline is seamless. */
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }).observe(canvas);
    }
    else start();
  }

  function boot() {
    var list = document.querySelectorAll('canvas.dv-hero-bg');
    for (var i = 0; i < list.length; i++) init(list[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
