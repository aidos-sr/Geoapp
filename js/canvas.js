// Calm cartographic canvas used by loading, auth and program screens.
function createAtlasCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d', { alpha: true });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frame = null;
  let running = false;
  let startedAt = performance.now();

  const routes = [
    { from: [.13, .45], to: [.49, .34], lift: .18, delay: 0.02 },
    { from: [.49, .34], to: [.75, .43], lift: .14, delay: 0.28 },
    { from: [.31, .64], to: [.61, .52], lift: .12, delay: 0.56 },
    { from: [.58, .25], to: [.86, .58], lift: .18, delay: 0.76 },
    { from: [.18, .28], to: [.39, .57], lift: .1, delay: 0.42 }
  ];

  const nodes = [
    [.13, .45], [.49, .34], [.75, .43], [.31, .64],
    [.61, .52], [.58, .25], [.86, .58], [.18, .28], [.39, .57]
  ];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width || window.innerWidth);
    height = Math.max(1, rect.height || window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }

  function routePoint(route, progress) {
    const x1 = route.from[0] * width;
    const y1 = route.from[1] * height;
    const x2 = route.to[0] * width;
    const y2 = route.to[1] * height;
    const cx = (x1 + x2) / 2;
    const cy = Math.min(y1, y2) - Math.abs(x2 - x1) * route.lift;
    const inv = 1 - progress;

    return {
      x: inv * inv * x1 + 2 * inv * progress * cx + progress * progress * x2,
      y: inv * inv * y1 + 2 * inv * progress * cy + progress * progress * y2,
      x1, y1, x2, y2, cx, cy
    };
  }

  function drawGrid() {
    const gap = width < 700 ? 72 : 96;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(114, 238, 224, 0.055)';

    for (let x = gap / 2; x < width; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = gap / 2; y < height; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.setLineDash([5, 10]);
    ctx.strokeStyle = 'rgba(244, 184, 96, 0.09)';
    ctx.beginPath();
    ctx.moveTo(0, height * .5);
    ctx.lineTo(width, height * .5);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoutes(time) {
    const elapsed = (time - startedAt) / 1000;

    routes.forEach((route) => {
      const base = routePoint(route, 0);
      const fade = ctx.createLinearGradient(base.x1, base.y1, base.x2, base.y2);
      fade.addColorStop(0, 'rgba(83, 223, 187, 0.06)');
      fade.addColorStop(.5, 'rgba(114, 238, 224, 0.28)');
      fade.addColorStop(1, 'rgba(244, 184, 96, 0.08)');

      ctx.beginPath();
      ctx.moveTo(base.x1, base.y1);
      ctx.quadraticCurveTo(base.cx, base.cy, base.x2, base.y2);
      ctx.strokeStyle = fade;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!reduceMotion.matches) {
        const progress = (elapsed * .075 + route.delay) % 1;
        const point = routePoint(route, progress);
        const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 14);
        glow.addColorStop(0, 'rgba(230, 255, 251, .82)');
        glow.addColorStop(.18, 'rgba(114, 238, 224, .38)');
        glow.addColorStop(1, 'rgba(114, 238, 224, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawNodes(time) {
    const elapsed = (time - startedAt) / 1000;

    nodes.forEach(([nx, ny], index) => {
      const x = nx * width;
      const y = ny * height;
      const pulse = reduceMotion.matches ? 0 : (Math.sin(elapsed * .8 + index) + 1) / 2;

      ctx.beginPath();
      ctx.arc(x, y, 5 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(114, 238, 224, ${.09 + pulse * .08})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = index === 1
        ? 'rgba(255, 213, 138, .9)'
        : 'rgba(114, 238, 224, .72)';
      ctx.fill();
    });
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    drawRoutes(time);
    drawNodes(time);

    if (running && !reduceMotion.matches) {
      frame = requestAnimationFrame(draw);
    }
  }

  function start() {
    if (running) return;
    running = true;
    startedAt = performance.now();
    resize();
    if (!reduceMotion.matches) frame = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
  }

  window.addEventListener('resize', resize, { passive: true });
  reduceMotion.addEventListener('change', () => {
    stop();
    start();
  });

  return { start, stop };
}

function bindCanvas(canvasId, screenId, globalStartName) {
  const atlas = createAtlasCanvas(canvasId);
  const screen = document.getElementById(screenId);
  if (!atlas || !screen) return;

  if (globalStartName) window[globalStartName] = atlas.start;

  const sync = () => {
    const visible = screenId === 'loadingScreen'
      ? !screen.classList.contains('fade-out')
      : screen.classList.contains('active');
    if (visible) atlas.start();
    else atlas.stop();
  };

  new MutationObserver(sync).observe(screen, {
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  sync();
}

bindCanvas('loadCanvas', 'loadingScreen');
bindCanvas('authCanvas', 'authScreen', 'startAuthCanvas');
bindCanvas('geoCanvas', 'programScreen', 'startGeoCanvas');

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  window.startAuthCanvas?.();
  window.startGeoCanvas?.();
});

// Lightweight feedback for quiz options.
document.addEventListener('click', (event) => {
  const button = event.target.closest('.opt:not(:disabled)');
  if (!button) return;

  const rect = button.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'opt-ripple';
  ripple.style.left = `${event.clientX - rect.left}px`;
  ripple.style.top = `${event.clientY - rect.top}px`;
  button.appendChild(ripple);
  setTimeout(() => ripple.remove(), 550);
});

// Reveal generated cards once, without changing their hover transform.
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: .06, rootMargin: '0px 0px -18px' });

function observeNewCards() {
  document.querySelectorAll('.tcard, .bstat, .pg-stat, .adm-sec, .tsec, .plan-sec').forEach((element) => {
    if (element.dataset.observed) return;
    element.dataset.observed = '1';
    element.classList.add('reveal-item');
    revealObserver.observe(element);
  });
}

setTimeout(observeNewCards, 250);
new MutationObserver(() => setTimeout(observeNewCards, 50))
  .observe(document.body, { childList: true, subtree: true });
