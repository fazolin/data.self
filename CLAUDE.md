# data.self

Obra interativa client-side. O usuário vira ponto, dado, glitch — uma versão de si mesmo em point cloud, capturada via webcam + MediaPipe, renderizada como `.mov` e entregue de volta.

---

## Stack

- **Vanilla**: HTML + CSS + JS (ES modules). Sem framework UI.
- **MediaPipe Tasks Vision** (CDN, WASM) — FaceLandmarker (478) + PoseLandmarker (33). Sem depth raster — landmarks 3D são a base da obra.
- **WebGL2** via shaders custom (sem three.js inicialmente; reavaliar quando point cloud subir).
- **MediaRecorder API** + ffmpeg.wasm (se necessário) para entregar `.mov`.
- **Tudo client-side**. Zero servidor. Zero analytics. Zero CDN além de fontes/MediaPipe.

---

## Regra de ouro (herdada de fazolin/design-system)

**Interface** (entrada, permissão, loading, erro, HUD, download, créditos) segue o design-system de forma estrita:
- Paleta: `--color-void #000`, `--color-signal #F0F0F0`, `--color-mesh #00FFFF`, `--color-corrupt #FF0033`. Nada fora disso.
- Tipografia: Oswald 700 (display) + JetBrains Mono 500 (HUD). Nenhuma outra fonte.
- Sem gradientes, sem border-radius >2px, sem blur decorativo, sem spinners, sem transições >120ms, sem easing curvado, sem libs de componente.

**Interior da obra** (canvas WebGL, depth, point cloud, datamosh, áudio-reativo) **pode quebrar qualquer regra**. Lá dentro vale o que a obra pedir.

A linha entre os dois é o `<canvas>`. Tudo fora dele = interface. Tudo dentro = obra.

---

## Tokens

Importar diretamente do design-system (sem cópia local até haver divergência intencional):

```css
@import url("https://raw.githubusercontent.com/fazolin/design-system/main/tokens/colors.css");
@import url("https://raw.githubusercontent.com/fazolin/design-system/main/tokens/typography.css");
@import url("https://raw.githubusercontent.com/fazolin/design-system/main/tokens/glitch.css");
```

Se algum import falhar em produção, copiar local em `/tokens/`.

---

## Estrutura

```
/index.html              # entrada única, fullscreen
/src/
  main.js                # bootstrap, permission flow, state machine
  pipeline/
    camera.js            # getUserMedia
    mediapipe.js         # depth + landmarks
    recorder.js          # MediaRecorder
  render/
    depth.frag/.vert     # shaders depth map (etapa 1)
    pointcloud.*         # etapa 2
    glitch.*             # etapa 3
  ui/
    hud.js               # overlay HUD
    states.js            # loading/error/denied
/styles/
  interface.css          # SOMENTE interface, segue design-system
/public/
  models/                # MediaPipe .task files (cache local opcional)
```

---

## Estados de interface (todos seguem design-system)

1. **idle** — wordmark `DATA.SELF`, CTA mono `[ INICIAR ]`
2. **permission** — texto mono pedindo câmera
3. **loading** — barra de progresso reta carregando modelo MediaPipe (sem spinner)
4. **denied** — mensagem corrupt `ACESSO NEGADO`
5. **live** — canvas ocupa tela, HUD mono nos cantos (FPS, status, fx flags)
6. **recording** — HUD com `REC` corrupt piscando (fx-flash)
7. **export** — preview + CTA `[ BAIXAR .MOV ]`

---

## Fluxo de validação

Cada etapa visual é uma obra de arte e precisa validação do autor antes da próxima.

Ordem:
1. **Depth map fullscreen** — webcam → MediaPipe depth → shader que mapeia profundidade na paleta da obra (livre). Validar look.
2. **Point cloud** — depth + RGB → vértices em WebGL2. Validar densidade, tamanho de ponto, comportamento.
3. **Tracking points** — overlay dos landmarks face/pose. Validar conexões/estética.
4. **Datamosh / glitch** — feedback de frame, deslocamento por motion vector. Validar.
5. **Áudio-reativo** (opcional) — microfone modula parâmetros. Validar.
6. **Gravação + entrega .mov** — MediaRecorder → blob → download.

Não pular etapas. Não acumular features sem validação.

---

## Performance & responsividade

Funciona em **qualquer device com câmera + WebGL2**: desktop, laptop, tablet, mobile (iOS Safari ≥16, Chrome Android, Firefox).

- Alvo: 60fps em laptop médio (M1 / Ryzen mobile); 30fps mínimo em mobile mid-range.
- Resolução de câmera adaptativa por device:
  - desktop: 1280×720
  - laptop: 960×540
  - mobile/tablet: 640×360
  - degradar automaticamente se fps < 24 por 2s
- Depth model: MediaPipe `depth-estimation` lite (escolher delegate `GPU` quando disponível, fallback `CPU`).
- Profile com `performance.now()` no HUD desde o início.

### Layout responsivo (interface)

- **Mobile-first**: tudo desenhado a partir de 360px de largura.
- Unidades: `dvh`/`dvw` (dynamic viewport) para evitar bug de barra de URL no iOS.
- Safe areas: `env(safe-area-inset-*)` em todo HUD/CTA para iPhone notch/Dynamic Island.
- Orientação: **portrait e landscape**. Em portrait mobile, câmera frontal vertical; em landscape, horizontal. Sem forçar rotação.
- Touch targets ≥44×44px. CTA principal cresce até 56px de altura em mobile.
- Tipografia fluida via `clamp()` em cima dos tokens (display: `clamp(40px, 10vw, 96px)`; HUD fixo 10–14px).
- Sem hover-only: todo estado interativo tem versão tap/press.
- Gestos: tap = iniciar/parar; long-press opcional para modos debug.
- Câmera: tentar `facingMode: "user"` por padrão; toggle frontal/traseira em mobile.
- Sem teclado: nenhuma feature crítica depende de keyboard. Atalhos só como bônus em desktop.

### Pipeline responsivo (interior)

- Canvas usa `devicePixelRatio` clampado a 2 (não renderizar 3x em telas Retina mobile — derruba GPU).
- Resolução de render desacoplada do tamanho de canvas: `renderScale` adaptativo (1.0 → 0.5) baseado em fps.
- Point cloud density adapta ao device tier (detectado por `navigator.hardwareConcurrency` + GPU probe inicial).

### Fallbacks

- **Sem WebGL2**: tela `INCOMPATÍVEL` em corrupt, link para fazolin.com.
- **Sem getUserMedia / câmera negada**: tela `denied`.
- **Browser muito antigo**: feature detection na entrada, mensagem clara.

---

## Privacidade

Nada sai do navegador. Sem upload, sem fetch externo durante a sessão (após carregar modelo). O `.mov` é gerado e baixado localmente. Mencionar isso na interface.
