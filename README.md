# data.self

> Uma versão sua em ponto, dado e glitch.

Web art interativa, client-side. Webcam vira nuvem de pontos densa do seu rosto em WebGL2, com curl noise, desintegração, iluminação, RGB glitch, HUD sci-fi e gravação em 1080p.

**[Abrir →](https://fazolin.github.io/data.self/)**

---

## O que é

Você liga a câmera. O MediaPipe FaceLandmarker detecta seu rosto a 60fps. Cada um dos 478 landmarks 3D vira semente pra uma malha de ~11.000 pontos, renderizada em WebGL2 com curl noise por baixo, regiões se desintegrando em câmera lenta, iluminação volumétrica, e camadas de glitch HUD em volta — linhas, blocos 8-bit, painéis sci-fi com coordenadas X/Y/Z. Tudo controlável por um painel debug, gravável em 1080p com áudio do microfone.

Roda em qualquer navegador moderno com WebGL2 e câmera. Mobile incluso.

## Privacidade

Nada sai do navegador. Sem upload. Sem analytics. Sem servidor — só HTML/CSS/JS estático. O modelo do MediaPipe baixa uma vez do Google (~3.6MB), depois fica em cache. O `.mp4`/`.webm` gerado é baixado direto.

## Como funciona

| Camada | Stack |
|---|---|
| **Detecção facial** | MediaPipe Tasks Vision · `FaceLandmarker` modo VIDEO · GPU delegate |
| **Nuvem de pontos** | WebGL2 · subdivisão barycentric da tessellation · ~11k vértices únicos |
| **Movimento** | Curl noise 3D no vertex shader (Stefan Gustavson simplex) |
| **Desintegração** | Regiões com noise espacial · lifecycle individual · trails via instanced rendering (5 ecos) |
| **Iluminação** | Luz fixa em head-local space · falloff inverso quadrático · global scaling por tamanho do rosto |
| **Glitch** | RGB shift · scanlines · tape bands · strobe · desat · post-process WebGL2 |
| **HUD sci-fi** | Painéis DOM com lazy-follow · linhas conectoras canvas2D · glitch squares 8-bit |
| **Gravação** | MediaRecorder · 1080p · captura mic · auto-stop em 30s |

## Controles

- **`D`** — abre/fecha painel debug
- Botão **DEBUG** — mesmo, pra mobile
- Botão **REC** — grava até 30s, baixa automaticamente
- URL param **`?density=N`** (1–8) — densidade da malha (default 5)

## Rodando local

```bash
# Qualquer servidor estático funciona
python -m http.server 5173
# → http://localhost:5173/
```

Pra testar **no celular pela LAN**: `getUserMedia` exige HTTPS fora de localhost. Use cloudflared / mkcert / ngrok pra subir HTTPS, ou simplesmente abra a [URL pública do GitHub Pages](https://fazolin.github.io/data.self/) (já tem HTTPS válido).

## Browsers

- ✅ Chrome / Edge / Firefox (desktop + Android)
- ✅ Safari iOS 16+ / iPadOS 16+
- ⚠️ Safari mais antigo: sem WebGL2 ou MediaRecorder, a tela `INCOMPATÍVEL` aparece

## Performance

- 60fps alvo (laptop médio M1/Ryzen mobile)
- 30fps mínimo em mobile mid-range
- Adaptive: resolução de câmera escolhida por device tier; canvas DPR clampado a 2; pontos podem reduzir via `?density=`

## Estrutura

```
index.html
styles/interface.css
src/
  main.js                  # bootstrap, state machine, render loop
  pipeline/
    camera.js              # getUserMedia adaptativo
    face.js                # FaceLandmarker + fetch do modelo com progresso real
  render/
    points-gl.js           # WebGL2 — pontos + curl + disint + light + post glitch
    glitch-lines.js        # linhas horizontais saindo do FACE_OVAL
    glitch-squares.js      # tiras 8-bit (8 cells)
  ui/
    hud.js                 # STATE / FPS
    terminal.js            # log com timestamps
    tracking-panels.js     # painéis DOM sci-fi com X/Y/Z
    recorder.js            # MediaRecorder + canvas offscreen 1080p
```

## Design-system

Interface segue o sistema visual do [fazolin/design-system](https://github.com/fazolin/design-system):

- 4 cores: void · signal · mesh · corrupt
- Oswald 700 (display) + JetBrains Mono 500 (HUD)
- Sem gradientes, sem border-radius, sem blur, sem easing curvado

O **interior da obra** (canvas WebGL2) pode quebrar qualquer regra — é o espaço da imagem, não da interface.

---

[fazolin.com](https://fazolin.com)
