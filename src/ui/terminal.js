// terminal.js — feedback estilo terminal, JetBrains Mono, signal/mesh/corrupt.
// Acumula linhas com timestamp relativo ao boot e mantém últimas N visíveis.

const MAX_LINES = 14;
const t0 = performance.now();

function ts() {
  const ms = performance.now() - t0;
  const s = (ms / 1000).toFixed(3).padStart(7, "0");
  return s;
}

export function createTerminal(rootEl) {
  const lines = [];
  function render() {
    rootEl.innerHTML = lines
      .map(({ kind, text }) => `<div class="term__line term__line--${kind}">${text}</div>`)
      .join("");
  }
  function push(kind, text) {
    const line = `[${ts()}] ${text}`;
    lines.push({ kind, text: line });
    if (lines.length > MAX_LINES) lines.shift();
    render();
  }
  return {
    info: (t) => push("info", t.toUpperCase()),
    ok: (t) => push("ok", t.toUpperCase()),
    err: (t) => push("err", `! ${t.toUpperCase()}`),
    raw: (t) => push("info", t),
  };
}
