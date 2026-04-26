// main.js — bootstrap + plot dos 478 pontos da face em WebGL2.
import { startCamera } from "./pipeline/camera.js";
import { loadFace, detectFace, TESSELATION } from "./pipeline/face.js";
import { createPointsRenderer } from "./render/points-gl.js";
import { initTrackingPanels, renderTrackingPanels, setVisible as setPanelsVisible } from "./ui/tracking-panels.js";
import { initGlitchLines, renderGlitchLines } from "./render/glitch-lines.js";
import { initGlitchSquares, renderGlitchSquares } from "./render/glitch-squares.js";
import { setupRecorder, startRecording, stopRecording, getState as getRecState } from "./ui/recorder.js";

// Densidade da malha (barycentric grid). Cada triângulo recebe (N+1)(N+2)/2 pontos.
// N=1: 3 pts/tri  N=3: 10  N=5: 21  N=7: 36  N=8: 45
function readDensity() {
  const v = parseInt(new URLSearchParams(location.search).get("density"), 10);
  if (!Number.isFinite(v)) return 5;
  return Math.max(1, Math.min(8, v));
}
const DENSITY = readDensity();

// Reconstrói triângulos a partir das arestas da tessellation (MediaPipe expõe edges).
let TRIANGLES = [];
function buildTriangles(edges) {
  const adj = new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  for (const e of edges) {
    const a = e.start ?? e[0];
    const b = e.end ?? e[1];
    add(a, b); add(b, a);
  }
  const tris = [];
  const seen = new Set();
  for (const e of edges) {
    const a = e.start ?? e[0];
    const b = e.end ?? e[1];
    const setA = adj.get(a);
    const setB = adj.get(b);
    if (!setA || !setB) continue;
    for (const c of setA) {
      if (c !== b && setB.has(c)) {
        const sorted = [a, b, c].sort((x, y) => x - y);
        const key = sorted.join(",");
        if (!seen.has(key)) {
          seen.add(key);
          tris.push([a, b, c]);
        }
      }
    }
  }
  return tris;
}

// Pontos únicos: vértices + interpolações nas arestas + interior dos triângulos.
// Sem duplicatas → alpha uniforme.
function buildPointPlan(triangles, N) {
  const vertSet = new Set();
  for (const [a, b, c] of triangles) { vertSet.add(a); vertSet.add(b); vertSet.add(c); }
  const vertices = [...vertSet];

  const edgeMap = new Map();
  const addEdge = (x, y) => {
    const lo = Math.min(x, y), hi = Math.max(x, y);
    const k = lo + "," + hi;
    if (!edgeMap.has(k)) edgeMap.set(k, [lo, hi]);
  };
  for (const [a, b, c] of triangles) { addEdge(a, b); addEdge(b, c); addEdge(c, a); }
  const edges = [...edgeMap.values()];

  // Interpolações ao longo de cada aresta: t = 1/N, 2/N, ..., (N-1)/N
  const edgeT = [];
  for (let i = 1; i < N; i++) edgeT.push(i / N);

  // Interior do triângulo: i,j,k > 0 e i+j+k = N
  const interior = [];
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N - i; j++) {
      const k = N - i - j;
      if (k >= 1) interior.push([i / N, j / N, k / N]);
    }
  }

  const total = vertices.length + edges.length * edgeT.length + triangles.length * interior.length;
  return { vertices, edges, edgeT, interior, total };
}
let PLAN = null;

// Índices ordenados do FACE_OVAL do MediaPipe FaceLandmarker — formam um loop
// fechado contornando o rosto (testa → bochecha → queixo → bochecha → testa).
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
import { createHUD } from "./ui/hud.js";
import { createTerminal } from "./ui/terminal.js";

const body = document.body;
const video = document.getElementById("video");
const canvas = document.getElementById("output");
const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
const pointsCanvas = document.getElementById("points");
const points = createPointsRenderer(pointsCanvas);
let pointPositions = null; // Float32Array reutilizado entre frames
let glitchAmount = 0.03;
const hud = createHUD(document.getElementById("hud"));
const term = createTerminal(document.getElementById("term"));
const btnStart = document.getElementById("btn-start");
const btnRetry = document.getElementById("btn-retry");
const barFill = document.getElementById("bar-fill");
const barPct = document.getElementById("bar-pct");
const deniedReason = document.getElementById("denied-reason");

let cam = null;
let running = false;
let lastTs = 0;

// Smoothing exponencial pra evitar tremor do landmark
// Centro: alpha mais alto (segue rosto). Tamanho: alpha mais baixo (estabiliza zoom).
let smCx = null, smCy = null, smCz = null, smSize = null;
const ALPHA_POS = 0.18;
const ALPHA_SIZE = 0.08;
const TARGET_FACE_RATIO = 0.65;

function smooth(prev, target, a) {
  return prev == null ? target : prev + (target - prev) * a;
}

// Controles de debug (sliders)
let pointSize = 2.0;
let pointAlpha = 1.0;
let centerWeak = 0.5;
let lightRadius = 0.53;

// Disintegration — defaults travados pelo autor
let disintAmount = 0.12;
let disintRate = 0.104;
let disintDistance = 1.20;
let disintDuty = 0.59;
let disintDriftX = -0.10;
let disintDriftY = -0.45;
let disintDriftZ = 0.50;
// Solar curl — defaults travados pelo autor.
const OCTAVE = { values: [4.55, 0.69, 0.0045, 0.29] }; // size, speed, amp, mix

// Landmarks de features pra máscara de proteção (olhos, nariz, boca).
// Indices oficiais do MediaPipe FaceLandmarker:
//   468 = íris esquerda · 473 = íris direita
//   4   = ponta do nariz
//   61  = canto esquerdo da boca · 291 = canto direito · 13 = lábio superior
const FEATURE_LANDMARKS = [468, 473, 4, 61, 291, 13];
const featuresBuf = new Float32Array(FEATURE_LANDMARKS.length * 2);
const T0 = performance.now();

function setState(s) {
  body.dataset.state = s;
  document.querySelectorAll(".screen").forEach((el) => {
    el.hidden = el.dataset.screen !== s;
  });
  hud.setState(s);
  term.info(`STATE → ${s}`);
  // Terminal sempre visível agora — também em live
  document.getElementById("term").hidden = false;
  setPanelsVisible(s === "live");
}

function checkSupport() {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  return true;
}

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  canvas.width = w;
  canvas.height = h;
  points.resize(w, h);
}
window.addEventListener("resize", fitCanvas, { passive: true });
fitCanvas();

// Progresso fluido: target real vem do download; display segue por ease.
let progressTarget = 0;
let progressDisplay = 0;
let progressRafId = null;
function setProgress(p) {
  progressTarget = Math.max(progressTarget, p); // monotonic
  if (progressRafId == null) progressRafId = requestAnimationFrame(progressLoop);
}
function progressLoop() {
  const gap = progressTarget - progressDisplay;
  progressDisplay += gap * 0.22;
  if (gap < 0.0015) progressDisplay = progressTarget;
  const pct = progressDisplay * 100;
  barFill.style.width = `${pct.toFixed(2)}%`;
  barPct.textContent = `${Math.round(pct)}%`;
  if (progressDisplay < progressTarget - 0.0005) {
    progressRafId = requestAnimationFrame(progressLoop);
  } else {
    progressRafId = null;
  }
}

async function start() {
  term.info("BOOT");
  if (!checkSupport()) { term.err("WEBGL2 / GETUSERMEDIA UNAVAILABLE"); setState("incompat"); return; }
  term.ok("WEBGL2 + GETUSERMEDIA OK");
  try {
    setState("permission");
    term.info("REQUESTING CAMERA");
    cam = await startCamera(video);
    hud.setRes(cam.width, cam.height);
    term.ok(`CAMERA ${cam.width}×${cam.height}`);
  } catch (e) {
    term.err(`CAMERA: ${e.message || e}`);
    deniedReason.textContent = String(e.message || e).toUpperCase();
    setState("denied");
    return;
  }
  try {
    setState("loading");
    setProgress(0);
    term.info("LOADING FACELANDMARKER");
    const t0 = performance.now();
    await loadFace(setProgress);
    TRIANGLES = buildTriangles(TESSELATION);
    PLAN = buildPointPlan(TRIANGLES, DENSITY);
    pointPositions = new Float32Array(PLAN.total * 3);
    initTrackingPanels(document.getElementById("panels"), 478);
    initGlitchLines();
    initGlitchSquares();
    const dt = ((performance.now() - t0) / 1000).toFixed(2);
    term.ok(`FACE READY ${dt}s · ${PLAN.vertices.length} V · ${PLAN.edges.length} E · ${TRIANGLES.length} T · ${PLAN.total} TOTAL`);
  } catch (e) {
    term.err(`MODEL: ${e.message || e}`);
    deniedReason.textContent = `MODELO: ${String(e.message || e).toUpperCase()}`;
    setState("denied");
    return;
  }
  setState("live");
  hud.show();
  running = true;
  loop();
}

// Fit por altura: imagem ocupa altura cheia, aspecto preservado, sem crop nem stretch.
// Sobra preto nas laterais quando a câmera é mais "estreita" que o canvas.
function fitHeightRect(cw, ch, vw, vh) {
  const scale = ch / vh;
  const dw = vw * scale, dh = ch;
  const dx = (cw - dw) / 2, dy = 0;
  return { dx, dy, dw, dh };
}

function loop() {
  if (!running) return;
  const cw = canvas.width, ch = canvas.height;
  const vw = video.videoWidth || cw;
  const vh = video.videoHeight || ch;

  // canvas transparente — <video> sob ele em P&B via CSS filter (GPU-composited)
  ctx.clearRect(0, 0, cw, ch);

  const { dx, dy, dw, dh } = fitHeightRect(cw, ch, vw, vh);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const now = performance.now();
  const ts = now > lastTs ? now : lastTs + 1;
  lastTs = ts;

  const face = detectFace(video, ts);

  if (!face) {
    // Sem rosto: apaga TUDO (pontos, HUD canvas, painéis DOM)
    ctx.clearRect(0, 0, cw, ch);
    points.clear();
    if (body.dataset.face !== "lost") body.dataset.face = "lost";
    if (body.dataset.glitch === "on") body.dataset.glitch = "";
  } else {
    if (body.dataset.face === "lost") body.dataset.face = "";
    // Bbox do FACE_OVAL em coords normalizadas, incluindo Z médio
    let minX = 1, maxX = 0, minY = 1, maxY = 0, sumZ = 0;
    for (const i of FACE_OVAL) {
      const p = face[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      sumZ += p.z;
    }
    const cxN = (minX + maxX) / 2;
    const cyN = (minY + maxY) / 2;
    const czN = sumZ / FACE_OVAL.length;
    const sizeN = Math.max(maxX - minX, maxY - minY);

    smCx = smooth(smCx, cxN, ALPHA_POS);
    smCy = smooth(smCy, cyN, ALPHA_POS);
    smCz = smooth(smCz, czN, ALPHA_POS);
    smSize = smooth(smSize, sizeN, ALPHA_SIZE);

    // Calcula features em head-local (mesma transform usada no shader)
    const invSize = 1 / Math.max(smSize, 0.001);
    for (let i = 0; i < FEATURE_LANDMARKS.length; i++) {
      const idx = FEATURE_LANDMARKS[i];
      const lm = face[idx];
      if (lm) {
        featuresBuf[i * 2]     = (lm.x - smCx) * invSize;
        featuresBuf[i * 2 + 1] = (lm.y - smCy) * invSize;
      }
    }

    // K em CSS pixels (1:1 com o canvas device pixels via dpr)
    const K = TARGET_FACE_RATIO / smSize;

    // === Canvas: zoom em device pixels (vídeo não é mais renderizado) ===
    const fcx = dx + smCx * dw;
    const fcy = dy + smCy * dh;

    // canvas2D limpo
    ctx.clearRect(0, 0, cw, ch);

    // Glitch lines saindo das bordas do rosto (FACE_OVAL)
    renderGlitchLines(face, ctx, { dx, dy, dw, dh, cw, dpr, smCx });
    // Glitch squares 8-bit (sprite data row)
    renderGlitchSquares(face, ctx, { dx, dy, dw, dh, cw, dpr, smCx });

    // Tracking HUD: linhas + bolinhas 2× em landmarks aleatórios
    renderTrackingPanels(face, ctx, {
      dx, dy, dw, dh, cw, ch, dpr,
      smCx, smCy, smSize,
      pointSize,
    });

    // 3) Pontos únicos via WebGL2: V + E×(N-1) + T×interior, sem duplicatas
    // Buffer = (x, y, z) normalizado MediaPipe; transforms + curl noise no shader.
    let pi = 0;
    const writePoint = (nx, ny, nz) => {
      pointPositions[pi++] = nx;
      pointPositions[pi++] = ny;
      pointPositions[pi++] = nz;
    };

    for (let v = 0; v < PLAN.vertices.length; v++) {
      const p = face[PLAN.vertices[v]];
      writePoint(p.x, p.y, p.z);
    }
    for (let e = 0; e < PLAN.edges.length; e++) {
      const [a, b] = PLAN.edges[e];
      const pa = face[a], pb = face[b];
      for (let i = 0; i < PLAN.edgeT.length; i++) {
        const t = PLAN.edgeT[i];
        writePoint(
          (1 - t) * pa.x + t * pb.x,
          (1 - t) * pa.y + t * pb.y,
          (1 - t) * pa.z + t * pb.z,
        );
      }
    }
    for (let t = 0; t < TRIANGLES.length; t++) {
      const tri = TRIANGLES[t];
      const pa = face[tri[0]], pb = face[tri[1]], pc = face[tri[2]];
      for (let i = 0; i < PLAN.interior.length; i++) {
        const w = PLAN.interior[i];
        writePoint(
          w[0] * pa.x + w[1] * pb.x + w[2] * pc.x,
          w[0] * pa.y + w[1] * pb.y + w[2] * pc.y,
          w[0] * pa.z + w[1] * pb.z + w[2] * pc.z,
        );
      }
    }
    const time = (performance.now() - T0) / 1000;
    const wantPostForRec = getRecState() === "recording";
    points.draw(
      pointPositions, pi / 3,
      {
        size: pointSize * dpr,
        color: [0.941, 0.941, 0.941, pointAlpha],
        canvasW: cw, canvasH: ch,
        dx, dy, dw, dh,
        time,
        oct: OCTAVE.values,
        centerWeak,
        faceCtr3: [smCx, smCy, smCz],
        faceSize: smSize,
        features: featuresBuf,
        lightRadius,
        disintAmount, disintRate, disintDistance, disintDuty,
        disintDrift: [disintDriftX, disintDriftY, disintDriftZ],
      },
      canvas,
      Math.max(glitchAmount, wantPostForRec ? 0.001 : 0),
      performance.now() / 1000,
    );

    // Quando gravando, força glitch path pra que #points contenha o composite final
    // (pontos + HUD canvas2D). Senão a captura ficaria sem as linhas/ glitch / squares.
    const wantGlitch = glitchAmount > 0.001 || getRecState() === "recording";
    if (wantGlitch && body.dataset.glitch !== "on") body.dataset.glitch = "on";
    else if (!wantGlitch && body.dataset.glitch === "on") body.dataset.glitch = "";
  }

  hud.tick();
  requestAnimationFrame(loop);
}

btnStart.addEventListener("click", start);
btnRetry.addEventListener("click", () => location.reload());

// Eventos do mundo da arte → terminal log (panel switches, glitch lines/squares, etc)
document.addEventListener("artlog", (e) => {
  if (e.detail?.text) term.info(e.detail.text);
});

// === Debug controls ===
const debugEl = document.getElementById("debug");

function addSlider(label, min, max, step, getVal, setVal, fmt = (v) => v.toFixed(2)) {
  const row = document.createElement("label");
  row.className = "debug__row";
  row.innerHTML = `<span class="debug__lbl">${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><span class="debug__val">—</span>`;
  const input = row.querySelector("input");
  const valEl = row.querySelector(".debug__val");
  const refresh = () => { valEl.textContent = fmt(getVal()); input.value = getVal(); };
  refresh();
  input.addEventListener("input", () => { setVal(parseFloat(input.value)); refresh(); });
  debugEl.appendChild(row);
}
function addSubtitle(text) {
  const t = document.createElement("div");
  t.className = "debug__sub";
  t.textContent = text;
  debugEl.appendChild(t);
}

addSubtitle("POINT");
addSlider("SIZE", 0.5, 8, 0.1, () => pointSize, (v) => pointSize = v, (v) => v.toFixed(1));
addSlider("ALPHA", 0, 1, 0.01, () => pointAlpha, (v) => pointAlpha = v);
addSlider("CENTER", 0, 1, 0.01, () => centerWeak, (v) => centerWeak = v);

addSubtitle("DISINT");
addSlider("AMOUNT", 0, 1, 0.01, () => disintAmount, (v) => disintAmount = v);
addSlider("RATE", 0.003, 0.3, 0.001, () => disintRate, (v) => disintRate = v, (v) => v.toFixed(3));
addSlider("DIST", 0, 2.0, 0.01, () => disintDistance, (v) => disintDistance = v, (v) => v.toFixed(2));
addSlider("DUTY", 0.2, 0.95, 0.01, () => disintDuty, (v) => disintDuty = v);
addSlider("DRIFT X", -1, 1, 0.05, () => disintDriftX, (v) => disintDriftX = v);
addSlider("DRIFT Y", -1, 1, 0.05, () => disintDriftY, (v) => disintDriftY = v);
addSlider("DRIFT Z", -1, 1, 0.05, () => disintDriftZ, (v) => disintDriftZ = v);

addSubtitle("GLITCH");
addSlider("AMOUNT", 0, 1, 0.01, () => glitchAmount, (v) => glitchAmount = v);

addSubtitle("LIGHT");
addSlider("RADIUS", 0.05, 1.5, 0.01, () => lightRadius, (v) => lightRadius = v);

addSubtitle("CURL");
addSlider("SIZE", 0.1, 10, 0.05, () => OCTAVE.values[0], (v) => OCTAVE.values[0] = v, (v) => v.toFixed(2));
addSlider("SPEED", 0, 2, 0.01, () => OCTAVE.values[1], (v) => OCTAVE.values[1] = v);
addSlider("AMP", 0, 0.04, 0.0005, () => OCTAVE.values[2], (v) => OCTAVE.values[2] = v, (v) => v.toFixed(4));
addSlider("MIX", 0, 1, 0.01, () => OCTAVE.values[3], (v) => OCTAVE.values[3] = v);

// toggle com tecla D + botões touch (X fecha, "DEBUG" abre)
const debugToggleEl = document.getElementById("debug-toggle");
const debugCloseEl = document.getElementById("debug-close");
function setDebugOpen(open) {
  debugEl.hidden = !open;
  debugToggleEl.hidden = open;
}
window.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "D") setDebugOpen(debugEl.hidden);
});
debugCloseEl.addEventListener("click", () => setDebugOpen(false));
debugToggleEl.addEventListener("click", () => setDebugOpen(true));

// === Recording ===
const recBtn = document.getElementById("rec-btn");
const recIndicator = document.getElementById("rec-indicator");
const recTimeEl = document.getElementById("rec-time");
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
}
setupRecorder({
  getSource: () => pointsCanvas,
  onState: (s) => {
    if (s === "recording") {
      recBtn.textContent = "■ STOP";
      recBtn.classList.add("rec-btn--rec");
      recIndicator.hidden = false;
    } else {
      recBtn.textContent = "● REC";
      recBtn.classList.remove("rec-btn--rec");
      recIndicator.hidden = true;
    }
  },
  onTime: (p) => {
    const elapsed = p * 30;
    recTimeEl.textContent = `REC ${fmtTime(elapsed)} / 0:30`;
  },
});
recBtn.addEventListener("click", () => {
  if (getRecState() === "idle") startRecording();
  else stopRecording();
});

setState("idle");
