// Panel GPU effect: "flowing waves" — deep ocean currents rolling beneath a
// dark surface, crested with cyan highlights, via a domain-warped fbm fragment
// shader. Opaque (no glassmorphism), cheap (quarter-res canvas, 30fps cap),
// and unmistakably SeedOcean. Same structure as SeedThree's sap-veins shader,
// retuned to a marine palette.

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT;
out vec4 o;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++){ s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 2.3;
  // domain warp: currents meander like swell refracted across a reef
  vec2 w = vec2(fbm(p + uT * 0.012), fbm(p + 5.2 - uT * 0.009));
  float v = fbm(p + 1.8 * w);
  // Wave crests — fatter flowing filaments plus broad cyan "swell" pooling
  // between them so the effect reads as moving water, not faint threads.
  float band = abs(fract(v * 4.0) - 0.5);
  float crest = smoothstep(0.030, 0.003, band - 0.462);          // fatter filaments
  float gate = smoothstep(0.40, 0.66, fbm(p * 0.9 + 13.0));      // more crests catch light
  float flow = 0.5 + 0.5 * sin(v * 30.0 - uT * 0.9);             // light traveling the swell
  float pool = smoothstep(0.55, 0.96, v) * gate;                 // broad cyan pools between crests
  // deep sea base, faint teal tinge — near-black blue, cyan rides on top
  vec3 deep = mix(vec3(0.012, 0.030, 0.055), vec3(0.020, 0.055, 0.094), fbm(p * 3.1));
  deep += vec3(0.004, 0.012, 0.020) * fbm(p * 1.3);
  // swell base: teal shifting toward bright cyan at the foam line
  vec3 teal = vec3(0.05, 0.30, 0.46);
  vec3 foam = mix(teal, vec3(0.37, 0.81, 0.95), flow * flow * 0.65);
  vec3 col = deep + pool * teal * 0.30 + crest * gate * foam * (0.32 + 0.62 * flow);
  col += 0.010 * fbm(p * 9.0); // fine ripple grain
  o = vec4(col, 1.0);
}`;

const VS = `#version 300 es
void main(){
  vec2 p = vec2[](vec2(-1,-1), vec2(3,-1), vec2(-1,3))[gl_VertexID];
  gl_Position = vec4(p, 0, 1);
}`;

export function mountPanelFX(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'so-fx';
  host.prepend(canvas);
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) { canvas.remove(); return; }

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uT = gl.getUniformLocation(prog, 'uT');

  const fit = () => {
    // quarter-res is plenty for soft waves — keeps the effect ~free
    const w = Math.max(2, Math.floor(host.clientWidth / 2));
    const ht = Math.max(2, Math.floor(host.clientHeight / 2));
    if (canvas.width !== w || canvas.height !== ht) {
      canvas.width = w;
      canvas.height = ht;
      gl.viewport(0, 0, w, ht);
    }
  };
  new ResizeObserver(fit).observe(host);

  let last = 0;
  const loop = (t) => {
    requestAnimationFrame(loop);
    if (t - last < 33) return; // 30fps cap
    last = t;
    fit();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uT, t / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  requestAnimationFrame(loop);
}
