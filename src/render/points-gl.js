// points-gl.js — WebGL2 renderer com curl noise 3D no vertex shader.
// Single draw call, all transforms + 3 octaves of curl on GPU.

const SIMPLEX = `
// 3D simplex noise — Stefan Gustavson, public domain
vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289v4(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289v4(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289v3(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 xx=x_*ns.x+ns.yyyy;
  vec4 yy=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(xx)-abs(yy);
  vec4 b0=vec4(xx.xy,yy.xy);
  vec4 b1=vec4(xx.zw,yy.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 snoiseVec3(vec3 p){
  return vec3(snoise(p), snoise(p+vec3(17.7,31.3,53.9)), snoise(p+vec3(-19.1,7.3,-41.7)));
}
vec3 curl(vec3 p){
  const float e = 0.1;
  vec3 dx=vec3(e,0,0); vec3 dy=vec3(0,e,0); vec3 dz=vec3(0,0,e);
  vec3 px0=snoiseVec3(p-dx), px1=snoiseVec3(p+dx);
  vec3 py0=snoiseVec3(p-dy), py1=snoiseVec3(p+dy);
  vec3 pz0=snoiseVec3(p-dz), pz1=snoiseVec3(p+dz);
  float x = (py1.z - py0.z) - (pz1.y - pz0.y);
  float y = (pz1.x - pz0.x) - (px1.z - px0.z);
  float z = (px1.y - px0.y) - (py1.x - py0.x);
  return vec3(x,y,z) / (2.0*e);
}
`;

const VS = `#version 300 es
precision highp float;
in vec3 a_pos;            // [0,1] x, y normalized; z relative

uniform vec2 u_canvas;     // (cw, ch)
uniform vec4 u_rect;       // (dx, dy, dw, dh)
uniform float u_time;
uniform float u_size;

out float v_light;

uniform vec4 u_oct;        // (size, speed, amp, mix)
uniform float u_centerWeak;
uniform vec3 u_faceCtr3;
uniform float u_faceSize;
uniform vec2 u_features[6]; // head-local: leftEye, rightEye, nose, mouthL, mouthR, mouthC
uniform float u_lightRadius; // raio de meia-intensidade em head-local
uniform float u_disintAmount;
uniform float u_disintRate;
uniform float u_disintDistance;
uniform float u_disintDuty;
uniform vec3  u_disintDrift;
uniform float u_echoSpacing;
uniform float u_numEchoes;

${SIMPLEX}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// Curl noise puro — sem envelope temporal, sem pulso. O "sai e volta" vem
// naturalmente do campo de curl rotacionando ao longo do tempo.
vec3 solarDisp(vec3 pLocal, vec4 oct) {
  vec3 q = pLocal * oct.x + vec3(0.0, 0.0, u_time * oct.y);
  vec3 c = curl(q);

  // MIX = cutoff: top "mix" mais forte do curl passa em plena intensidade
  float strength = clamp(length(c) * 0.5, 0.0, 1.0);
  float thr = mix(1.05, -0.05, oct.w);
  float gate = smoothstep(thr - 0.04, thr + 0.04, strength);

  return c * oct.z * gate;
}

void main() {
  vec3 p3 = a_pos;

  // Head-local: centra na cabeça e normaliza pelo tamanho. Noise fica preso ao rosto.
  vec3 pLocal = (p3 - u_faceCtr3) / max(u_faceSize, 0.001);

  // Peso por features: distância mínima aos landmarks reais (olhos, nariz, boca)
  // em head-local. No centro de cada feature → 0; longe → 1.
  vec2 lp = pLocal.xy;
  float dFeat = 999.0;
  for (int i = 0; i < 6; i++) {
    dFeat = min(dFeat, length(lp - u_features[i]));
  }
  // u_centerWeak controla o RAIO da zona protegida (0=sem máscara, 1=máscara grande).
  float r = mix(0.02, 0.20, u_centerWeak);
  float centerMul = smoothstep(r * 0.3, r, dFeat);

  vec3 disp = solarDisp(pLocal, u_oct);
  disp *= centerMul;

  // === DESINTEGRATION ===
  // 1) Regiões: ruído espacial 3D lento. Pedaços do rosto inteiros se ativam.
  //    Conforme o ruído drifta no tempo, regiões mudam, criando "ondas".
  vec3 regCoord = pLocal * 1.5 + vec3(0.0, 0.0, u_time * 0.10);
  float regionN = 0.5 + 0.5 * snoise(regCoord);

  // 2) Pulso global on/off lento — momentos de calma e momentos de erupção
  float pulse = smoothstep(0.35, 0.65, 0.5 + 0.5 * snoise(vec3(u_time * 0.06, 51.3, -7.7)));

  float thr = 1.0 - u_disintAmount;
  float isOn = smoothstep(thr - 0.06, thr + 0.06, regionN) * pulse;

  // 3) Trail via instanced rendering: instance 0 = atual; >0 = passado
  float echoIdx = float(gl_InstanceID);
  float echoShiftPhase = echoIdx * u_echoSpacing;
  float pointHash = hash13(a_pos);
  float phase = fract(u_time * u_disintRate + pointHash * 0.9 - echoShiftPhase);
  float duty = max(u_disintDuty, 0.001);
  float inFlight = step(phase, duty);
  float t = clamp(phase / duty, 0.0, 1.0);

  vec3 radial = pLocal / max(length(pLocal), 0.001);
  vec3 dirD = normalize(radial + u_disintDrift);
  float travel = t * t;  // ease-in: sai devagar, acelera
  vec3 disintDisp = dirD * (travel * u_disintDistance) * isOn * inFlight;

  vec3 pn = a_pos + disp + disintDisp;

  // Iluminação: luz fixa na frente do rosto (head-local z negativo).
  // u_lightRadius controla o RAIO de meia-intensidade (na distância = radius,
  // brilho cai pra 50%). Menor radius = feixe mais estreito.
  vec3 lightPos = vec3(0.0, -0.05, -0.55);
  float dLight = length(pLocal - lightPos);
  float falloffK = 1.0 / max(u_lightRadius * u_lightRadius, 0.0001);
  float localLight = 1.0 / (1.0 + falloffK * dLight * dLight);
  float globalLight = clamp(u_faceSize / 0.35, 0.25, 1.5);
  v_light = clamp(localLight * globalLight, 0.0, 1.0);
  // Fade no final do voo + taper de eco (instance 0 cheio, ecos vão sumindo)
  float fadeFactor = 1.0 - smoothstep(0.55, 1.0, t);
  v_light *= mix(1.0, fadeFactor, isOn * inFlight);
  float echoFactor = 1.0 - echoIdx / max(u_numEchoes - 1.0, 1.0);
  float echoAlphaTaper = pow(echoFactor, 1.6);
  v_light *= mix(1.0, echoAlphaTaper, isOn * inFlight);

  // Projeção: escala REAL da câmera, mirror horizontal, sem zoom-into-face.
  float xc = u_rect.x + pn.x * u_rect.z;
  float yc = u_rect.y + pn.y * u_rect.w;
  float xs = u_canvas.x - xc;
  float ys = yc;
  float nx = (xs / u_canvas.x) * 2.0 - 1.0;
  float ny = -((ys / u_canvas.y) * 2.0 - 1.0);

  gl_Position = vec4(nx, ny, pn.z, 1.0);
  // Echoes encolhem um pouco; instance 0 fica no tamanho normal
  float echoSizeTaper = mix(0.55, 1.0, pow(echoFactor, 0.6));
  gl_PointSize = u_size * mix(1.0, echoSizeTaper, isOn * inFlight);
}`;

const FS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
in float v_light;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  outColor = vec4(u_color.rgb * v_light, u_color.a * v_light);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("SHADER: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

export function createPointsRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    desynchronized: true,
  });
  if (!gl) throw new Error("NO WEBGL2");

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("LINK: " + gl.getProgramInfoLog(program));
  }

  const aPos = gl.getAttribLocation(program, "a_pos");
  const u = {
    canvas: gl.getUniformLocation(program, "u_canvas"),
    rect: gl.getUniformLocation(program, "u_rect"),
    time: gl.getUniformLocation(program, "u_time"),
    size: gl.getUniformLocation(program, "u_size"),
    color: gl.getUniformLocation(program, "u_color"),
    oct: gl.getUniformLocation(program, "u_oct"),
    centerWeak: gl.getUniformLocation(program, "u_centerWeak"),
    faceCtr3: gl.getUniformLocation(program, "u_faceCtr3"),
    faceSize: gl.getUniformLocation(program, "u_faceSize"),
    features: gl.getUniformLocation(program, "u_features[0]"),
    lightRadius: gl.getUniformLocation(program, "u_lightRadius"),
    disintAmount: gl.getUniformLocation(program, "u_disintAmount"),
    disintRate: gl.getUniformLocation(program, "u_disintRate"),
    disintDistance: gl.getUniformLocation(program, "u_disintDistance"),
    disintDuty: gl.getUniformLocation(program, "u_disintDuty"),
    disintDrift: gl.getUniformLocation(program, "u_disintDrift"),
    echoSpacing: gl.getUniformLocation(program, "u_echoSpacing"),
    numEchoes: gl.getUniformLocation(program, "u_numEchoes"),
  };

  const NUM_ECHOES = 5;
  const ECHO_SPACING = 0.018;

  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // ============================================================
  // POST-PROCESS (glitch) — vive no MESMO GL context dos pontos.
  // Pontos podem ir pra FBO; post sample FBO + HUD canvas e escreve
  // no default framebuffer. Sem upload extra do canvas dos pontos.
  // ============================================================

  const POST_VS = `#version 300 es
  precision highp float;
  in vec2 a_qpos;
  out vec2 v_uv;
  void main() {
    v_uv = a_qpos * 0.5 + 0.5;
    gl_Position = vec4(a_qpos, 0.0, 1.0);
  }`;

  const POST_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_a;       // pontos (FBO)
  uniform sampler2D u_b;       // HUD canvas2D
  uniform float u_time;
  uniform float u_amount;
  uniform vec2 u_resolution;
  out vec4 outColor;

  float hash(float x){return fract(sin(x*17.7)*43758.5453);}
  float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}

  vec3 sampleAt(vec2 uv){
    vec4 a = texture(u_a, uv);
    vec4 b = texture(u_b, uv);
    vec3 ablack = a.rgb * a.a;
    return b.rgb * b.a + ablack * (1.0 - b.a);
  }

  void main(){
    vec2 uv = v_uv;
    float amt = u_amount;

    float row = floor(uv.y * 240.0);
    float jStrong = step(0.85, hash(row + floor(u_time * 6.0))) * amt;
    float jitter = (hash(row * 1.13 + u_time * 1.7) - 0.5) * 0.06 * (amt + jStrong);
    float chroma = 0.012 * amt + 0.004 * hash(u_time * 12.0) * amt;

    vec2 dR = vec2(jitter + chroma, 0.0);
    vec2 dG = vec2(jitter, 0.0);
    vec2 dB = vec2(jitter - chroma, 0.0);

    vec3 colR = sampleAt(uv + dR);
    vec3 colG = sampleAt(uv + dG);
    vec3 colB = sampleAt(uv + dB);
    vec3 color = vec3(colR.r, colG.g, colB.b);

    float scan = 0.85 + 0.15 * sin(uv.y * u_resolution.y * 1.5);
    color *= mix(1.0, scan, amt * 0.6);

    float bandUV = fract(uv.y - u_time * 0.18);
    float bandHash = hash2(vec2(floor(bandUV * 26.0), floor(u_time * 4.0)));
    float band = step(0.93, bandHash) * amt * 0.45;
    color += band * vec3(0.95, 1.0, 1.0);

    float strobe = step(0.97, hash(u_time * 28.0)) * amt * 0.5;
    color += strobe;

    float desat = step(0.92, hash(u_time * 9.0)) * amt * 0.4;
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(lum), desat);

    outColor = vec4(color, 1.0);
  }`;

  const postProgram = gl.createProgram();
  gl.attachShader(postProgram, compile(gl, gl.VERTEX_SHADER, POST_VS));
  gl.attachShader(postProgram, compile(gl, gl.FRAGMENT_SHADER, POST_FS));
  gl.linkProgram(postProgram);
  if (!gl.getProgramParameter(postProgram, gl.LINK_STATUS)) {
    throw new Error("POST LINK: " + gl.getProgramInfoLog(postProgram));
  }
  const aQPos = gl.getAttribLocation(postProgram, "a_qpos");
  const pu = {
    a: gl.getUniformLocation(postProgram, "u_a"),
    b: gl.getUniformLocation(postProgram, "u_b"),
    time: gl.getUniformLocation(postProgram, "u_time"),
    amount: gl.getUniformLocation(postProgram, "u_amount"),
    resolution: gl.getUniformLocation(postProgram, "u_resolution"),
  };
  const qVao = gl.createVertexArray();
  const qBuf = gl.createBuffer();
  gl.bindVertexArray(qVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, qBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aQPos);
  gl.vertexAttribPointer(aQPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // FBO + textura colorida
  let fbo = gl.createFramebuffer();
  let colorTex = gl.createTexture();
  let fboW = 0, fboH = 0;
  function ensureFBO(w, h) {
    if (w === fboW && h === fboH) return;
    fboW = w; fboH = h;
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Textura do HUD (canvas2D upload)
  const hudTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, hudTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      ensureFBO(w, h);
    },
    clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    // glitchAmount=0 → pontos vão direto pro canvas (path rápido, HUD via DOM stacking).
    // glitchAmount>0 → pontos vão pra FBO; post sample FBO + HUD upload, glitcha, escreve no canvas.
    draw(positions, count, opts, hudCanvas, glitchAmount, time) {
      const w = canvas.width, h = canvas.height;
      const useFBO = glitchAmount > 0.001;

      // 1) Renderiza pontos
      gl.bindFramebuffer(gl.FRAMEBUFFER, useFBO ? fbo : null);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (count > 0) {
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.uniform2f(u.canvas, opts.canvasW, opts.canvasH);
        gl.uniform4f(u.rect, opts.dx, opts.dy, opts.dw, opts.dh);
        gl.uniform1f(u.time, opts.time);
        gl.uniform1f(u.size, opts.size);
        gl.uniform4fv(u.color, opts.color);
        gl.uniform4fv(u.oct, opts.oct);
        gl.uniform1f(u.centerWeak, opts.centerWeak);
        gl.uniform3f(u.faceCtr3, opts.faceCtr3[0], opts.faceCtr3[1], opts.faceCtr3[2]);
        gl.uniform1f(u.faceSize, opts.faceSize);
        gl.uniform2fv(u.features, opts.features);
        gl.uniform1f(u.lightRadius, opts.lightRadius);
        gl.uniform1f(u.disintAmount, opts.disintAmount);
        gl.uniform1f(u.disintRate, opts.disintRate);
        gl.uniform1f(u.disintDistance, opts.disintDistance);
        gl.uniform1f(u.disintDuty, opts.disintDuty);
        gl.uniform3f(u.disintDrift, opts.disintDrift[0], opts.disintDrift[1], opts.disintDrift[2]);
        gl.uniform1f(u.echoSpacing, ECHO_SPACING);
        gl.uniform1f(u.numEchoes, NUM_ECHOES);
        gl.drawArraysInstanced(gl.POINTS, 0, count, NUM_ECHOES);
        gl.bindVertexArray(null);
      }

      // 2) Pós-processamento se glitch ativo
      if (useFBO) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.BLEND);

        // Upload do HUD (única textura uploaded por frame)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, hudTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hudCanvas);

        // FBO color como textura 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, colorTex);

        gl.useProgram(postProgram);
        gl.uniform1i(pu.a, 0);
        gl.uniform1i(pu.b, 1);
        gl.uniform1f(pu.time, time);
        gl.uniform1f(pu.amount, glitchAmount);
        gl.uniform2f(pu.resolution, w, h);
        gl.bindVertexArray(qVao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);

        gl.enable(gl.BLEND);
      }
    },
  };
}
