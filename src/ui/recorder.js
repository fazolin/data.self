// recorder.js — captura o canvas principal + áudio do mic. Aspecto se adapta:
// 16:9 em landscape, 9:16 em portrait. Para automaticamente em 30s ou no click.
// Salva como mp4 quando suportado, senão webm.

const MAX_DURATION_MS = 30000;
const FPS = 30;
const VIDEO_BITRATE = 12_000_000; // ~12 Mbps pra 1080p

let state = "idle"; // idle | recording
let recorder = null;
let audioStream = null;
let frameRafId = null;
let recCanvas = null;
let recCtx = null;
let chunks = [];
let startT = 0;
let autoStopTimer = null;
let onStateChange = null;
let onProgress = null;
let getSourceFn = null; // () => HTMLCanvasElement (canvas to capture)

function pickSize() {
  // 1080p sempre — full HD em ambas orientações
  const portrait = window.innerHeight > window.innerWidth;
  return portrait ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
}

function pickMime(needAudio) {
  // MP4 vem primeiro. Chrome 121+ Windows/Mac, Safari, Edge recente: gravam mp4 nativo.
  // Firefox: só webm. Sem opção.
  const mp4 = [
    `video/mp4;codecs="avc1.42E01F,mp4a.40.2"`,
    `video/mp4;codecs="avc1.4D401E,mp4a.40.2"`,
    `video/mp4;codecs="avc1.640028,mp4a.40.2"`,
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
  ];
  const webm = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=avc1,opus",
    "video/webm",
  ];
  // Se precisa áudio, exige codec que sabemos ter audio. Senão filtra mais relaxado.
  for (const c of [...mp4, ...webm]) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch {}
  }
  return "";
}

function copyFrame() {
  const src = getSourceFn?.();
  if (src && recCtx) {
    const sw = src.width, sh = src.height;
    const w = recCanvas.width, h = recCanvas.height;
    const targetAspect = w / h;
    const srcAspect = sw / sh;
    let sx, sy, cw_, ch_;
    if (srcAspect > targetAspect) {
      ch_ = sh; cw_ = sh * targetAspect;
      sx = (sw - cw_) / 2; sy = 0;
    } else {
      cw_ = sw; ch_ = sw / targetAspect;
      sx = 0; sy = (sh - ch_) / 2;
    }
    recCtx.fillStyle = "#000";
    recCtx.fillRect(0, 0, w, h);
    recCtx.drawImage(src, sx, sy, cw_, ch_, 0, 0, w, h);
  }
  if (state === "recording") {
    onProgress?.(Math.min(1, (performance.now() - startT) / MAX_DURATION_MS));
    frameRafId = requestAnimationFrame(copyFrame);
  }
}

export function setupRecorder({ getSource, onState, onTime }) {
  getSourceFn = getSource;
  onStateChange = onState;
  onProgress = onTime;
}

export function getState() { return state; }

export async function startRecording() {
  if (state !== "idle") return;

  const { w, h } = pickSize();
  if (!recCanvas) {
    recCanvas = document.createElement("canvas");
    recCtx = recCanvas.getContext("2d", { alpha: false });
  }
  recCanvas.width = w;
  recCanvas.height = h;

  // Mic — pede permissão explícita. Se negar/falhar, grava sem áudio mas avisa.
  audioStream = null;
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const tracks = audioStream.getAudioTracks();
      if (tracks.length === 0) {
        console.warn("REC: getUserMedia retornou stream sem audio tracks");
        audioStream = null;
      } else {
        console.log("REC: audio track ok —", tracks[0].label || "default mic");
      }
    } catch (err) {
      console.warn("REC: audio negado/falhou —", err.name, err.message);
      audioStream = null;
    }
  }

  state = "recording";
  startT = performance.now();
  copyFrame();

  const videoStream = recCanvas.captureStream(FPS);
  const mixed = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => mixed.addTrack(t));
  if (audioStream) {
    audioStream.getAudioTracks().forEach((t) => mixed.addTrack(t));
  }
  console.log("REC: stream tem", mixed.getVideoTracks().length, "vídeo +",
              mixed.getAudioTracks().length, "áudio");

  const mimeType = pickMime(!!audioStream);
  if (!mimeType) {
    console.error("REC: MediaRecorder não suportado nesse browser");
    state = "idle";
    onStateChange?.(state);
    return;
  }
  console.log("REC: usando mime", mimeType);

  chunks = [];
  recorder = new MediaRecorder(mixed, {
    mimeType,
    videoBitsPerSecond: VIDEO_BITRATE,
    audioBitsPerSecond: 128_000,
  });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    if (frameRafId) { cancelAnimationFrame(frameRafId); frameRafId = null; }
    if (audioStream) {
      audioStream.getTracks().forEach((t) => t.stop());
      audioStream = null;
    }
    state = "idle";
    onStateChange?.(state);
    if (chunks.length > 0) {
      const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data-self-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  };
  // timeslice: força flush periódico — em alguns browsers é necessário pra
  // garantir que o áudio entra nos chunks corretamente.
  recorder.start(100);
  onStateChange?.(state);

  autoStopTimer = setTimeout(() => stopRecording(), MAX_DURATION_MS);
}

export function stopRecording() {
  if (state !== "recording") return;
  if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
  if (recorder && recorder.state === "recording") recorder.stop();
}
