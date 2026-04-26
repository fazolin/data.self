// glitch-lines.js — linhas horizontais saindo de pontos periféricos do rosto.
// Comprimentos diferentes, mudam em intervalos aleatórios. Cor predominante signal,
// com toques mesh/corrupt pra estética glitch.

const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const N_LINES = 14;
const SWITCH_MIN_MS = 2000;
const SWITCH_MAX_MS = 8000;
const lines = [];

function rand(min, max) { return min + Math.random() * (max - min); }
function randSwitch() { return SWITCH_MIN_MS + Math.random() * (SWITCH_MAX_MS - SWITCH_MIN_MS); }
function randColor() {
  const r = Math.random();
  if (r < 0.10) return "corrupt";
  if (r < 0.30) return "mesh";
  return "signal";
}

// Reaplica propriedades aleatórias (chamado no init e em cada switch)
function reroll(L, idx, now) {
  L.idx = idx;
  L.baseLen = rand(30, 220);
  L.changeInterval = rand(150, 1400);
  L.alpha = rand(0.4, 0.95);
  L.width = rand(1, 2.5);
  L.color = randColor();
  L.breakChance = Math.random() < 0.35;
  L.nextChange = now + rand(0, 600);
}

export function initGlitchLines() {
  const pool = [...FACE_OVAL_INDICES];
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, Math.min(N_LINES, pool.length));

  const now = performance.now();
  for (const idx of picks) {
    const L = { currentLen: 0, nextSwitchT: now + randSwitch() };
    reroll(L, idx, now);
    lines.push(L);
  }
}

const COLOR_MAP = {
  signal:  [240, 240, 240],
  mesh:    [0, 255, 255],
  corrupt: [255, 0, 51],
};

export function renderGlitchLines(face, ctx, opts) {
  const { dx, dy, dw, dh, cw, dpr, smCx } = opts;
  const fxScreen = cw - (dx + smCx * dw);
  const now = performance.now();

  for (const L of lines) {
    if (now >= L.nextSwitchT) {
      const oldIdx = L.idx;
      let newIdx;
      do {
        newIdx = FACE_OVAL_INDICES[Math.floor(Math.random() * FACE_OVAL_INDICES.length)];
      } while (newIdx === L.idx);
      reroll(L, newIdx, now);
      L.nextSwitchT = now + randSwitch();
      document.dispatchEvent(new CustomEvent("artlog", {
        detail: { text: `LINE ${String(oldIdx).padStart(3, "0")} → ${String(newIdx).padStart(3, "0")} ${L.color.toUpperCase()}` }
      }));
    }
    const lm = face[L.idx];
    if (!lm) continue;

    const tx = cw - (dx + lm.x * dw);
    const ty = dy + lm.y * dh;
    const dir = tx < fxScreen ? -1 : 1;

    if (now >= L.nextChange) {
      L.currentLen = L.baseLen * rand(0.4, 1.0);
      L.nextChange = now + L.changeInterval;
    }

    const totalLen = L.currentLen * dpr;
    const c = COLOR_MAP[L.color];
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${L.alpha})`;
    ctx.lineWidth = L.width * dpr;
    ctx.lineCap = "butt";

    if (!L.breakChance) {
      // linha sólida
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + dir * totalLen, ty);
      ctx.stroke();
    } else {
      // linha quebrada em 2-4 segmentos (datamosh)
      const segs = 2 + Math.floor(Math.random() * 3);
      let x = tx;
      for (let s = 0; s < segs; s++) {
        const segLen = (totalLen / segs) * rand(0.5, 1.0);
        ctx.beginPath();
        ctx.moveTo(x, ty);
        ctx.lineTo(x + dir * segLen, ty);
        ctx.stroke();
        x += dir * (segLen + rand(2, 8) * dpr);
      }
    }
  }
}
