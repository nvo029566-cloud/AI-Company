// Bộ vẽ WebGL2 gọn: vẽ hàng loạt (instancing) các khối đơn giản, ánh sáng bán cầu + mặt trời, đổ bóng mềm.
import { mat4, v3 } from './math.js';

const FLOATS = 24;            // mỗi khối: 16 số ma trận + 4 số màu (rgb + phát sáng) + 4 số toạ độ ảnh
const STRIDE = FLOATS * 4;

/* ---------- lưới hình cơ bản (thuần dữ liệu, kiểm thử được ngoài trình duyệt) ---------- */
function fixWinding(m) {                       // đảm bảo mặt trước quay ra ngoài
  const { pos, nor, idx } = m;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const n = v3.cross(e1, e2);
    const avg = [nor[a] + nor[b] + nor[c], nor[a + 1] + nor[b + 1] + nor[c + 1], nor[a + 2] + nor[b + 2] + nor[c + 2]];
    if (v3.dot(n, avg) < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  return m;
}
function build(pos, nor, uv, idx) { return fixWinding({ pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint16Array(idx) }); }

export function buildMeshes() {
  // Hộp đơn vị, tâm ở gốc
  const faces = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  const bp = [], bn = [], bu = [], bi = [];
  faces.forEach(([n, u, v], f) => {
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], k) => {
      bp.push(n[0] * .5 + u[0] * a * .5 + v[0] * b * .5, n[1] * .5 + u[1] * a * .5 + v[1] * b * .5, n[2] * .5 + u[2] * a * .5 + v[2] * b * .5);
      bn.push(...n); bu.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 1);
    });
    const o = f * 4; bi.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const box = build(bp, bn, bu, bi);

  // Trụ đứng bán kính 0.5, cao 1
  const seg = 48, cp = [], cn = [], cu = [], ci = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, x = Math.cos(a) * .5, z = Math.sin(a) * .5;
    cp.push(x, -.5, z, x, .5, z); cn.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 0, Math.sin(a)); cu.push(i / seg, 0, i / seg, 1);
  }
  for (let i = 0; i < seg; i++) { const o = i * 2; ci.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  for (const [y, ny] of [[.5, 1], [-.5, -1]]) {
    const c0 = cp.length / 3; cp.push(0, y, 0); cn.push(0, ny, 0); cu.push(.5, .5);
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; cp.push(Math.cos(a) * .5, y, Math.sin(a) * .5); cn.push(0, ny, 0); cu.push(.5, .5); }
    for (let i = 0; i < seg; i++) ci.push(c0, c0 + 1 + i, c0 + 2 + i);
  }
  const cyl = build(cp, cn, cu, ci);

  // Cầu bán kính 0.5
  const la = 10, lo = 16, sp = [], sn = [], su = [], si = [];
  for (let i = 0; i <= la; i++) for (let j = 0; j <= lo; j++) {
    const t = i / la * Math.PI, p = j / lo * Math.PI * 2;
    const x = Math.sin(t) * Math.cos(p), y = Math.cos(t), z = Math.sin(t) * Math.sin(p);
    sp.push(x * .5, y * .5, z * .5); sn.push(x, y, z); su.push(j / lo, i / la);
  }
  for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a = i * (lo + 1) + j, b = a + lo + 1; si.push(a, b, a + 1, b, b + 1, a + 1); }
  const sph = build(sp, sn, su, si);

  // Tấm phẳng 1x1 nhìn về +z
  const quad = build([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 2, 0, 2, 3]);
  return { box, cyl, sph, quad };
}

/* ---------- lô khối (instance) ---------- */
export class Batch {
  constructor(cap = 256) { this.data = new Float32Array(cap * FLOATS); this.n = 0; this.cap = cap; }
  clear() { this.n = 0; }
  add(m, r, g, b, e, uv) {
    if (this.n >= this.cap) { this.cap *= 2; const d = new Float32Array(this.cap * FLOATS); d.set(this.data); this.data = d; }
    const o = this.n++ * FLOATS, d = this.data;
    for (let i = 0; i < 16; i++) d[o + i] = m[i];
    d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = e;
    d[o + 20] = uv[0]; d[o + 21] = uv[1]; d[o + 22] = uv[2]; d[o + 23] = uv[3];
  }
}
export class Layer {
  // mark: đánh dấu điểm ảnh người nhìn thấy (stencil); ghost: chỉ vẽ ở lượt "nhìn xuyên tường" (tint, alpha: màu và độ đậm của bóng);
  // glow: lớp phát sáng/đánh dấu vẽ sau cùng, blend 'add' (cộng ánh sáng, cho ban đêm) hoặc 'alpha' (phủ màu trong suốt); kênh "phát sáng" của vật thể là độ trong suốt
  constructor(cap = 256) { this.box = new Batch(cap); this.cyl = new Batch(cap); this.sph = new Batch(cap); this.quad = new Batch(32); }
  clear() { this.box.clear(); this.cyl.clear(); this.sph.clear(); this.quad.clear(); }
  count() { return this.box.n + this.cyl.n + this.sph.n + this.quad.n; }
}

/* ---------- shader ---------- */
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUv;
layout(location=3) in vec4 iM0; layout(location=4) in vec4 iM1; layout(location=5) in vec4 iM2; layout(location=6) in vec4 iM3;
layout(location=7) in vec4 iColor; layout(location=8) in vec4 iUv;
uniform mat4 uVP; uniform mat4 uLVP;
out vec3 vN; out vec4 vColor; out vec2 vUv; out vec4 vRect; out vec4 vSh; out vec3 vW;
void main(){
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vec4 w = M * vec4(aPos, 1.0);
  vW = w.xyz; vColor = iColor; vUv = aUv; vRect = iUv;
  vN = normalize(transpose(inverse(mat3(M))) * aNor);
  vSh = uLVP * w;
  gl_Position = uVP * w;
}`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec4 vColor; in vec2 vUv; in vec4 vRect; in vec4 vSh; in vec3 vW;
uniform sampler2D uTex; uniform sampler2DShadow uShadow;
uniform vec3 uLight; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uFog; uniform float uFogK;
uniform vec3 uEye; uniform float uShadowOn; uniform float uTexel; uniform float uXray; uniform vec3 uXTint; uniform float uXAlpha;
out vec4 o;
float shadowAt(vec3 n){
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = vSh.xyz / vSh.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float ndl = max(dot(n, uLight), 0.0);
  float bias = 0.0004 + 0.0012 * (1.0 - ndl);
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    s += texture(uShadow, vec3(p.xy + vec2(float(x), float(y)) * uTexel * 1.4, p.z - bias));
  return s / 9.0;
}
void main(){
  vec3 N = normalize(vN);
  vec3 base = vColor.rgb;
  if (vRect.z > 0.0) base = texture(uTex, vRect.xy + vUv * vRect.zw).rgb;
  if (uXray > 1.5) { o = vec4(vColor.rgb, vColor.a); return; }                      // lớp phát sáng/đánh dấu: kênh thứ tư là độ trong suốt
  if (uXray > 0.5) { o = vec4(mix(base, uXTint, 0.45), uXAlpha); return; }          // bóng mờ khi bị tường che
  float ndl = max(dot(N, uLight), 0.0);
  float sh = shadowAt(N);
  vec3 amb = mix(uGround, uSky, N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + uSun * ndl * sh);
  vec3 col = mix(lit, base, vColor.a);
  float d = length(uEye - vW);
  col = mix(col, uFog, clamp((d - 40.0) * uFogK, 0.0, 0.55));
  o = vec4(col, 1.0);
}`;
const SVS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=3) in vec4 iM0; layout(location=4) in vec4 iM1; layout(location=5) in vec4 iM2; layout(location=6) in vec4 iM3;
uniform mat4 uLVP;
void main(){ gl_Position = uLVP * (mat4(iM0, iM1, iM2, iM3) * vec4(aPos, 1.0)); }`;
const SFS = `#version 300 es
precision mediump float;
void main(){}`;

export function createEngine(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  if (!gl) throw new Error('Trình duyệt chưa hỗ trợ WebGL2.');
  const SS = opts.shadowSize || 2048;

  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Lỗi shader: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const program = (vs, fs) => {
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Lỗi liên kết shader: ' + gl.getProgramInfoLog(p));
    return p;
  };
  const prog = program(VS, FS), sprog = program(SVS, SFS);
  const U = {}; for (const n of ['uVP', 'uLVP', 'uTex', 'uShadow', 'uLight', 'uSun', 'uSky', 'uGround', 'uFog', 'uFogK', 'uEye', 'uShadowOn', 'uTexel', 'uXray', 'uXTint', 'uXAlpha']) U[n] = gl.getUniformLocation(prog, n);
  const SU = gl.getUniformLocation(sprog, 'uLVP');

  // Lưới hình dùng chung
  const meshes = buildMeshes(), gpu = {};
  for (const [name, m] of Object.entries(meshes)) {
    const n = m.pos.length / 3, inter = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) { inter.set(m.pos.subarray(i * 3, i * 3 + 3), i * 8); inter.set(m.nor.subarray(i * 3, i * 3 + 3), i * 8 + 3); inter.set(m.uv.subarray(i * 2, i * 2 + 2), i * 8 + 6); }
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    gpu[name] = { vbo, ibo, count: m.idx.length };
  }
  const bindLayer = layer => {                         // tạo bộ đệm + VAO cho từng lô của lớp
    layer.gl = {};
    for (const name of Object.keys(meshes)) {
      const buf = gl.createBuffer(), vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gpu[name].vbo);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu[name].ibo);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(3 + i); gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, STRIDE, i * 16); gl.vertexAttribDivisor(3 + i, 1); }
      gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 4, gl.FLOAT, false, STRIDE, 64); gl.vertexAttribDivisor(7, 1);
      gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 4, gl.FLOAT, false, STRIDE, 80); gl.vertexAttribDivisor(8, 1);
      layer.gl[name] = { buf, vao };
    }
    gl.bindVertexArray(null);
  };
  const upload = layer => {
    if (!layer.gl) bindLayer(layer);
    for (const name of Object.keys(meshes)) {
      const b = layer[name]; gl.bindBuffer(gl.ARRAY_BUFFER, layer.gl[name].buf);
      gl.bufferData(gl.ARRAY_BUFFER, b.data.subarray(0, Math.max(1, b.n) * FLOATS), gl.DYNAMIC_DRAW);
    }
  };
  const draw = (layer, skipQuad) => {
    for (const name of Object.keys(meshes)) {
      if (skipQuad && name === 'quad') continue;
      const b = layer[name]; if (!b.n) continue;
      gl.bindVertexArray(layer.gl[name].vao);
      gl.drawElementsInstanced(gl.TRIANGLES, gpu[name].count, gl.UNSIGNED_SHORT, 0, b.n);
    }
  };

  // Bản đồ bóng
  const depth = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, depth);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SS, SS, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  const fboOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const atlas = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlas);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  const lvp = mat4.create();
  const api = {
    gl, fboOk, meshes, bindLayer, upload,
    setAtlas(src) {
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const an = gl.getExtension('EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    },
    // Ma trận ánh sáng bao trọn khối cảnh [min, max] theo hướng ánh sáng (hướng TỚI nguồn sáng).
    fitLight(dir, min, max) {
      const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], R = v3.len(v3.sub(max, min)) / 2;
      const eye = v3.add(c, v3.scale(v3.norm(dir), R * 2)), view = mat4.create();
      mat4.lookAt(view, eye, c, Math.abs(dir[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]);
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
        const p = mat4.transform(view, [x, y, z]);
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
      }
      const proj = mat4.create();
      mat4.ortho(proj, lo[0], hi[0], lo[1], hi[1], -hi[2] - 2, -lo[2] + 2);
      mat4.mul(lvp, proj, view);
    },
    resize(w, h) { canvas.width = w; canvas.height = h; },
    // Vẽ một khung hình. f: { vp, eye, light, sun, sky, ground, fog, fogK, bg, shadows, layers: [Layer...] }
    render(f) {
      for (const L of f.layers) if (L.dynamic) upload(L);
      if (f.shadows && fboOk) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SS, SS);
        gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
        gl.useProgram(sprog); gl.uniformMatrix4fv(SU, false, lvp);
        for (const L of f.layers) if (!L.ghost && !L.glow) draw(L, true);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(f.bg[0], f.bg[1], f.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(U.uTex, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depth); gl.uniform1i(U.uShadow, 1);
      gl.uniformMatrix4fv(U.uVP, false, f.vp); gl.uniformMatrix4fv(U.uLVP, false, lvp);
      gl.uniform3fv(U.uLight, f.light); gl.uniform3fv(U.uSun, f.sun); gl.uniform3fv(U.uSky, f.sky); gl.uniform3fv(U.uGround, f.ground);
      gl.uniform3fv(U.uFog, f.fog); gl.uniform1f(U.uFogK, f.fogK); gl.uniform3fv(U.uEye, f.eye);
      gl.uniform1f(U.uShadowOn, f.shadows && fboOk ? 1 : 0); gl.uniform1f(U.uTexel, 1 / SS);
      gl.uniform1f(U.uXray, 0);
      gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); gl.enable(gl.STENCIL_TEST);
      for (const L of f.layers) {
        if (L.ghost || L.glow) continue;
        if (L.mark) { gl.stencilFunc(gl.ALWAYS, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); }
        else { gl.stencilFunc(gl.ALWAYS, 0, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); }
        draw(L, false);
      }
      const ghosts = f.layers.filter(L => L.ghost && L.count() > 0);
      if (ghosts.length) {                                          // lượt nhìn xuyên tường: chỉ vẽ phần bị che, trừ chỗ đã thấy người
        gl.uniform1f(U.uXray, 1);
        gl.stencilFunc(gl.NOTEQUAL, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.depthFunc(gl.GREATER); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        for (const L of ghosts) { gl.uniform3fv(U.uXTint, L.tint || [0.74, 0.9, 1.0]); gl.uniform1f(U.uXAlpha, L.alpha ?? 0.62); draw(L, false); }
        gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS); gl.uniform1f(U.uXray, 0);
      }
      gl.disable(gl.STENCIL_TEST);
      const glows = f.layers.filter(L => L.glow && L.count() > 0);
      if (glows.length) {                                           // lớp phát sáng: kiểm tra chiều sâu nhưng không ghi, để ánh sáng bị đồ vật phía trước che đúng
        gl.uniform1f(U.uXray, 2); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND);
        for (const L of glows) { gl.blendFunc(gl.SRC_ALPHA, L.blend === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); draw(L, false); }
        gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS); gl.uniform1f(U.uXray, 0);
      }
      gl.bindVertexArray(null);
    },
    error: () => gl.getError(),
    dispose() { const e = gl.getExtension('WEBGL_lose_context'); e?.loseContext(); }
  };
  return api;
}