// glitch-squares.js — sequências de 8 cells (estilo 8-bit / sprite data) saindo
// de pontos periféricos do rosto. Comportam como as glitch lines mas em vez de
// uma linha, são uma fileira de quadrados/retângulos com alturas variadas.

const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const N_STRIPS = 10;
const N_CELLS = 8;
const SWITCH_MIN_MS = 2500;
const SWITCH_MAX_MS = 7500;

const strips = [];

function rand(min, max) { return min + Math.random() * (max - min); }
function randSwitch() { return SWITCH_MIN_MS + Math.random() * (SWITCH_MAX_MS - SWITCH_MIN_MS); }

const COLOR_MAP = {
  signal:  [240, 240, 240],
  mesh:    [0, 255, 255],
  corrupt: [255, 0, 51],
};

function randColor() {
  const r = Math.random();
  if (r < 0.10) return "corrupt";
  if (r < 0.35) return "mesh";
  return "signal";
}

// Re-aplica propriedades aleatórias (no init e em cada switch)
function reroll(S, idx, now) {
  S.idx = idx;
  S.cellW = rand(4, 12);              // largura px CSS de cada célula
  S.gap = rand(1, 4);                 // gap entre células
  // alturas individuais por célula (look 8-bit data-row irregular)
  S.heights = [];
  for (let i = 0; i < N_CELLS; i++) S.heights.push(rand(2, 14));
  // máscara de visibilidade: alguns vazios pra cara glitch
  S.visible = [];
  for (let i = 0; i < N_CELLS; i++) S.visible.push(Math.random() > 0.18);
  S.color = randColor();
  S.alpha = rand(0.55, 0.95);
  S.changeInterval = rand(120, 900);  // refresh frequency da máscara
  S.nextChange = now + rand(0, 400);
}

export function initGlitchSquares() {
  const pool = [...FACE_OVAL_INDICES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, Math.min(N_STRIPS, pool.length));

  const now = performance.now();
  for (const idx of picks) {
    const S = { nextSwitchT: now + randSwitch() };
    reroll(S, idx, now);
    strips.push(S);
  }
}

export function renderGlitchSquares(face, ctx, opts) {
  const { dx, dy, dw, dh, cw, dpr, smCx } = opts;
  const fxScreen = cw - (dx + smCx * dw);
  const now = performance.now();

  for (const S of strips) {
    // Switch pra novo landmark periodicamente
    if (now >= S.nextSwitchT) {
      const oldIdx = S.idx;
      let newIdx;
      do {
        newIdx = FACE_OVAL_INDICES[Math.floor(Math.random() * FACE_OVAL_INDICES.length)];
      } while (newIdx === S.idx);
      reroll(S, newIdx, now);
      S.nextSwitchT = now + randSwitch();
      document.dispatchEvent(new CustomEvent("artlog", {
        detail: { text: `8BIT ${String(oldIdx).padStart(3, "0")} → ${String(newIdx).padStart(3, "0")} ${S.color.toUpperCase()}` }
      }));
    }

    // Refresh intra-strip (alturas e máscara) sem mudar landmark — micro animação
    if (now >= S.nextChange) {
      for (let i = 0; i < N_CELLS; i++) {
        S.heights[i] = rand(2, 14);
        S.visible[i] = Math.random() > 0.18;
      }
      S.nextChange = now + S.changeInterval;
    }

    const lm = face[S.idx];
    if (!lm) continue;

    const tx = cw - (dx + lm.x * dw);
    const ty = dy + lm.y * dh;
    const dir = tx < fxScreen ? -1 : 1;

    const c = COLOR_MAP[S.color];
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${S.alpha})`;

    let cursor = tx + dir * (S.cellW * 0.6) * dpr; // pequeno gap inicial do oval
    for (let i = 0; i < N_CELLS; i++) {
      const w = S.cellW * dpr;
      const h = S.heights[i] * dpr;
      if (S.visible[i]) {
        const x = dir > 0 ? cursor : cursor - w;
        ctx.fillRect(x, ty - h / 2, w, h);
      }
      cursor += dir * (S.cellW + S.gap) * dpr;
    }
  }
}
