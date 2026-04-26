// face.js — MediaPipe FaceLandmarker (478 pontos 3D) via Tasks Vision.

const VISION_BUNDLE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs";
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarker = null;
export let TESSELATION = [];

export async function loadFace(onProgress = () => {}) {
  // 1) Bundle JS
  onProgress(0.02);
  const mod = await import(VISION_BUNDLE);
  const { FilesetResolver, FaceLandmarker } = mod;
  TESSELATION = FaceLandmarker.FACE_LANDMARKS_TESSELATION || [];
  onProgress(0.08);

  // 2) WASM fileset
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  onProgress(0.18);

  // 3) Modelo .task — fetch manual com progresso por bytes recebidos
  const resp = await fetch(FACE_MODEL);
  if (!resp.ok) throw new Error(`MODEL FETCH ${resp.status}`);
  const totalHdr = resp.headers.get("Content-Length");
  const total = totalHdr ? parseInt(totalHdr, 10) : 3_500_000;
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const frac = Math.min(received / total, 1);
    onProgress(0.18 + frac * 0.74); // 0.18 → 0.92 conforme bytes chegam
  }
  const buffer = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { buffer.set(c, off); off += c.length; }

  onProgress(0.93);

  // 4) Inicializa modelo do buffer. Essa fase NÃO reporta progresso, então
  //    fingimos um creep de 0.93 → 0.99 enquanto a Promise resolve.
  let fakeP = 0.93;
  const fakeTimer = setInterval(() => {
    fakeP = Math.min(fakeP + 0.006, 0.99);
    onProgress(fakeP);
  }, 60);
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: buffer, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  } finally {
    clearInterval(fakeTimer);
  }
  onProgress(1);
}

export function detectFace(videoEl, ts) {
  if (!landmarker || videoEl.readyState < 2) return null;
  const r = landmarker.detectForVideo(videoEl, ts);
  return r?.faceLandmarks?.[0] || null;
}
