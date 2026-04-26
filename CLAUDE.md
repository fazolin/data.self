# data.self

Web art interativa, client-side: o usuário vira ponto, dado e glitch. Webcam → MediaPipe FaceLandmarker → nuvem de pontos densa em WebGL2 com curl noise + desintegração + iluminação + glitch + HUD sci-fi. Gravação em 1080p (vídeo + mic) com download automático.

URL pública: https://fazolin.github.io/data.self/

---

## Stack

- **Vanilla** HTML + CSS + ES Modules. Sem framework, sem bundler.
- **MediaPipe Tasks Vision** (CDN jsdelivr) — `FaceLandmarker` em modo VIDEO, GPU delegate, 478 landmarks 3D.
- **WebGL2** — vertex shader com curl noise 3D (Stefan Gustavson simplex), instanced rendering pra trails de desintegração, FBO para post-process.
- **Canvas2D** sobre WebGL pra HUD (linhas, círculos, glitch squares 8-bit).
- **DOM overlays** pra tracking panels sci-fi (CSS transforms, lazy-follow).
- **MediaRecorder API** — captura canvas + mic, encoding mp4/webm conforme browser.
- **Tudo client-side**. Zero servidor. Modelo MediaPipe baixado do storage.googleapis.com com progresso real (fetch + reader).

---

## Regra de ouro (herdada do design-system fazolin)

**Interface** (entrada, loading, erro, HUD, debug, terminal, REC) segue design-system estrito:
- Paleta: `--color-void #000`, `--color-signal #F0F0F0`, `--color-mesh #00FFFF`, `--color-corrupt #FF0033`. Nada fora disso.
- Tipografia: Oswald 700 (display) + JetBrains Mono 500 (HUD/labels). Fontes via Google Fonts.
- Sem gradientes, sem border-radius >2px, sem blur decorativo, sem spinners, transições ≤120ms, easing reto (`steps()`).

**Interior da obra** (canvas WebGL2 + curl + glitch shader + iluminação) **pode quebrar qualquer regra**. Cor, ruído, geometria — livre.

A linha entre os dois é o `<canvas id="points">`. Tudo dentro = obra. Tudo fora = interface.

---

## Estrutura

```
/index.html
/styles/interface.css          # interface estrita (design-system)
/src/
  main.js                      # bootstrap, state machine, render loop
  pipeline/
    camera.js                  # getUserMedia adaptativo por device
    face.js                    # FaceLandmarker + fetch do .task com progresso real
  render/
    points-gl.js               # vertex shader principal (curl + disint + light + projeção)
                               # + post-process glitch shader no MESMO GL context (FBO)
    glitch-lines.js            # linhas horizontais saindo do FACE_OVAL
    glitch-squares.js          # tiras 8-bit (8 cells por strip)
  ui/
    hud.js                     # STATE / FPS bottom-right
    terminal.js                # log estilo console com timestamps
    tracking-panels.js         # painéis DOM sci-fi com X/Y/Z + linhas conectoras
    recorder.js                # MediaRecorder + canvas offscreen 1080p
```

---

## Estados

- **idle** — wordmark `DATA.SELF` com `fx-loud` (RGB shift agressivo), CTA `[ INICIAR ]` glitchado
- **permission** — solicitando câmera
- **loading** — barra reta com listras animadas; progresso REAL via fetch byte-a-byte do modelo (3.6MB) + creep fake durante init silencioso
- **denied** / **incompat** — `ACESSO NEGADO` / `INCOMPATÍVEL` em corrupt
- **live** — render principal: HUD, debug toggle, REC, terminal log, tracking panels visíveis
- **recording** — overlay top-center com countdown `REC 0:12 / 0:30`

---

## Pipeline visual (no canvas, durante live)

1. **Pontos** — barycentric grid sobre tessellation da face (~11k vértices únicos com `?density=N`, default 5).
2. **Curl noise 3D** (vertex shader, head-local space) — 1 oitava: SIZE / SPEED / AMP / MIX (cutoff via magnitude do próprio curl).
3. **Máscara de features** — distância mínima a 6 landmarks reais (íris, nariz, boca) → efeitos zerados nos features.
4. **Disintegration** — regiões definidas por noise espacial 3D, lifecycle com duty cycle, ease-in, fade tardio, drift configurável (X/Y/Z), trails via `gl.drawArraysInstanced` com 5 ecos.
5. **Iluminação** — luz fixa em head-local `(0, -0.05, -0.55)`. Falloff radial. Multiplicador global por `faceSize` (mais perto = mais bright).
6. **HUD canvas2D** — glitch lines, glitch squares 8-bit, tracking circles, panel connectors.
7. **Post-process glitch** (mesmo GL context, FBO sample) — RGB shift, scanlines, tape bands, strobe, desat. Slider AMOUNT 0–1. AMOUNT=0 desliga path inteiro (custo zero).

---

## Controles (debug panel — tecla D ou botão flutuante)

- **POINT**: SIZE, ALPHA, CENTER (raio da máscara de features)
- **DISINT**: AMOUNT, RATE, DIST, DUTY, DRIFT X/Y/Z
- **GLITCH**: AMOUNT
- **LIGHT**: RADIUS
- **CURL**: SIZE, SPEED, AMP, MIX

Painel inicia **fechado**. Botão `DEBUG` mesh no canto superior esquerdo abre.

---

## URL params

- `?density=N` (1–8) — densidade da malha barycentric. Default 5 (~11k pontos). Mobile mid-range pode usar 3.

---

## Performance

- Alvo: 60fps em laptop médio (M1/Ryzen mobile). 30fps mínimo em mobile.
- Canvas com `devicePixelRatio` clampado a 2.
- WebGL2 single GL context — pontos vão pra FBO quando glitch>0 (sem upload), senão direto pro default framebuffer (path rápido).
- Quando glitch=0 ou recording=off, o post pass é pulado completamente.
- Quando recording, glitch path é forçado pra que o canvas final contenha o composite (pontos + HUD canvas2D), capturado pelo MediaRecorder.

---

## Privacidade

Nada sai do navegador. Sem upload, sem fetch externo durante a sessão (após carregar modelo+WASM). Mic só é solicitado quando usuário clica REC. O `.mp4`/`.webm` é baixado direto do navegador.

---

## Dev

- `index.html` é a entrada. Tudo é arquivo estático — abre via servidor local (Python `http.server` ou qualquer outro).
- Para testar **mobile na LAN**: `getUserMedia` exige HTTPS fora de localhost. Usar `.dev-https.py` (gitignored) com cert auto-assinado, ou tunnel tipo cloudflared.
- GitHub Pages serve com HTTPS válido — funciona direto sem setup adicional.
