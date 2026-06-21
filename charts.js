// ===== Creepypasta Studio — Narrative Charts =====
// Dwa edytowalne wykresy (tempo akcji, poziom grozy) + marker punktu zwrotu.
// Obsługa: drag punktu, dblclick linii = nowy punkt, rightclick punktu = usuń.

(function () {
  const STORAGE_KEY = "creepypasta-studio-charts-v1";

  const THEME = {
    bg: "#0a0a0a",
    grid: "rgba(255,255,255,0.04)",
    pace: { line: "#d64b3b", fill: "rgba(214,75,59,0.12)", dot: "#ef6a58" },
    fear: { line: "#8b5cf6", fill: "rgba(139,92,246,0.12)", dot: "#a78bfa" },
    twist: { track: "rgba(255,255,255,0.06)", marker: "#c8a85a", glow: "rgba(200,168,90,0.35)" },
    text: "rgba(184,178,170,0.6)",
  };

  const DEFAULTS = {
    pace: [
      { x: 0.0, y: 0.2 },
      { x: 0.25, y: 0.35 },
      { x: 0.5, y: 0.6 },
      { x: 0.75, y: 0.82 },
      { x: 1.0, y: 0.95 },
    ],
    fear: [
      { x: 0.0, y: 0.05 },
      { x: 0.3, y: 0.28 },
      { x: 0.55, y: 0.55 },
      { x: 0.75, y: 0.88 },
      { x: 1.0, y: 0.72 },
    ],
    twist: 0.62,
  };

  // ---- State ----
  let state = loadState();

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && Array.isArray(raw.pace) && Array.isArray(raw.fear) && typeof raw.twist === "number") {
        return raw;
      }
    } catch (_) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---- Canvas setup ----
  const paceCanvas = document.getElementById("pace-canvas");
  const fearCanvas = document.getElementById("fear-canvas");
  const twistCanvas = document.getElementById("twist-canvas");

  if (!paceCanvas || !fearCanvas || !twistCanvas) return;

  function dpr() { return window.devicePixelRatio || 1; }

  function sizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const d = dpr();
    canvas.width = Math.round(rect.width * d);
    canvas.height = Math.round(rect.height * d);
  }

  function sizeAll() {
    [paceCanvas, fearCanvas, twistCanvas].forEach(sizeCanvas);
    drawAll();
  }

  // ---- Drawing ----
  const PAD = { top: 10, right: 14, bottom: 18, left: 14 };
  const TWIST_PAD = { left: 14, right: 14 };
  const DOT_R = 6;

  function chartArea(canvas) {
    const w = canvas.width / dpr();
    const h = canvas.height / dpr();
    return {
      x0: PAD.left, y0: PAD.top,
      x1: w - PAD.right, y1: h - PAD.bottom,
      w: w - PAD.left - PAD.right,
      h: h - PAD.top - PAD.bottom,
    };
  }

  function ptToPixel(pt, area) {
    return {
      px: area.x0 + pt.x * area.w,
      py: area.y0 + (1 - pt.y) * area.h,
    };
  }

  function pixelToPt(px, py, area) {
    return {
      x: Math.max(0, Math.min(1, (px - area.x0) / area.w)),
      y: Math.max(0, Math.min(1, 1 - (py - area.y0) / area.h)),
    };
  }

  function drawCurveChart(canvas, points, color) {
    const ctx = canvas.getContext("2d");
    const d = dpr();
    ctx.save();
    ctx.scale(d, d);
    const w = canvas.width / d;
    const h = canvas.height / d;
    const area = chartArea(canvas);

    ctx.clearRect(0, 0, w, h);

    // BG
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);

    // Grid lines (horizontal)
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach((v) => {
      const py = area.y0 + (1 - v) * area.h;
      ctx.beginPath();
      ctx.moveTo(area.x0, py);
      ctx.lineTo(area.x1, py);
      ctx.stroke();
    });

    // Vertical time marks
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      const px = area.x0 + v * area.w;
      ctx.beginPath();
      ctx.moveTo(px, area.y0);
      ctx.lineTo(px, area.y1);
      ctx.stroke();
    });

    // Time labels
    ctx.fillStyle = THEME.text;
    ctx.font = `${9 / 1}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ["Wstęp", "Zav.", "Środek", "Kul.", "Koniec"].forEach((label, i) => {
      const px = area.x0 + (i / 4) * area.w;
      ctx.fillText(label, px, area.y1 + 12);
    });

    if (points.length < 2) {
      ctx.restore();
      return;
    }

    const sorted = [...points].sort((a, b) => a.x - b.x);
    const pixels = sorted.map((pt) => ptToPixel(pt, area));

    // Fill
    ctx.beginPath();
    ctx.moveTo(pixels[0].px, area.y1);
    ctx.lineTo(pixels[0].px, pixels[0].py);
    for (let i = 1; i < pixels.length; i++) {
      const prev = pixels[i - 1];
      const cur = pixels[i];
      const cx = (prev.px + cur.px) / 2;
      ctx.bezierCurveTo(cx, prev.py, cx, cur.py, cur.px, cur.py);
    }
    ctx.lineTo(pixels[pixels.length - 1].px, area.y1);
    ctx.closePath();
    ctx.fillStyle = color.fill;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(pixels[0].px, pixels[0].py);
    for (let i = 1; i < pixels.length; i++) {
      const prev = pixels[i - 1];
      const cur = pixels[i];
      const cx = (prev.px + cur.px) / 2;
      ctx.bezierCurveTo(cx, prev.py, cx, cur.py, cur.px, cur.py);
    }
    ctx.strokeStyle = color.line;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Dots
    pixels.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.px, p.py, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = color.dot;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawTwistTrack(canvas, twistX) {
    const ctx = canvas.getContext("2d");
    const d = dpr();
    ctx.save();
    ctx.scale(d, d);
    const w = canvas.width / d;
    const h = canvas.height / d;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);

    const trackY = h / 2;
    const x0 = TWIST_PAD.left;
    const x1 = w - TWIST_PAD.right;
    const trackW = x1 - x0;

    // Track
    ctx.beginPath();
    ctx.moveTo(x0, trackY);
    ctx.lineTo(x1, trackY);
    ctx.strokeStyle = THEME.twist.track;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();

    // Ticks
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      const px = x0 + v * trackW;
      ctx.beginPath();
      ctx.moveTo(px, trackY - 5);
      ctx.lineTo(px, trackY + 5);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Marker
    const mx = x0 + twistX * trackW;
    // Glow
    const grad = ctx.createRadialGradient(mx, trackY, 0, mx, trackY, 18);
    grad.addColorStop(0, THEME.twist.glow);
    grad.addColorStop(1, "transparent");
    ctx.beginPath();
    ctx.arc(mx, trackY, 18, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    // Diamond
    ctx.save();
    ctx.translate(mx, trackY);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-6, -6, 12, 12);
    ctx.fillStyle = THEME.twist.marker;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawAll() {
    drawCurveChart(paceCanvas, state.pace, THEME.pace);
    drawCurveChart(fearCanvas, state.fear, THEME.fear);
    drawTwistTrack(twistCanvas, state.twist);
    updateTwistHint();
  }

  function updateTwistHint() {
    const hint = document.getElementById("twist-hint");
    if (!hint) return;
    const pct = Math.round(state.twist * 100);
    const label =
      pct <= 20 ? "bardzo wcześnie" :
      pct <= 40 ? "wczesna akcja" :
      pct <= 60 ? "środek opowieści" :
      pct <= 80 ? "późna kulminacja" : "niemal na końcu";
    hint.textContent = `${pct}% opowieści — ${label}`;
  }

  // ---- Interaction helpers ----
  function canvasPos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const src = evt.touches ? evt.touches[0] : evt;
    return {
      x: src.clientX - rect.left,
      y: src.clientY - rect.top,
    };
  }

  function findNearestPoint(points, px, py, area, threshold) {
    let best = -1;
    let bestDist = threshold;
    const sorted = [...points].sort((a, b) => a.x - b.x);
    sorted.forEach((pt, i) => {
      const pixel = ptToPixel(pt, area);
      const dist = Math.hypot(pixel.px - px, pixel.py - py);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return best; // index in sorted array
  }

  // ---- Curve chart interactions ----
  function makeChartInteraction(canvas, stateKey, color) {
    let dragging = null; // index in sorted points

    function getArea() { return chartArea(canvas); }

    function sortedPoints() {
      return [...state[stateKey]].sort((a, b) => a.x - b.x);
    }

    function applySort(sorted) {
      state[stateKey] = sorted;
    }

    canvas.addEventListener("mousedown", (evt) => {
      if (evt.button !== 0) return;
      const { x, y } = canvasPos(canvas, evt);
      const area = getArea();
      const sorted = sortedPoints();
      const idx = findNearestPoint(sorted, x, y, area, DOT_R + 8);
      if (idx >= 0) {
        dragging = idx;
        evt.preventDefault();
      }
    });

    canvas.addEventListener("mousemove", (evt) => {
      if (dragging === null) return;
      const { x, y } = canvasPos(canvas, evt);
      const area = getArea();
      const pt = pixelToPt(x, y, area);
      const sorted = sortedPoints();
      // Clamp X to stay between neighbors
      const prev = sorted[dragging - 1];
      const next = sorted[dragging + 1];
      const minX = prev ? prev.x + 0.01 : 0;
      const maxX = next ? next.x - 0.01 : 1;
      sorted[dragging] = { x: Math.max(minX, Math.min(maxX, pt.x)), y: pt.y };
      applySort(sorted);
      drawCurveChart(canvas, state[stateKey], color);
      saveState();
    });

    window.addEventListener("mouseup", () => { dragging = null; });

    // Double-click on line = add point
    canvas.addEventListener("dblclick", (evt) => {
      const { x, y } = canvasPos(canvas, evt);
      const area = getArea();
      const sorted = sortedPoints();
      const idx = findNearestPoint(sorted, x, y, area, DOT_R + 8);
      if (idx >= 0) return; // clicked on existing dot
      const pt = pixelToPt(x, y, area);
      sorted.push(pt);
      sorted.sort((a, b) => a.x - b.x);
      applySort(sorted);
      drawAll();
      saveState();
    });

    // Right-click = remove point (min 2 points)
    canvas.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      const { x, y } = canvasPos(canvas, evt);
      const area = getArea();
      const sorted = sortedPoints();
      if (sorted.length <= 2) return;
      const idx = findNearestPoint(sorted, x, y, area, DOT_R + 10);
      if (idx >= 0) {
        sorted.splice(idx, 1);
        applySort(sorted);
        drawAll();
        saveState();
      }
    });

    // Touch drag
    let touchDragging = null;
    canvas.addEventListener("touchstart", (evt) => {
      const { x, y } = canvasPos(canvas, evt);
      const area = getArea();
      const sorted = sortedPoints();
      const idx = findNearestPoint(sorted, x, y, area, DOT_R + 14);
      if (idx >= 0) { touchDragging = idx; evt.preventDefault(); }
    }, { passive: false });

    canvas.addEventListener("touchmove", (evt) => {
      if (touchDragging === null) return;
      evt.preventDefault();
      const { x, y } = canvasPos(canvas, evt);
      const area = getArea();
      const pt = pixelToPt(x, y, area);
      const sorted = sortedPoints();
      const prev = sorted[touchDragging - 1];
      const next = sorted[touchDragging + 1];
      const minX = prev ? prev.x + 0.01 : 0;
      const maxX = next ? next.x - 0.01 : 1;
      sorted[touchDragging] = { x: Math.max(minX, Math.min(maxX, pt.x)), y: pt.y };
      applySort(sorted);
      drawCurveChart(canvas, state[stateKey], color);
      saveState();
    }, { passive: false });

    canvas.addEventListener("touchend", () => { touchDragging = null; });
  }

  // ---- Twist track interaction ----
  function makeTwistInteraction(canvas) {
    let dragging = false;

    function getTwistX(evt) {
      const rect = canvas.getBoundingClientRect();
      const src = evt.touches ? evt.touches[0] : evt;
      const x = src.clientX - rect.left;
      const w = rect.width;
      const x0 = TWIST_PAD.left * (w / (canvas.width / dpr()));
      const x1 = w - TWIST_PAD.right * (w / (canvas.width / dpr()));
      return Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
    }

    canvas.addEventListener("mousedown", (evt) => {
      dragging = true;
      state.twist = getTwistX(evt);
      drawTwistTrack(canvas, state.twist);
      updateTwistHint();
      saveState();
    });

    window.addEventListener("mousemove", (evt) => {
      if (!dragging) return;
      state.twist = getTwistX(evt);
      drawTwistTrack(canvas, state.twist);
      updateTwistHint();
      saveState();
    });

    window.addEventListener("mouseup", () => { dragging = false; });

    canvas.addEventListener("touchstart", (evt) => {
      evt.preventDefault();
      dragging = true;
      state.twist = getTwistX(evt);
      drawTwistTrack(canvas, state.twist);
      updateTwistHint();
      saveState();
    }, { passive: false });

    canvas.addEventListener("touchmove", (evt) => {
      if (!dragging) return;
      evt.preventDefault();
      state.twist = getTwistX(evt);
      drawTwistTrack(canvas, state.twist);
      updateTwistHint();
      saveState();
    }, { passive: false });

    canvas.addEventListener("touchend", () => { dragging = false; });
  }

  // ---- Options overlay ----
  const optionsButton = document.getElementById("options-button");
  const closeOptionsButton = document.getElementById("close-options-button");
  const optionsOverlay = document.getElementById("options-overlay");

  if (optionsButton && optionsOverlay && closeOptionsButton) {
    optionsButton.addEventListener("click", () => {
      optionsOverlay.hidden = false;
      setTimeout(sizeAll, 30); // redraw after modal becomes visible
    });
    closeOptionsButton.addEventListener("click", () => {
      optionsOverlay.hidden = true;
    });
    optionsOverlay.addEventListener("click", (evt) => {
      if (evt.target === optionsOverlay) optionsOverlay.hidden = true;
    });
    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") optionsOverlay.hidden = true;
    });
  }

  // ---- Tab switching ----
  document.querySelectorAll(".options-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".options-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const targetId = "tab-" + tab.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.hidden = panel.id !== targetId;
      });
      if (tab.dataset.tab === "narration") {
        setTimeout(sizeAll, 30);
      }
    });
  });

  // ---- Init ----
  makeChartInteraction(paceCanvas, "pace", THEME.pace);
  makeChartInteraction(fearCanvas, "fear", THEME.fear);
  makeTwistInteraction(twistCanvas);

  // Resize observer
  const ro = new ResizeObserver(() => sizeAll());
  [paceCanvas, fearCanvas, twistCanvas].forEach((c) => ro.observe(c));

  // Initial draw (slight delay to let CSS layout settle)
  setTimeout(sizeAll, 50);
})();
