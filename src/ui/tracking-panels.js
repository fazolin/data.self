// tracking-panels.js — sci-fi HUD com 10–20 painéis flutuantes em pontos do rosto.
// Cada painel exibe X/Y/Z do landmark + linhas conectoras (canvas2D) + ponto 2× (canvas2D).
// Painel é DOM (CSS transform), segue o landmark com lazy-follow.

const N_PANELS = 14;
const FOLLOW_ALPHA = 0.06; // baixo = lento, dá efeito de inércia/lag
const PANEL_DIST_RATIO = 0.85; // distância do painel ao ponto, em "tamanhos de rosto"
const SWITCH_MIN_MS = 3000;
const SWITCH_MAX_MS = 10000;

const EXCLUDED = new Set([1, 4, 13, 14, 33, 61, 263, 291, 468, 473]); // features
const panels = [];
let trackedIndices = [];
let candidates = [];

function randSwitchDelay() {
  return SWITCH_MIN_MS + Math.random() * (SWITCH_MAX_MS - SWITCH_MIN_MS);
}

export function initTrackingPanels(container, faceCount = 478) {
  candidates = [];
  for (let i = 0; i < faceCount; i++) if (!EXCLUDED.has(i)) candidates.push(i);
  const picked = new Set();
  while (picked.size < N_PANELS) {
    picked.add(candidates[Math.floor(Math.random() * candidates.length)]);
  }
  trackedIndices = [...picked];

  const now = performance.now();
  for (const idx of trackedIndices) {
    const el = document.createElement("div");
    el.className = "tpanel";
    el.innerHTML = `
      <span class="tpanel__hdr">P_${String(idx).padStart(3, "0")}</span>
      <div class="tpanel__row"><span class="tpanel__axis">X</span><span data-axis="x">+0.000</span></div>
      <div class="tpanel__row"><span class="tpanel__axis">Y</span><span data-axis="y">+0.000</span></div>
      <div class="tpanel__row"><span class="tpanel__axis">Z</span><span data-axis="z">+0.000</span></div>
    `;
    container.appendChild(el);
    panels.push({
      idx,
      el,
      hdrEl: el.querySelector(".tpanel__hdr"),
      xEl: el.querySelector('[data-axis="x"]'),
      yEl: el.querySelector('[data-axis="y"]'),
      zEl: el.querySelector('[data-axis="z"]'),
      sx: null, sy: null,
      lastTextT: 0,
      nextSwitchT: now + randSwitchDelay(),
    });
  }
  return trackedIndices;
}

function pickDifferentIndex(currentIdx) {
  let next;
  do {
    next = candidates[Math.floor(Math.random() * candidates.length)];
  } while (next === currentIdx);
  return next;
}

function bang(p) {
  p.el.classList.remove("tpanel--bang");
  void p.el.offsetWidth; // reflow força restart da animação
  p.el.classList.add("tpanel--bang");
}

function emitLog(text) {
  document.dispatchEvent(new CustomEvent("artlog", { detail: { text } }));
}

export function setVisible(visible) {
  for (const p of panels) p.el.style.display = visible ? "" : "none";
}

export function renderTrackingPanels(face, ctx, opts) {
  const { dx, dy, dw, dh, cw, ch, dpr, smCx, smCy, smSize, pointSize } = opts;

  const fxScreen = cw - (dx + smCx * dw);
  const fyScreen = dy + smCy * dh;
  const panelDistPx = smSize * dh * PANEL_DIST_RATIO;

  ctx.lineWidth = 1;
  const now = performance.now();

  for (const p of panels) {
    // Trocar alvo em intervalos aleatórios (3-10s), cada painel no seu ritmo
    if (now >= p.nextSwitchT) {
      const oldIdx = p.idx;
      p.idx = pickDifferentIndex(p.idx);
      p.hdrEl.textContent = `P_${String(p.idx).padStart(3, "0")}`;
      p.nextSwitchT = now + randSwitchDelay();
      bang(p);
      emitLog(`PANEL ${String(oldIdx).padStart(3, "0")} → ${String(p.idx).padStart(3, "0")}`);
    }
    const lm = face[p.idx];
    if (!lm) continue;

    // Projeção espelhada (mesma do shader)
    const tx = cw - (dx + lm.x * dw);
    const ty = dy + lm.y * dh;

    // Direção radial: face center → ponto
    const ddx = tx - fxScreen;
    const ddy = ty - fyScreen;
    const len = Math.hypot(ddx, ddy) || 1;
    const ndx = ddx / len, ndy = ddy / len;

    const targetX = tx + ndx * panelDistPx;
    const targetY = ty + ndy * panelDistPx;

    // Lazy follow
    if (p.sx == null) { p.sx = targetX; p.sy = targetY; }
    p.sx += (targetX - p.sx) * FOLLOW_ALPHA;
    p.sy += (targetY - p.sy) * FOLLOW_ALPHA;

    // Clamp pra não sair do canvas. Mede o painel (CSS px) e converte pra device px.
    const pw = (p.el.offsetWidth || 110) * dpr;
    const ph = (p.el.offsetHeight || 56) * dpr;
    const margin = 8 * dpr;
    const minX = margin, maxX = cw - pw - margin;
    const minY = margin, maxY = ch - ph - margin;
    if (p.sx < minX) p.sx = minX; else if (p.sx > maxX) p.sx = maxX;
    if (p.sy < minY) p.sy = minY; else if (p.sy > maxY) p.sy = maxY;

    // DOM transform (CSS px)
    const cssX = p.sx / dpr;
    const cssY = p.sy / dpr;
    p.el.style.transform = `translate3d(${cssX}px, ${cssY}px, 0)`;

    // Conectores: do painel → horizontal pro X do ponto → vertical até o ponto
    ctx.strokeStyle = "rgba(0, 255, 255, 0.55)";
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy);
    ctx.lineTo(tx, p.sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Ponto rastreado: bolinha 2× o tamanho dos pontos da malha
    ctx.fillStyle = "rgba(0, 255, 255, 1.0)";
    ctx.beginPath();
    ctx.arc(tx, ty, pointSize * dpr, 0, Math.PI * 2);
    ctx.fill();

    // Texto: throttle 10Hz
    if (now - p.lastTextT > 100) {
      const fmt = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
      p.xEl.textContent = fmt(lm.x);
      p.yEl.textContent = fmt(lm.y);
      p.zEl.textContent = fmt(lm.z);
      p.lastTextT = now;
    }
  }
}
