# data.self — plano de trabalho

Cada etapa é um checkpoint visual. Não avança sem validação do autor.

---

## Etapa 0 — andaime (sem validação visual)

- [ ] `index.html` mínimo, fullscreen, paleta + fontes do design-system carregadas
- [ ] `interface.css` com tokens importados, reset, estado `idle` desenhado
- [ ] `main.js` com state machine vazia (idle → permission → loading → live)
- [ ] `camera.js` com `getUserMedia` + tratamento denied/error
- [ ] HUD básico (FPS, estado) no canto inferior direito, JetBrains Mono 10px

Saída: tela preta, wordmark `DATA.SELF`, CTA `[ INICIAR ]` que pede câmera e mostra o vídeo cru fullscreen com HUD.

---

## Etapa 1 — TRACKING POINTS cru ← começamos aqui

Pivot: descartado depth raster. FaceLandmarker (478) + PoseLandmarker (33) entregam pontos 3D direto, ~60fps.

- [x] MediaPipe Tasks Vision via CDN
- [x] FaceLandmarker + PoseLandmarker, runtime VIDEO, delegate GPU
- [x] Loading state com barra reta
- [x] Render cru: pontos brancos sobre fundo void, espelhado, aspecto da câmera preservado
- [x] HUD: STATE / FPS / RES / POINTS

🛑 **Entrego os pontos crus funcionando. Você decide o look.**

---

## Etapa 2 — POINT CLOUD 3D

- [ ] Migrar render pra WebGL2 (foundation pra shaders)
- [ ] Usar coordenadas Z dos landmarks (face: z relativo; pose: worldLandmarks em metros)
- [ ] Câmera 3D leve (orbit sutil / parallax do mouse / giro lento — decidir)
- [ ] Adensamento opcional: interpolação entre landmarks, geração de pontos extras pelo mesh facial (triangulação de FaceLandmarker)
- [ ] **Validação de look #2**: densidade, tamanho de ponto, com/sem perspectiva

🛑 Pausa para validação.

---

## Etapa 4 — GLITCH / DATAMOSH

- [ ] Buffer de frame anterior (ping-pong FBO)
- [ ] Deslocamento por motion vector / depth delta
- [ ] Cortes corrupt aleatórios (fx-flash, fx-jitter)
- [ ] Parametrizar intensidade no HUD (debug)
- [ ] **Validação de look #4**

🛑 Pausa para validação.

---

## Etapa 5 — ÁUDIO-REATIVO (opcional)

- [ ] `getUserMedia` audio + AnalyserNode
- [ ] FFT modula intensidade de glitch / point size / câmera
- [ ] **Validação de look #5**

🛑 Pausa.

---

## Etapa 6 — GRAVAÇÃO E ENTREGA

- [ ] MediaRecorder do canvas + áudio
- [ ] Botão `[ GRAVAR ]` → 10–30s → `[ BAIXAR .MOV ]`
- [ ] Conversão webm→mov via ffmpeg.wasm se Safari/QuickTime exigir
- [ ] Tela export final, créditos, link fazolin.com

🛑 Validação de UX completa.

---

## Etapa 7 — POLIMENTO & RESPONSIVIDADE

- [ ] QA em devices: desktop (Chrome/Firefox/Safari), iPad, iPhone (Safari ≥16), Android (Chrome)
- [ ] Portrait + landscape em todos os mobiles
- [ ] Safe-area insets validados em iPhone com notch
- [ ] Adaptive resolution / renderScale ajustado por tier de device
- [ ] Toggle câmera frontal/traseira em mobile
- [ ] Tela `INCOMPATÍVEL` para sem-WebGL2
- [ ] Estado denied/error refinado
- [ ] Performance pass final (30fps mínimo mobile, 60fps desktop)
- [ ] Easter eggs (se fizer sentido)

---

## Próxima ação

Etapa 1 entregue: tracking points crus (face + pose) fullscreen. Validar visual e definir direção pra Etapa 2.
