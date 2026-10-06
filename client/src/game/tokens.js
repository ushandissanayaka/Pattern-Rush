// The six pattern objects (screenshots 66–78). Names live here only — rename freely.
// Faces are simple original drawings (eyes + smile / toothy grin / wink).
import * as THREE from 'three';

export const TOKENS = [
  { id: 'grin',    name: 'Grinner',       kind: 'ball', color: '#e8141f', face: 'grin' },   // red, toothy grin
  { id: 'gem',     name: 'Diamond Emoji', kind: 'gem',  color: '#7fd0ff' },
  { id: 'block',   name: 'Diamond Block', kind: 'block', color: '#3fd9d0' },
  { id: 'sunny',   name: 'Sunny',         kind: 'ball', color: '#f8e21a', face: 'smile' },  // yellow, smile
  { id: 'gloomy',  name: 'Gloomy',        kind: 'ball', color: '#1531e8', face: 'grin' },   // blue, toothy grin
  { id: 'winky',   name: 'Winky',         kind: 'ball', color: '#f01bd2', face: 'wink' }    // pink, wink
];
export const TOKEN = Object.fromEntries(TOKENS.map(t => [t.id, t]));
export const PATTERN_LENGTH = 9;
export const randomPattern = () => Array.from({ length: PATTERN_LENGTH }, () => TOKENS[Math.floor(Math.random() * TOKENS.length)].id);

/* ---------- 2D drawing (UI icons, code-bar cells, ball textures) ---------- */
function drawFace(g, face, cx, cy, r) {
  g.fillStyle = '#141414'; g.strokeStyle = '#141414'; g.lineCap = 'round';
  const ex = r * 0.3, ey = cy - r * 0.18, ew = r * 0.1, eh = r * 0.17;
  // eyes (wink: right eye closed)
  g.beginPath(); g.ellipse(cx - ex, ey, ew, eh, 0, 0, Math.PI * 2); g.fill();
  if (face === 'wink') { g.lineWidth = r * 0.07; g.beginPath(); g.arc(cx + ex, ey + eh * 0.4, ew * 1.4, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  else { g.beginPath(); g.ellipse(cx + ex, ey, ew, eh, 0, 0, Math.PI * 2); g.fill(); }
  if (face === 'grin') {
    // wide toothy grin: dark mouth, white teeth band, tooth lines
    const w = r * 0.62, y0 = cy + r * 0.12;
    g.beginPath(); g.moveTo(cx - w, y0); g.quadraticCurveTo(cx, y0 + r * 0.62, cx + w, y0); g.quadraticCurveTo(cx, y0 + r * 0.28, cx - w, y0); g.closePath(); g.fill();
    g.save(); g.clip();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(cx - w, y0); g.quadraticCurveTo(cx, y0 + r * 0.5, cx + w, y0); g.quadraticCurveTo(cx, y0 + r * 0.36, cx - w, y0); g.fill();
    g.strokeStyle = '#141414'; g.lineWidth = r * 0.03;
    for (let i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(cx + i * w / 6, y0); g.lineTo(cx + i * w / 6, y0 + r * 0.6); g.stroke(); }
    g.restore();
    g.lineWidth = r * 0.05; g.strokeStyle = '#141414';
    g.beginPath(); g.moveTo(cx - w, y0); g.quadraticCurveTo(cx, y0 + r * 0.62, cx + w, y0); g.stroke();
  } else {
    g.lineWidth = r * 0.075;
    g.beginPath(); g.arc(cx, cy + r * 0.02, r * 0.5, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
  }
}
function drawGem(g, cx, cy, s) {
  const w = s * 0.9, top = cy - s * 0.32, mid = cy - s * 0.08, bot = cy + s * 0.5;
  const facets = [['#bfe9ff', [cx - w / 2, mid, cx - w / 4, top, cx, mid]], ['#e6f7ff', [cx - w / 4, top, cx + w / 4, top, cx, mid]],
    ['#8fd3ff', [cx, mid, cx + w / 4, top, cx + w / 2, mid]], ['#4aa8f0', [cx - w / 2, mid, cx, mid, cx, bot]], ['#2c86d8', [cx, mid, cx + w / 2, mid, cx, bot]],
    ['#6fc0ff', [cx - w / 4, mid, cx + w / 4, mid, cx, bot]]];
  for (const [c, p] of facets) { g.fillStyle = c; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); g.lineTo(p[4], p[5]); g.closePath(); g.fill(); }
  g.strokeStyle = 'rgba(20,70,130,.5)'; g.lineWidth = s * 0.02;
  g.beginPath(); g.moveTo(cx - w / 2, mid); g.lineTo(cx + w / 2, mid); g.moveTo(cx - w / 2, mid); g.lineTo(cx, bot); g.lineTo(cx + w / 2, mid); g.stroke();
}
function drawBlock(g, x, y, s) {
  g.fillStyle = '#2bbfb6'; g.fillRect(x, y, s, s);
  const n = 8, c = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = ((i * 7 + j * 13) % 5) / 5;
    g.fillStyle = `rgba(${150 + v * 80},255,${235 + v * 20},${0.12 + v * 0.18})`; g.fillRect(x + i * c, y + j * c, c, c);
  }
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + c, y + c, c * 3, c * 0.8); g.fillRect(x + c, y + c, c * 0.8, c * 2);
}
/** Draw a token centred at (cx, cy) inside a square of size s. */
export function drawToken(g, id, cx, cy, s) {
  const t = TOKEN[id];
  if (t.kind === 'gem') return drawGem(g, cx, cy, s);
  if (t.kind === 'block') return drawBlock(g, cx - s * 0.42, cy - s * 0.42, s * 0.84);
  const r = s * 0.42;
  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.22, t.color); grad.addColorStop(1, t.color);
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  drawFace(g, t.face, cx, cy, r);
}
const iconCache = new Map();
export function tokenIcon(id) {
  if (!iconCache.has(id)) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    drawToken(c.getContext('2d'), id, 64, 64, 120);
    iconCache.set(id, c.toDataURL());
  }
  return iconCache.get(id);
}
/** Code-bar cell background for a revealed token (screenshots 70–78). */
export function drawBarCell(g, id, x, y, w, h) {
  const t = TOKEN[id];
  g.fillStyle = t.kind === 'gem' ? '#05080b' : t.kind === 'block' ? '#2bbfb6' : '#eef2f4';
  g.fillRect(x, y, w, h);
  if (t.kind === 'block') drawBlock(g, x, y, Math.min(w, h)); else drawToken(g, id, x + w / 2, y + h / 2, Math.min(w, h) * 1.05);
}

/* ---------- 3D meshes ---------- */
// Ball texture: the face is drawn flat on its own canvas, then projected onto the front
// of the sphere (orthographic decal) so it is not stretched like a world map.
const texCache = new Map();
function ballTexture(id) { const t = TOKEN[id]; return faceBallTexture(id, t.color, t.face); }
/** Sphere texture with a face on the front (+Z). `base` = colour or (g, w, h) => paint. */
export function faceBallTexture(key, base, faceKind = 'smile') {
  if (!texCache.has(key)) {
    const t = { color: typeof base === 'string' ? base : '#ffffff' };
    const face = document.createElement('canvas'); face.width = face.height = 512;
    const fg = face.getContext('2d'); drawFace(fg, faceKind, 256, 256, 250);
    const fd = fg.getImageData(0, 0, 512, 512).data;
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = t.color; g.fillRect(0, 0, W, H);
    if (typeof base === 'function') base(g, W, H);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let r = 0; r < H; r++) {
      const th = (r + 0.5) / H * Math.PI, st = Math.sin(th), y = Math.cos(th);
      for (let q = 0; q < W; q++) {
        const ph = (q + 0.5) / W * Math.PI * 2, x = -Math.cos(ph) * st, z = Math.sin(ph) * st;
        if (z < 0.15) continue;
        const fx = Math.floor((x * 0.5 + 0.5) * 511), fy = Math.floor((0.5 - y * 0.5) * 511);
        const k = (fy * 512 + fx) * 4, a = fd[k + 3] / 255;
        if (a < 0.02) continue;
        const o = (r * W + q) * 4;
        d[o] = d[o] * (1 - a) + fd[k] * a; d[o + 1] = d[o + 1] * (1 - a) + fd[k + 1] * a; d[o + 2] = d[o + 2] * (1 - a) + fd[k + 2] * a;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    texCache.set(key, tex);
  }
  return texCache.get(key);
}
// face only (transparent background) for the decal
function drawFaceOnly(g, face, cx, cy, r) { drawFace(g, face, cx, cy, r); }

let blockTex = null;
function blockTexture() {
  if (!blockTex) {
    // 16×16 pixel-art crystal block: teal body, lighter facets, white sparkles, dark rim
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
    const pal = ['#1fa79f', '#2bc7bd', '#4fe3d8', '#8ef5ee', '#d9fffb'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = ((x * 37 + y * 91 + x * y * 7) % 23) / 23;
      g.fillStyle = pal[Math.min(4, Math.floor(n * 3.2) + ((x + y) % 7 === 0 ? 1 : 0))]; g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#d9fffb'; [[3, 2], [4, 2], [2, 3], [11, 4], [12, 5], [5, 10], [6, 11], [12, 12]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
    g.fillStyle = '#148a83'; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
    g.fillStyle = '#6cefe6'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
    blockTex = new THREE.CanvasTexture(c); blockTex.colorSpace = THREE.SRGBColorSpace;
    blockTex.magFilter = THREE.NearestFilter; blockTex.minFilter = THREE.NearestFilter;
  }
  return blockTex;
}
// Brilliant-cut diamond: flat table, 8-sided crown, deep pointed pavilion, light-blue facets.
function diamondGeometry(size) {
  const r = size * 0.5, rt = r * 0.55, hc = size * 0.2, hp = size * 0.5, N = 8, pos = [];
  const ring = (rad, y, off = 0) => Array.from({ length: N }, (_, i) => { const a = (i + off) / N * Math.PI * 2; return [Math.cos(a) * rad, y, Math.sin(a) * rad]; });
  const table = ring(rt, hc, 0.5), girdle = ring(r, 0), tip = [0, -hp, 0], top = [0, hc, 0];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tri(top, table[j], table[i]);                    // table
    tri(table[i], table[j], girdle[j]); tri(table[i], girdle[j], girdle[i]);   // crown
    tri(girdle[i], girdle[j], tip);                  // pavilion
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
/** A 3D token about `size` studs across. Its "front" (face) points toward +Z. */
export function tokenMesh(id, size = 3) {
  const t = TOKEN[id];
  let m;
  if (t.kind === 'ball') {
    m = new THREE.Mesh(new THREE.SphereGeometry(size / 2, 48, 32), new THREE.MeshStandardMaterial({ map: ballTexture(id), roughness: 0.32, metalness: 0 }));
    m.scale.set(1.08, 0.94, 1.0);   // slightly wide, like the screenshots
  } else if (t.kind === 'block') {
    m = new THREE.Mesh(new THREE.BoxGeometry(size * 0.96, size * 0.96, size * 0.96), new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.3 }));
  } else {
    m = new THREE.Group();
    // dark square backing (like the emoji tile in the screenshots) with the diamond in front
    const back = new THREE.Mesh(new THREE.BoxGeometry(size * 0.12, size * 0.98, size * 0.98), new THREE.MeshLambertMaterial({ color: '#05080b' }));
    back.rotation.y = Math.PI / 2; back.position.z = -size * 0.3; m.add(back);
    const gem = new THREE.Mesh(diamondGeometry(size * 0.92), new THREE.MeshStandardMaterial({ color: '#9fdcff', emissive: '#2a6fb0', emissiveIntensity: 0.25, roughness: 0.08, metalness: 0.15, flatShading: true }));
    gem.position.y = size * 0.06; gem.rotation.x = 0.25; m.add(gem);
  }
  m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  m.userData.token = id;
  return m;
}

/** Data-URL icon of a face ball / block in any colour (shop & index art). extra: 'nerd' adds glasses. */
const faceCache = new Map();
export function faceIcon(color, face = 'smile', shape = 'ball', extra = '') {
  const key = [color, face, shape, extra].join('|');
  if (!faceCache.has(key)) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    if (shape === 'block') {
      g.fillStyle = color; g.fillRect(14, 14, 100, 100);
      g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(14, 14, 100, 14); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(14, 100, 100, 14);
      if (face) drawFace(g, face, 64, 66, 44);
    } else {
      const r = 54, grad = g.createRadialGradient(46, 40, 6, 64, 64, r);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.2, color); grad.addColorStop(1, color);
      g.fillStyle = grad; g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fill();
      if (face) drawFace(g, face, 64, 64, r);
      if (extra === 'nerd') {
        g.strokeStyle = '#3a2a14'; g.lineWidth = 5;
        for (const x of [46, 82]) { g.beginPath(); g.arc(x, 52, 13, 0, Math.PI * 2); g.stroke(); }
        g.beginPath(); g.moveTo(59, 52); g.lineTo(69, 52); g.stroke();
      }
    }
    faceCache.set(key, c.toDataURL());
  }
  return faceCache.get(key);
}
