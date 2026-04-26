// hud.js — overlay diagnóstico, JetBrains Mono 10px

export function createHUD(root) {
  const el = root;
  const state = el.querySelector("#hud-state");
  const fps = el.querySelector("#hud-fps");
  const res = el.querySelector("#hud-res");
  const err = el.querySelector("#hud-err");

  let frames = 0;
  let last = performance.now();
  let fpsVal = 0;
  let lastFrameTs = performance.now();
  let frameTimes = [];

  return {
    show() { el.hidden = false; },
    hide() { el.hidden = true; },
    setState(s) { state.textContent = `STATE: ${s.toUpperCase()}`; },
    setRes(w, h) { if (res) res.textContent = `RES: ${w}×${h}`; },
    setError(msg) {
      if (!err) return;
      err.textContent = msg ? `ERR: ${String(msg).slice(0, 80).toUpperCase()}` : "";
    },
    tick() {
      const now = performance.now();
      const delta = now - lastFrameTs;
      lastFrameTs = now;
      frameTimes.push(delta);
      if (frameTimes.length > 60) frameTimes.shift();
      frames++;
      const dt = now - last;
      if (dt >= 250) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        fpsVal = avg > 0 ? Math.round(1000 / avg) : 0;
        fps.textContent = `FPS: ${fpsVal}`;
        frames = 0;
        last = now;
      }
      return fpsVal;
    },
    fps() { return fpsVal; },
  };
}
