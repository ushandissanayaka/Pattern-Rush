// Cipher Clash — lobby world (static scenery + cosmetic animation, no game logic).
// Layout from the reference video AND the in-game screenshots:
//
//   +Z  ┌──────────── leaderboards + statues (back edge) ────────────┐
//       │ wheel spin (+X corner)      spawn pad       packs (-X)      │   PLAZA
//       │ next update (+X)                            crates/trees    │
//       └────────── road U-turn ── booths both sides ─────────────────┘
//                         … 10 booth pairs …                              ROAD
//       road end U-turn → obby start platform + "SKY OBBY" sign
//   -Z        floating obby (glass cubes, balls, laser platforms) climbs to
//             the castle, which sits on a separate, higher cliff island.
//
// Units are studs. +X is to your LEFT when you face the leaderboards from the spawn.
import * as THREE from 'three';
import { C } from '../config/palette.js';
import { addCollider, addColliderBox } from './physics.js';
import { BLOOM_THRESHOLD } from '../effects/post.js';
import { mergeStatic } from './optimize.js';

export const WORLD = {
  spawn: new THREE.Vector3(0, 0, 28),
  obbyStart: new THREE.Vector3(0, 1.5, -424),
  roadEndZ: -412,          // beyond this you are "in the obby" (HUD shows RETURN TO LOBBY)
  islandEndZ: -436,
  castleTopY: 8,           // castle terrace top (lower, like the screenshots)
  killY: -90               // fall below this → respawn
};

// Animated actors. main.js calls tickWorld(dt, camera) each frame.
const ACTORS = [];
export const BILLBOARDS = [];
// Conveyor strips (chevron road): { minX, maxX, minZ, maxZ, dx, dz } — main.js pushes the player.
export const CONVEYORS = [];
// Playing places: { id, side, z, red: { z }, blue: { z }, sign } — for the match logic later.
export const STATIONS = [];
export const CONVEYOR_SPEED = 14;   // studs / s, a little slower than walking (16)
export function tickWorld(dt, camera) { for (const a of ACTORS) a(dt, camera); }

/* ---------- materials ---------- */
// Matte Lambert shading everywhere (Roblox look): no glancing-angle specular that
// would wash the grass out. Standard-only params (roughness, metalness) are dropped.
function matte(params = {}) {
  const { roughness, metalness, ...rest } = params;
  return new THREE.MeshLambertMaterial(rest);
}
const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, matte({ color, roughness: 0.85, metalness: 0, ...opts }));
  return mats.get(key);
}
// Neon: tagged for selective bloom (effects/post.js) → glows like Roblox Neon material
// Neon: emissive bright enough (brightest channel above BLOOM_THRESHOLD) to glow in the
// single bloom pass; `glow` sets how far above the threshold → halo strength.
function neon(color, k = 1.3, glow = 0.55) {
  const c = new THREE.Color(color);
  const peak = Math.max(0.05, c.r, c.g, c.b);   // bloom thresholds on the brightest channel
  const m = mat(color, { emissive: color, emissiveIntensity: Math.max(k * 0.5, (BLOOM_THRESHOLD + 0.2 + glow * 0.6) / peak) });
  m.userData.neon = true;
  return m;
}

const SOLID = [];   // meshes registered as colliders once the world is built
function box(w, h, d, material, x = 0, y = 0, z = 0, parent, solid = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  if (solid) SOLID.push(m);
  return m;
}

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry); t.anisotropy = 16;
  return t;
}
// Checker squares stay razor sharp up close (nearest magnification), mipmapped far away.
const checker = (a, b, rx, ry, px = 64) => {
  const t = canvasTex(px, px, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = b; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
  }, rx, ry);
  t.magFilter = THREE.NearestFilter;
  return t;
};
// Roblox-style faint checker on large surfaces (walls, trees, cliffs)
function texturedMat(a, b, rx, ry, extra = {}) {
  const t = checker(a, b, rx, ry);
  t.magFilter = THREE.NearestFilter;
  return matte({ map: t, roughness: 0.9, ...extra });
}
// Lego-stud pads (booth join pads)
const studTex = (color) => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillRect(4 + i * 16, 4 + j * 16, 9, 9); }
  g.fillStyle = 'rgba(0,0,0,.12)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillRect(8 + i * 16, 10 + j * 16, 6, 3); }
}, 2, 2);
// Lane: dark asphalt with teal chevrons
const chevronTex = (len) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = C.lane; g.fillRect(0, 0, w, h);
  g.strokeStyle = C.chevron; g.lineWidth = 40; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(10, h * 0.8); g.lineTo(w / 2, h * 0.3); g.lineTo(w - 10, h * 0.8); g.stroke();
}, 1, len / 12);

/* ---------- billboard text (Roblox BillboardGui look) ---------- */
export function textSprite(lines, worldHeight = 6) {
  const pad = 24, c = document.createElement('canvas'), g = c.getContext('2d');
  const sized = lines.map(l => ({ ...l, px: l.size || 96 }));
  let W = 0, H = pad;
  for (const l of sized) {
    g.font = `${l.weight || 400} ${l.px}px ${l.font || "'Luckiest Guy'"}`;
    W = Math.max(W, g.measureText(l.text).width); H += l.px * 1.05;
  }
  c.width = Math.ceil(W + pad * 2); c.height = Math.ceil(H + pad);
  let y = pad;
  for (const l of sized) {
    g.font = `${l.weight || 400} ${l.px}px ${l.font || "'Luckiest Guy'"}`;
    g.textAlign = 'center'; g.textBaseline = 'top'; g.lineJoin = 'round';
    g.lineWidth = l.px * (l.stroke ?? 0.16); g.strokeStyle = l.strokeColor || '#000';
    if (g.lineWidth > 0) g.strokeText(l.text, c.width / 2, y);
    g.fillStyle = l.color; g.fillText(l.text, c.width / 2, y);
    y += l.px * 1.05;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false }));
  s.scale.set(worldHeight * c.width / c.height, worldHeight, 1);
  s.renderOrder = 10;
  BILLBOARDS.push(s);
  return s;
}
// Booth sign whose text changes during a match (screenshots 62–65).
export function liveSign(worldHeight = 4.6) {
  const c = document.createElement('canvas'); c.width = 900; c.height = 260;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false }));
  sprite.scale.set(worldHeight * c.width / c.height, worldHeight, 1); sprite.renderOrder = 10; BILLBOARDS.push(sprite);
  const set = (title, color, subText = '', subColor = '#ffffff', subBig = false) => {
    g.clearRect(0, 0, c.width, c.height); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = "900 118px 'Montserrat', 'Fredoka'"; g.lineWidth = 20; g.strokeStyle = '#111'; g.strokeText(title, c.width / 2, 78);
    g.fillStyle = color; g.fillText(title, c.width / 2, 78);
    if (subText) {
      g.font = subBig ? "900 100px 'Montserrat', 'Fredoka'" : "800 64px 'Montserrat', 'Fredoka'"; g.lineWidth = subBig ? 16 : 11;
      g.strokeText(subText, c.width / 2, 190); g.fillStyle = subColor; g.fillText(subText, c.width / 2, 190);
    }
    tex.needsUpdate = true;
  };
  return { sprite, set };
}
const sub = (text, color = '#ffffff', size = 64) => ({ text, color, size, font: "'Fredoka'", weight: 600, stroke: 0.14 });

/* ---------- nature + props ---------- */
// Leaves: Roblox "Grass" look — flat-shaded low-poly with a faint two-tone checker.
const leafMats = [
  texturedMat(C.tree, C.treeB, 4, 4, { flatShading: true }),
  texturedMat(C.treeAlt, C.treeAltB, 4, 4, { flatShading: true })
];
const trunkMat = mat(C.trunk, { flatShading: true });
// Round tree (screenshots 6, 7, 13): thick dark trunk that forks, crown of 5–6 big facets.
function roundTree(x, z, r, parent, y = 0, seed = 1) {
  const g = new THREE.Group();
  const trunkH = r * 1.05;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.13, r * 0.2, trunkH, 6), trunkMat);
  t.position.y = trunkH / 2; t.castShadow = true; g.add(t); SOLID.push(t);
  for (const [bx, rz] of [[r * 0.22, -0.55], [-r * 0.18, 0.6]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.1, r * 0.6, 5), trunkMat);
    b.position.set(bx, trunkH * 0.92, 0); b.rotation.z = rz; b.castShadow = true; g.add(b);
  }
  const blobs = [[0, 0.15, 0, 0.82], [0.62, -0.05, 0.15, 0.62], [-0.6, -0.08, -0.12, 0.64], [0.12, 0.05, 0.62, 0.58], [-0.1, 0.0, -0.6, 0.6], [0.05, 0.55, 0.05, 0.55]];
  if (r >= 13) blobs.push([0.75, 0.35, -0.45, 0.5], [-0.7, 0.4, 0.45, 0.5], [0.4, -0.3, -0.75, 0.45], [-0.45, -0.25, 0.8, 0.45]);
  blobs.forEach(([bx, by, bz, sc], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * sc, 0), leafMats[(i + seed) % 2]);
    m.position.set(bx * r, trunkH + r * 0.5 + by * r, bz * r);
    m.rotation.set(i * 0.9 + seed, i * 1.7 + seed * 0.5, i * 0.3);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
  });
  g.position.set(x, y, z); parent.add(g); return g;
}
// Pine (screenshots 2, 7, 13): short trunk, 5 stacked 8-sided tiers.
function pineTree(x, z, h, parent, y = 0) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.035, h * 0.05, h * 0.2, 6), trunkMat);
  t.position.y = h * 0.1; t.castShadow = true; g.add(t); SOLID.push(t);
  for (let i = 0; i < 5; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(h * (0.3 - i * 0.05), h * 0.26, 8), leafMats[0]);
    cone.position.y = h * (0.24 + i * 0.145); cone.rotation.y = i * 0.4;
    cone.castShadow = true; cone.receiveShadow = true; g.add(cone);
  }
  g.position.set(x, y, z); parent.add(g); return g;
}
function crateTex(frame, panel, shade) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = frame; g.fillRect(0, 0, w, h);
    g.fillStyle = shade; g.fillRect(13, 13, w - 26, h - 26);              // inner bevel
    g.fillStyle = panel; g.fillRect(17, 17, w - 34, h - 34);              // recessed panel
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(17, 17, w - 34, 6); g.fillRect(17, 17, 6, h - 34);
    g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(4, 4, w - 8, 3);
  });
}
const crateMat = matte({ map: crateTex('#7c6248', '#b39a7a', '#8f7559') });
const crateMatMauve = matte({ map: crateTex('#5f4b56', '#9d838c', '#735d68') });   // pinkish crates by Next Update
function crate(x, y, z, s, parent, rot = 0, material = crateMat) { const m = box(s, s, s, material, x, y + s / 2, z, parent); m.rotation.y = rot; return m; }
// light grey two-tier step blocks scattered around the plaza (screenshots 34, 37)
const stepMat = mat('#e4e8ea');
function stepBlock(x, z, parent, rot = 0, sc = 1) {
  const g = new THREE.Group();
  box(4 * sc, 1.1 * sc, 3 * sc, stepMat, 0, 0.55 * sc, 0, g);
  box(2.8 * sc, 1 * sc, 2 * sc, stepMat, -0.4 * sc, 1.6 * sc, -0.3 * sc, g);
  g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g); return g;
}

/* ---------- booth (one 1v1 match station) ---------- */
const BOOTH_W = 34, BOOTH_D = 30, BOOTH_H = 21;
function codeBarTex(placed) {
  return canvasTex(1024, 112, (g, w, h) => {
    g.fillStyle = '#e9eef0'; g.fillRect(0, 0, w, h);
    g.fillStyle = C.codeBar; g.fillRect(8, 8, w - 16, h - 16);
    const cells = 9, cw = (w - 16) / cells;
    g.font = "700 84px 'Fredoka'"; g.textAlign = 'center'; g.textBaseline = 'middle';   // rounded bold "?" (screenshot 46)
    for (let i = 0; i < cells; i++) {
      const cx = 8 + cw * (i + 0.5), t = placed[i];
      if (!t) { g.fillStyle = '#e4e6e8'; g.fillText('?', cx, h / 2 + 4); continue; }
      // PLACEHOLDER token shapes (no faces / original art)
      g.fillStyle = t.color;
      if (t.shape === 'gem') { g.fillStyle = '#0d1418'; g.fillRect(cx - cw / 2 + 4, 12, cw - 8, h - 24); g.fillStyle = t.color; g.beginPath(); g.moveTo(cx - 30, h / 2 - 8); g.lineTo(cx + 30, h / 2 - 8); g.lineTo(cx, h / 2 + 30); g.fill(); g.fillRect(cx - 30, h / 2 - 22, 60, 14); }
      else if (t.shape === 'cube') { g.fillRect(cx - cw / 2 + 6, 14, cw - 12, h - 28); }
      else { g.beginPath(); g.arc(cx, h / 2, 40, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(cx - 12, h / 2 - 14, 11, 0, Math.PI * 2); g.fill(); }
    }
  });
}
function tokenMesh(t) {
  if (t.shape === 'gem') { const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), mat(t.color, { roughness: 0.2, flatShading: true })); m.scale.y = 0.8; return m; }
  if (t.shape === 'cube') return new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), mat(t.color, { roughness: 0.25, transparent: true, opacity: 0.9 }));
  return new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), mat(t.color, { roughness: 0.35 }));
}
const boothWallMats = {
  red: texturedMat(C.boothPinkA, C.boothPinkB, 6, 4), cyan: texturedMat(C.boothIceA, C.boothIceB, 6, 4)
};
const padFrameMat = mat(C.padFrame);
const padMats = { red: matte({ map: studTex(C.padRed), roughness: 0.6 }), blue: matte({ map: studTex(C.padBlue), roughness: 0.6 }) };

// One HALF of a 2-player playing place (screenshot 48). `seam` = +1 / -1: which local-Z
// side the partner half is on — the join pad sits next to that seam.
function booth(side, z, trim, state, parent, seam = 1) {
  const g = new THREE.Group();
  const white = mat(C.boothWhite), inner = boothWallMats[trim];
  const nm = neon(trim === 'red' ? C.trimRed : C.trimCyan);
  // local frame: +X faces the road
  box(BOOTH_D, 1, BOOTH_W, white, 0, 0.5, 0, g);                                      // floor
  box(1.5, BOOTH_H, BOOTH_W - 2, inner, -BOOTH_D / 2 + 1.5, BOOTH_H / 2, 0, g);        // back wall
  box(1.5, BOOTH_H + 2, BOOTH_W + 2, white, -BOOTH_D / 2, (BOOTH_H + 2) / 2, 0, g);     // outer back
  for (const s of [-1, 1]) {
    box(BOOTH_D, BOOTH_H, 1.2, inner, 0, BOOTH_H / 2, s * (BOOTH_W / 2 - 1.6), g, false); // inner side panel
    box(BOOTH_D, BOOTH_H + 1, 2, white, 0, (BOOTH_H + 1) / 2, s * BOOTH_W / 2, g);        // side wall
    box(3.4, BOOTH_H + 5, 3.4, white, BOOTH_D / 2 - 1, (BOOTH_H + 5) / 2, s * (BOOTH_W / 2 + 0.6), g); // front pillar
    box(0.5, BOOTH_H + 2, 0.9, nm, BOOTH_D / 2 + 0.75, (BOOTH_H + 2) / 2 + 0.5, s * (BOOTH_W / 2 - 1.6), g, false); // neon front
    box(0.5, BOOTH_H - 4, 0.6, nm, -BOOTH_D / 2 + 2.4, BOOTH_H / 2, s * (BOOTH_W / 2 - 3), g, false);            // neon back corners
    box(BOOTH_D - 2, 0.6, 0.6, nm, 0, BOOTH_H + 1.1, s * (BOOTH_W / 2 - 0.6), g, false);                          // neon along wall top
  }
  box(0.6, 0.6, BOOTH_W - 4, nm, -BOOTH_D / 2 + 2.4, BOOTH_H - 2.5, 0, g, false);
  // tiered stand: lower facade with the code bar, upper deck where players stand
  box(14, 9, BOOTH_W - 4, white, BOOTH_D / 2 - 7, 4.5, 0, g);
  box(14, 13, BOOTH_W - 4, white, BOOTH_D / 2 - 21, 6.5, 0, g);
  box(4, 1.2, BOOTH_W - 6, mat(C.boothShade), BOOTH_D / 2 - 1.5, 9.6, 0, g, false);   // ledge lip
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(BOOTH_W - 8, 3.6),
    matte({ map: codeBarTex(state.tokens || []), roughness: 0.6 }));
  bar.rotation.y = Math.PI / 2; bar.position.set(BOOTH_D / 2 + 0.02, 5.2, 0); g.add(bar);
  g.userData.barTex = bar.material.map;   // redrawn by the match system as slots are revealed
  // tokens waiting on the ledge (same order as the bar)
  (state.tokens || []).forEach((t, i) => {
    if (!t) return;
    const tk = tokenMesh(t); tk.castShadow = true;
    tk.position.set(BOOTH_D / 2 - 2.5, 11, -(BOOTH_W - 8) / 2 + 1.7 + i * ((BOOTH_W - 8) / 9)); g.add(tk);
  });
  // ONE join pad per half, in this half's colour, right next to the seam (screenshot 48)
  const padKind = trim === 'red' ? 'red' : 'blue', pz = seam * (BOOTH_W / 2 - 4.5);
  box(8.6, 0.3, 7.6, padFrameMat, BOOTH_D / 2 + 7.5, 0.15, pz, g, false);
  const pad = box(7.4, 0.42, 6.4, padMats[padKind], BOOTH_D / 2 + 7.5, 0.21, pz, g, false);
  pad.userData.class = `join-pad join-pad--${padKind}`;
  g.userData.padLocal = new THREE.Vector3(BOOTH_D / 2 + 7.5, 0.42, pz);
  g.position.set(side * (36 + BOOTH_D / 2), 0, z);
  if (side > 0) g.rotation.y = Math.PI;
  g.userData.class = `booth booth--${trim}`;
  parent.add(g);
  return g;
}

/* ---------- plaza landmarks ---------- */
function spawnPad(parent) {
  const p = WORLD.spawn, S = 20;
  const sunTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f1f3f1'; g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2); g.fillStyle = '#2b3335'; g.strokeStyle = '#2b3335';
    for (let i = 0; i < 8; i++) {                     // 8 curved spikes
      g.save(); g.rotate(i * Math.PI / 4);
      g.beginPath(); g.moveTo(-14, -34); g.quadraticCurveTo(10, -70, 26, -104); g.quadraticCurveTo(14, -64, 14, -34); g.closePath(); g.fill();
      g.restore();
    }
    g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 38, 0, Math.PI * 2); g.stroke();
  });
  sunTex.wrapS = sunTex.wrapT = THREE.ClampToEdgeWrapping;
  const frame = mat('#c9cfcd');
  box(S, 0.35, S, mat('#8cdc99'), p.x, 0.18, p.z, parent, false).userData.class = 'spawn-pad';        // pale green glass
  for (const [w, d, x, z] of [[S, 0.9, 0, S / 2 - 0.45], [S, 0.9, 0, -S / 2 + 0.45], [0.9, S, S / 2 - 0.45, 0], [0.9, S, -S / 2 + 0.45, 0]])
    box(w, 0.55, d, frame, p.x + x, 0.28, p.z + z, parent, false);                                      // grey outer frame
  const line = neon('#ffffff', 0.6, 0.16), L = S - 3.4;
  for (const [w, d, x, z] of [[L, 0.4, 0, L / 2], [L, 0.4, 0, -L / 2], [0.4, L, L / 2, 0], [0.4, L, -L / 2, 0]])
    box(w, 0.42, d, line, p.x + x, 0.22, p.z + z, parent, false);                                       // glowing inset line
  const tile = new THREE.Mesh(new THREE.BoxGeometry(9, 0.45, 9),
    [mat('#e9ecea'), mat('#e9ecea'), matte({ map: sunTex }), mat('#e9ecea'), mat('#e9ecea'), mat('#e9ecea')]);
  tile.position.set(p.x, 0.25, p.z); tile.receiveShadow = true; parent.add(tile);
  const tileGlow = neon('#ffffff', 0.35, 0.12);
  for (const [w, d, x, z] of [[9.6, 0.3, 0, 4.7], [9.6, 0.3, 0, -4.7], [0.3, 9.6, 4.7, 0], [0.3, 9.6, -4.7, 0]])
    box(w, 0.47, d, tileGlow, p.x + x, 0.24, p.z + z, parent, false);
}

function wheelSpin(parent) {
  const g = new THREE.Group();
  // clockwise from 12 o'clock: purple, red, orange, yellow, green, blue
  const segs = [C.wheelPurple, C.wheelRed, C.wheelOrange, C.wheelYellow, C.wheelGreen, C.wheelBlue];
  const R = 10.5, H = 15;
  const disc = new THREE.Group();
  segs.forEach((col, i) => {
    const sg = new THREE.Mesh(new THREE.CircleGeometry(R, 24, THREE.MathUtils.degToRad(90 - (i + 1) * 60), Math.PI / 3), mat(col));
    sg.position.z = 0.75; disc.add(sg);
    const back = sg.clone(); back.rotation.y = Math.PI; back.position.z = -0.75; disc.add(back);
  });
  for (let i = 0; i < 6; i++) {                       // thin white spokes between segments
    const sp = box(0.25, R, 0.1, mat('#f4f5f8'), 0, 0, 0.8, disc, false);
    sp.geometry.translate(0, R / 2, 0); sp.rotation.z = THREE.MathUtils.degToRad(i * 60 + 30);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 16), mat('#f4f5f8')); hub.rotation.x = Math.PI / 2; disc.add(hub);
  disc.add(new THREE.Mesh(new THREE.TorusGeometry(R + 1.1, 1.25, 14, 72), mat('#f4f5f8')));      // thick white rim
  disc.add(new THREE.Mesh(new THREE.TorusGeometry(R + 0.05, 0.28, 8, 72), mat('#9aa0b4')));      // grey inner lip
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.2, R + 0.2, 1.4, 64), mat('#dfe2ea')); body.rotation.x = Math.PI / 2; disc.add(body);
  const ptr = new THREE.Shape(); ptr.moveTo(-1.5, 0); ptr.lineTo(1.5, 0); ptr.lineTo(0.15, -4.6); ptr.lineTo(-0.15, -4.6); ptr.closePath();
  const pointer = new THREE.Mesh(new THREE.ExtrudeGeometry(ptr, { depth: 0.6, bevelEnabled: false }), mat('#fbfbfc'));
  pointer.position.set(0, R + 3.2, 1.1); g.add(pointer); pointer.position.y += H;                  // fixed, does not spin
  disc.position.y = H; g.add(disc);
  box(1.2, 4.2, 1.2, mat('#8a92a6'), 0, H + R + 3.2, -0.2, g, false);                               // pointer post
  // low blue stand
  box(5, 2.6, 4, mat('#4a6fa8'), 0, 1.3, 0, g);
  box(2.6, H - R - 1, 2.2, mat('#4a6fa8'), 0, (H - R - 1) / 2 + 2.6, 0, g, false);
  // glowing cyan circle on the floor, centred on the stand
  const ring = new THREE.Mesh(new THREE.RingGeometry(12.2, 13.2, 72), neon(C.padCyan, 1.0, 0.5)); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.12, 15); g.add(ring);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(12.2, 72), new THREE.MeshBasicMaterial({ color: '#27c0b8', transparent: true, opacity: 0.42 }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.1, 15); g.add(glow);
  const t1 = textSprite([{ text: 'WHEEL SPIN', color: C.textWheel, size: 100 }, sub('Free spin every day!', '#ffffff', 56)], 4.6);
  t1.position.set(0, H + R + 9, 0); g.add(t1);
  const t2 = textSprite([{ text: 'YOU HAVE 2 SPINS!', color: C.textSpins, size: 100 }], 1.9); t2.position.set(0, 2.6, 15); g.add(t2);
  g.position.set(62, 0, 38); g.rotation.y = Math.atan2(-62, -10);   // island edge, faces the spawn pad (screenshots 32, 44)
  g.userData.class = 'landmark-wheel'; g.userData.spinDisc = disc;
  parent.add(g);
  // reward preview on a crate between the wheel and the boards ("Wheelity / Mythic")
  const d = new THREE.Group();
  crate(0, 0, 0, 4, d);
  const item = new THREE.Group();
  segs.forEach((col, i) => item.add(new THREE.Mesh(new THREE.CircleGeometry(1.8, 12, i * Math.PI / 3, Math.PI / 3), mat(col, { side: THREE.DoubleSide }))));
  item.add(new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.25, 8, 24), mat('#e6e8ee')));
  item.position.y = 6.5; item.userData.dynamic = true; d.add(item);
  const tl = textSprite([sub('Wheelity', '#ffffff', 70), { text: 'Mythic', color: C.textMythic, size: 62, font: "'Fredoka'", weight: 700, stroke: 0.16 }], 2.2);
  tl.position.y = 10.2; d.add(tl);
  d.rotation.y = 0.5; d.position.set(43, 0, 54); parent.add(d);
  ACTORS.push((dt) => { item.rotation.y += dt * 0.9; item.position.y = 6.5 + Math.sin(performance.now() / 600) * 0.25; });
}

function nextUpdateBoard(parent) {
  const g = new THREE.Group();
  // board: thick slate-purple frame with a light tile pattern around a red screen, tilted back
  const W = 21, H = 9.6, T = 1.4;
  const frameTex = canvasTex(420, 192, (c, w, h) => {
    c.fillStyle = '#6d68a0'; c.fillRect(0, 0, w, h);
    const tile = 20;
    for (let x = 0; x < w; x += tile) for (let y = 0; y < h; y += tile) {
      if (x > 24 && x < w - 44 && y > 24 && y < h - 44) continue;
      c.fillStyle = ((x + y) / tile) % 2 ? '#a9a5dc' : '#d3d0f2'; c.fillRect(x + 22, y + 22, tile, tile);
    }
    c.fillStyle = '#6d68a0'; c.fillRect(42, 42, w - 84, h - 84);
  });
  const sideMat = mat('#5b5690');
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [sideMat, sideMat, sideMat, sideMat, matte({ map: frameTex }), sideMat]);
  frame.castShadow = true; frame.receiveShadow = true;
  const screenTex = canvasTex(256, 100, (c, w, h) => {    // PLACEHOLDER screen art (original face not copied)
    c.fillStyle = '#e3101f'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(64, 34, 128, 12, 6); c.fill(); c.beginPath(); c.roundRect(88, 56, 80, 10, 5); c.fill();
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 4.2, H - 4.2), matte({ map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.25 }));
  screen.position.z = T / 2 + 0.02;
  const board = new THREE.Group(); board.add(frame, screen);
  board.position.set(0, 7.6, 0); board.rotation.x = -0.12; g.add(board);
  // two splayed legs ending in chunky feet
  const legMat = mat('#625d97');
  for (const sx of [-1, 1]) {
    const leg = box(1.1, 6, 1.1, legMat, sx * (W / 2 - 1.2), 3, -0.9, g, false); leg.rotation.x = 0.25;
    box(2.4, 1.2, 3, mat('#57528a'), sx * (W / 2 - 1.2), 0.6, -0.4, g);
  }
  const t = textSprite([{ text: 'NEXT UPDATE', color: C.textNextUpdate, size: 110 }], 2.7); t.position.set(0, 15.5, 0); g.add(t);
  // mauve crates stacked behind and beside (screenshots 31, 32)
  crate(-6, 0, -4.5, 3.4, g, 0.2, crateMatMauve); crate(-2.8, 0, -4.8, 3.2, g, -0.1, crateMatMauve); crate(-4.5, 3.3, -4.6, 3, g, 0.4, crateMatMauve);
  crate(7.5, 0, -4.4, 3.4, g, 0.3, crateMatMauve); crate(10.6, 0, -2.4, 3, g, -0.3, crateMatMauve);
  g.position.set(46, 0, 11); g.rotation.y = Math.atan2(-46, 12);   // faces the spawn pad (screenshots 32, 43, 46)
  g.userData.class = 'landmark-next-update PLACEHOLDER'; parent.add(g);
}

function packsStall(parent) {
  const g = new THREE.Group();
  const wood = mat('#8a6a52'), woodDark = mat('#6e5442'), grey = mat('#6f7888'), feet = mat('#3e4249');
  // counter: grey-blue top plank on a plank front, chunky dark feet (front of stall = local +Z)
  box(15, 3.2, 0.6, wood, 0, 2.4, 2.9, g);
  box(15, 0.9, 0.5, woodDark, 0, 0.9, 3.25, g, false);
  box(17, 0.6, 3.4, grey, 0, 4.25, 2.4, g, false);
  for (const sx of [-1, 1]) for (const z of [3.1, -2.8]) box(1.3, 1.5, 1.3, feet, sx * 7.4, 0.75, z, g, false);
  // posts: wooden front / back corner posts, grey inner rails
  for (const sx of [-1, 1]) {
    box(1, 12, 1, wood, sx * 7.4, 6, 3.1, g, false);
    box(1, 12.6, 1, wood, sx * 7.4, 6.3, -2.8, g, false);
    box(0.7, 11, 0.7, grey, sx * 5.6, 5.5, -2.4, g, false);
    box(0.7, 0.7, 6, grey, sx * 7.4, 8.4, 0.2, g, false);          // side rail
  }
  // slatted back wall (4 horizontal planks with gaps)
  for (let i = 0; i < 4; i++) box(14.2, 1.3, 0.35, i % 2 ? woodDark : wood, 0, 5.6 + i * 1.75, -2.9, g, false);
  // striped awning, sloping down to the front, with a thick red front edge
  const stripes = canvasTex(256, 32, (c, w, h) => { for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#f4f4f2' : '#e3191e'; c.fillRect(i * w / 10, 0, w / 10, h); } });
  stripes.magFilter = THREE.NearestFilter;
  const aw = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(18, 0.7, 7.6), [mat('#e3191e'), mat('#e3191e'), matte({ map: stripes }), matte({ map: stripes }), mat('#e3191e'), mat('#e3191e')]);
  top.castShadow = true; aw.add(top);
  box(18.2, 1, 0.6, mat('#e3191e'), 0, -0.4, 3.9, aw, false);
  aw.position.set(0, 12.7, 0.3); aw.rotation.x = 0.24; g.add(aw);
  // PLACEHOLDER pack items on crate pedestals behind the counter (plain spheres, no faces)
  const rainbow = canvasTex(64, 64, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    ['#ffd6ec', '#ffe1a8', '#fff3a6', '#c9f7c2', '#bfe6ff', '#e0c8ff'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  crate(-3.6, 0, 0.6, 3, g, 0.1); crate(3.6, 0, 0.6, 3, g, -0.1); crate(0, 0, -0.6, 2.6, g, 0.3);
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 16), matte({ map: rainbow })); s1.position.set(-3.6, 4.4, 0.6); s1.castShadow = true; g.add(s1);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 16), mat('#f7e21c')); s2.position.set(3.6, 4.4, 0.6); s2.castShadow = true; g.add(s2);
  const s3 = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), mat('#f4f6f8')); s3.position.set(0, 3.4, -0.6); g.add(s3);
  // crate stacks either side
  crate(-11, 0, 0, 3.6, g, 0.15); crate(-11.2, 3.6, 0.2, 3.2, g, -0.2); crate(-14.2, 0, -1.6, 3.4, g, 0.3);
  crate(10.8, 0, -0.8, 3.4, g, -0.15); crate(13.6, 0, 0.8, 3.2, g, 0.25); crate(11.6, 3.4, -0.6, 3, g, 0.1);
  const t = textSprite([{ text: 'PACKS', color: C.textPacks, size: 120 }, { text: 'Spend Cash Here', color: C.textPacksSub, size: 72, font: "'Fredoka'", weight: 700, stroke: 0.16 }], 4.8);
  t.position.set(0, 19.5, 0); g.add(t);
  g.position.set(-50, 0, 12); g.rotation.y = Math.atan2(50, 14);   // against the -X edge, facing the spawn (screenshots 33, 43, 44)
  g.userData.class = 'landmark-packs'; parent.add(g);
}

/* ---------- Bridge Challenge (screenshots 41, 42, 43) ---------- */
function rainbowSign(lead, hot, worldHeight) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const font = "700 64px 'Fredoka'";
  g.font = font; const wLead = g.measureText(lead).width, wHot = g.measureText(hot).width;
  c.width = Math.ceil(wLead + wHot + 40); c.height = 96;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const hues = ['#b45cff', '#2fb6ff', '#3be05a', '#ffe83a', '#ffb21e', '#ff3b3b'];
  const draw = (k) => {
    g.clearRect(0, 0, c.width, c.height); g.font = font; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#000';
    let x = 20; const y = c.height / 2;
    [...(lead + hot)].forEach((ch, i) => { g.strokeText(ch, x, y); g.fillStyle = hues[Math.floor((i + k) / 3) % hues.length]; g.fillText(ch, x, y); x += g.measureText(ch).width; });
    tex.needsUpdate = true;
  };
  draw(0);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false }));
  sp.scale.set(worldHeight * c.width / c.height, worldHeight, 1); sp.renderOrder = 10; BILLBOARDS.push(sp);
  let acc = 0, k = 0;
  ACTORS.push((dt) => { acc += dt; if (acc > 0.12) { acc = 0; draw(++k); } });
  return sp;
}
function bridgeChallenge(parent) {
  const g = new THREE.Group(), L = 26, W = 16;
  box(W + 1.6, 0.6, L + 1.6, mat('#7d878b'), 0, 0.3, 0, g);                                  // grey rim
  box(W, 0.9, L, matte({ map: checker(C.grassA, C.grassB, W / 8, L / 8) }), 0, 0.45, 0, g);   // raised grass slab
  crate(-4.2, 0.9, -3, 3.8, g, 0.15); crate(3.9, 0.9, -3.4, 3.8, g, -0.1); crate(-3.6, 4.7, -3.4, 3.2, g, 0.3);
  crate(4.6, 0.9, 0.6, 3.4, g, 0.25); crate(-5, 0.9, 1, 3.2, g, -0.2);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 24), ballMat);   // simple smiley face
  ball.position.set(0, 4.9, 1); ball.castShadow = true; g.add(ball);
  addColliderBox(new THREE.Vector3(0, 4.9, -21), new THREE.Vector3(6, 8, 6));
  const t1 = textSprite([{ text: 'BRIDGE CHALLENGE', color: '#ffd21a', size: 100, font: "'Fredoka'", weight: 700, stroke: 0.14 }], 2.6);
  t1.position.set(0, 13.6, 0); g.add(t1);
  const t2 = rainbowSign('Exclusive Rewards ', 'NOW!', 1.9); t2.position.set(0, 11.6, 0); g.add(t2);
  g.position.set(0, 0, -22); parent.add(g);
  g.userData.class = 'landmark-bridge-challenge PLACEHOLDER';
}

/* ---------- leaderboards (screenshots 4/5) ---------- */
function drawIcon(c, kind, x, y, s) {
  c.save(); c.translate(x, y);
  if (kind === 'clock') { c.fillStyle = '#3fb0ff'; c.beginPath(); c.arc(0, 0, s, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, s * 0.72, 0, 7); c.fill(); c.strokeStyle = '#1d6fd1'; c.lineWidth = s * 0.16; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 0.5); c.moveTo(0, 0); c.lineTo(s * 0.4, 0); c.stroke(); }
  if (kind === 'trophy') { c.fillStyle = '#ffc21a'; c.beginPath(); c.moveTo(-s, -s); c.lineTo(s, -s); c.lineTo(s * 0.6, s * 0.2); c.lineTo(-s * 0.6, s * 0.2); c.fill(); c.fillRect(-s * 0.2, s * 0.2, s * 0.4, s * 0.5); c.fillRect(-s * 0.6, s * 0.7, s * 1.2, s * 0.3); }
  if (kind === 'flame') { c.fillStyle = '#ff4a1a'; c.beginPath(); c.moveTo(0, -s * 1.1); c.quadraticCurveTo(s, 0, s * 0.5, s * 0.8); c.lineTo(-s * 0.5, s * 0.8); c.quadraticCurveTo(-s, 0, 0, -s * 1.1); c.fill(); c.fillStyle = '#ffc21a'; c.beginPath(); c.arc(0, s * 0.35, s * 0.4, 0, 7); c.fill(); }
  c.restore();
}
function leaderboard(title, icon, valueColor, rows, x, countdownStart, parent) {
  const g = new THREE.Group();
  const cnv = document.createElement('canvas'); cnv.width = 512; cnv.height = 620;
  const tex = new THREE.CanvasTexture(cnv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const draw = (secs) => {
    const c = cnv.getContext('2d'), w = cnv.width, h = cnv.height;
    c.fillStyle = C.lbPanel; c.fillRect(0, 0, w, h);
    c.font = "700 44px 'Fredoka'"; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tw = c.measureText(title).width;
    drawIcon(c, icon, w / 2 - tw / 2 - 34, 56, 20); drawIcon(c, icon, w / 2 + tw / 2 + 34, 56, 20);
    c.fillStyle = '#ffffff'; c.fillText(title, w / 2, 58);
    rows.forEach((r, i) => {
      const y = 140 + i * 74;
      c.fillStyle = C.lbRow; c.beginPath(); c.roundRect(20, y - 32, w - 52, 64, 10); c.fill();
      c.textAlign = 'left';
      c.fillStyle = ['#ffc93a', '#ffffff', '#e08a35'][i] || '#ffffff';
      c.font = "700 40px 'Fredoka'"; c.fillText(`#${i + 1}`, 32, y + 2);
      c.fillStyle = ['#f2f4f7', '#d5d9e0', '#e7e9ee', '#cfd4db', '#e2e5ea', '#d8dce3'][i]; c.beginPath(); c.arc(124, y, 22, 0, 7); c.fill();
      c.fillStyle = '#ffffff'; c.font = "700 26px 'Fredoka'"; c.fillText(r[0], 158, y - 8);
      c.fillStyle = '#9aa3b5'; c.font = "600 18px 'Fredoka'"; c.fillText('@' + r[0].toLowerCase().replace(/\s/g, ''), 158, y + 16);
      c.textAlign = 'right'; c.fillStyle = valueColor; c.font = "700 40px 'Fredoka'"; c.fillText(r[1], w - 46, y + 2);
    });
    c.fillStyle = '#3a4152'; c.fillRect(w - 24, 108, 8, 120);               // scrollbar
    c.textAlign = 'center'; c.fillStyle = '#d9dee8'; c.font = "700 26px 'Fredoka'";
    c.fillText(`Updating In: ${secs}s`, w / 2, h - 26);
    tex.needsUpdate = true;
  };
  let secs = countdownStart, acc = 0; draw(secs);
  ACTORS.push((dt) => { acc += dt; if (acc >= 1) { acc -= 1; secs = secs <= 0 ? 60 : secs - 1; draw(secs); } });

  const frameMat = texturedMat(C.lbFrameA, C.lbFrameB, 5, 6);
  const board = new THREE.Group();
  box(22, 26, 1.6, frameMat, 0, 0, 0, board);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(18.6, 22.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  panel.position.z = 0.82; board.add(panel);
  const nG = neon(C.lbNeon, 1.2);   // neon green edge glow (right + top)
  box(0.7, 26.6, 0.7, nG, 11.2, 0, -0.6, board, false); box(22.4, 0.7, 0.7, nG, 0, 13.2, -0.6, board, false);
  board.position.y = 16; board.rotation.x = -0.08; g.add(board);
  box(24, 3, 4, mat(C.lbBase), 0, 1.5, 0, g);
  box(3, 4, 2, mat(C.lbBase), 0, 4.5, 0.5, g, false);
  g.position.set(x, 0, 66); g.rotation.y = Math.PI;
  g.userData.class = 'leaderboard'; parent.add(g);
}
function pedestal(x, parent) {
  box(6.5, 3, 6.5, mat(C.pedestal), x, 1.5, 63, parent);
  box(7, 0.6, 7, neon(C.lbNeon, 1.1), x, 3.3, 63, parent, false);
  return new THREE.Vector3(x, 3.6, 63);
}

/* ---------- road-end obby + castle island (screenshots 16–23) ---------- */
// Glass cubes, smiley balls, green platforms (screenshots 55–59).
const glassMat = new THREE.MeshStandardMaterial({ color: '#7ee8ee', roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88, emissive: '#2bb9c2', emissiveIntensity: 0.18 });
const glassEdgeMat = mat('#b7f5f8');
// Simple smiley (two oval eyes + arc smile), drawn at u = 0.25 so it faces +Z (toward the road).
function smileyTex(base) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cx = w * 0.25, cy = h * 0.5;
    g.fillStyle = '#1b1b1b';
    for (const dx of [-15, 15]) { g.beginPath(); g.ellipse(cx + dx, cy - 14, 5, 9, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy - 2, 26, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
  });
}
const ballMat = matte({ map: smileyTex('#f8e21a') });
const redBallMat = matte({ map: smileyTex('#e8141f') });
const laserMat = neon(C.laser, 1.6);
const rimMat = mat('#4f5659'), platGrass = () => matte({ map: checker('#55d977', '#4fd070', 2, 1) });

function glassCube(x, y, z, s, parent, rot = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), glassMat);
  m.position.set(x, y - s / 2, z); m.rotation.y = rot; m.castShadow = true; parent.add(m);
  const e = new THREE.Mesh(new THREE.BoxGeometry(s * 1.002, s * 0.08, s * 1.002), glassEdgeMat);   // bright top edge
  e.position.set(x, y - s * 0.04, z); e.rotation.y = rot; parent.add(e);
  addColliderBox(new THREE.Vector3(x, y - s / 2, z), new THREE.Vector3(s * 0.95, s, s * 0.95));
}
function smileyBall(x, y, z, r, parent, material = ballMat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), material);
  m.position.set(x, y - r, z); m.rotation.y = 0.15 * Math.sin(x); m.castShadow = true; parent.add(m);
  addColliderBox(new THREE.Vector3(x, y - r, z), new THREE.Vector3(r * 1.3, r * 2, r * 1.3));
}
// long platform: thick dark rim with a recessed green top; laser = two red neon bars across it
function obbyPlatform(x, y, z, rotDeg, parent, laser = false, len = 13, wid = 5.6) {
  const g = new THREE.Group();
  box(len, 2, wid, rimMat, 0, -1, 0, g);
  box(len - 1.2, 2, wid - 1.2, platGrass(), 0, -0.95, 0, g, false);
  g.position.set(x, y, z); g.rotation.y = THREE.MathUtils.degToRad(rotDeg); parent.add(g);
  if (laser) {
    for (const lx of [-2.2, 2.2]) {
      const l = box(0.6, 1.3, wid - 1, laserMat, lx, 0.65, 0, g, false); l.castShadow = false;
      const wp = new THREE.Vector3(lx, 0.65, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
      addColliderBox(wp, new THREE.Vector3(1.6, 1.3, 1.6), { kill: true });
    }
  }
}

function obbyStart(parent) {
  const s = WORLD.obbyStart;
  box(18, 1.5, 13, rimMat, s.x, 0.75, s.z, parent);
  box(16, 1.6, 11, platGrass(), s.x, 0.8, s.z, parent, false);
  addColliderBox(new THREE.Vector3(s.x, 0.8, s.z), new THREE.Vector3(16, 1.6, 11), { checkpoint: s.clone().setY(1.6) });
  const sign = textSprite([{ text: 'SKY OBBY', color: C.textObby, size: 110 }, sub('Can you reach the end for special rewards?', '#ffffff', 58)], 5);
  sign.position.set(0, 13, s.z - 8); parent.add(sign);
}

// Winding path from the road end up to the castle terrace (layout traced from top-down screenshot 55).
const OBBY_PATH = [
  ['cube', 2, -433], ['ball', 6, -439], ['cube', 3, -446], ['cube', -3, -449], ['ball', -9, -452],
  ['plat', -3, -460, 4], ['ball', 6, -461], ['cube', 11, -457], ['plat', 20, -458, -25], ['cube', 29, -452],
  ['ball', 35, -457], ['cube', 37, -465], ['ball', 35, -472], ['cube', 31, -478], ['plat', 22, -481, 28],
  ['ball', 13, -483], ['cube', 8, -480], ['plat', 0, -486, 0], ['red', -8, -488], ['cube', -13, -484],
  ['ball', -19, -481], ['cube', -25, -484], ['ball', -28, -491], ['laser', -22, -498, -18], ['cube', -13, -499],
  ['ball', -8, -503], ['cube', -3, -507], ['ball', 0, -512], ['cube', 2, -517]
];
function obby(parent) {
  const n = OBBY_PATH.length, y0 = 1.6;
  OBBY_PATH.forEach(([kind, x, z, rot = 0], i) => {
    const y = y0 + (i + 1) * (WORLD.castleTopY - y0) / (n + 1);   // steady climb to the terrace
    if (kind === 'cube') glassCube(x, y, z, 3.6, parent, rot + i * 0.3);
    else if (kind === 'ball') smileyBall(x, y, z, 2.2, parent);
    else if (kind === 'red') smileyBall(x, y, z, 2.2, parent, redBallMat);
    else obbyPlatform(x, y, z, rot, parent, kind === 'laser');
  });
}

// Castle island (screenshots 56–59): a low grass terrace with dark stone sides, a wide white
// castle with blue spires at the back, stairs up to the gate, and huge stepped grey cliffs on
// both sides with a gap between cliff and terrace and trees on the cliff tops.
const castleWall = texturedMat('#dfe3e7', '#d6dbe0', 6, 6), castleShade = mat('#c3c9cf'), castleTrim = mat('#eef1f3');
const roofMat = mat('#2049b8'), winMat = mat('#1e3466');
const archTex = canvasTex(64, 128, (g, w, h) => {      // pointed-arch window
  g.clearRect(0, 0, w, h); g.fillStyle = '#1e3466';
  g.beginPath(); g.moveTo(6, h - 4); g.lineTo(6, 44); g.quadraticCurveTo(8, 10, w / 2, 2); g.quadraticCurveTo(w - 8, 10, w - 6, 44); g.lineTo(w - 6, h - 4); g.closePath(); g.fill();
});
archTex.wrapS = archTex.wrapT = THREE.ClampToEdgeWrapping;
const archMat = new THREE.MeshLambertMaterial({ map: archTex, transparent: true, alphaTest: 0.5 });
function arch(x, y, z, w, h, parent, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), archMat); m.position.set(x, y, z); m.rotation.y = rotY; parent.add(m);
}
// square tower with cornice rings, arched windows on the front, tall 8-sided blue spire
// Detailed tiered tower (screenshot 60): 8-sided body in stacked tiers that step in,
// flared corbel ledges under each tier, framed gothic windows, small corner pinnacles
// with mini blue spires, and a tall blue spire on top.
const SIDES = 8;
function octo(r0, r1, h, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, SIDES), material);
  m.position.set(x, y, z); m.rotation.y = Math.PI / SIDES; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function gothicWindow(x, y, z, w, h, parent) {
  box(w + 1.0, h + 1.2, 0.5, castleTrim, x, y, z, parent, false);   // white frame
  box(w + 1.6, 0.6, 0.9, castleTrim, x, y - h / 2 - 0.6, z + 0.2, parent, false);   // sill
  arch(x, y, z + 0.28, w, h, parent);
}
function pinnacle(x, y, z, parent) {
  octo(0.9, 0.9, 3, castleWall, x, y + 1.5, z, parent);
  const c = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 8), roofMat); c.position.set(x, y + 5.2, z); c.castShadow = true; parent.add(c);
}
function tower(x, z, w, h, parent, roofH = w * 2.1) {
  const r = w / 2;
  const tiers = h > 80 ? 3 : 2;
  let y = 0, rr = r;
  const body = new THREE.Group(); parent.add(body);
  for (let t = 0; t < tiers; t++) {
    const th = (t === 0 ? 0.5 : 0.5 / (tiers - 1)) * h;
    octo(rr, rr, th, castleWall, x, y + th / 2, z, body);
    SOLID.push(body.children[body.children.length - 1]);
    // flared corbel ledge + cornice at the top of the tier
    octo(rr + 0.9, rr, 1.6, castleShade, x, y + th - 0.8, z, body);
    octo(rr + 1.3, rr + 1.3, 0.8, castleTrim, x, y + th + 0.4, z, body);
    // framed gothic windows on the front face (one per tier, two on wide tiers)
    const ww = rr * 0.42, wh = Math.min(th * 0.42, rr * 1.1);
    for (const dx of (rr > 10 ? [-0.36, 0.36] : [0])) gothicWindow(x + dx * rr * 2, y + th * 0.55, z + rr * Math.cos(Math.PI / SIDES) + 0.2, ww, wh, body);
    // corner pinnacles where the next tier steps in
    if (t < tiers - 1) for (const a of [0.25, 0.75, 1.25, 1.75]) pinnacle(x + Math.cos(a * Math.PI) * (rr - 0.6), y + th + 0.8, z + Math.sin(a * Math.PI) * (rr - 0.6), body);
    y += th + 0.8; rr *= 0.78;
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(rr + 1.4, roofH, SIDES), roofMat);
  roof.position.set(x, y + roofH / 2, z); roof.rotation.y = Math.PI / SIDES; roof.castShadow = true; parent.add(roof);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), castleTrim); tip.position.set(x, y + roofH, z); parent.add(tip);
}
function cliff(side, parent) {
  // stacked, stepped grey blocks rising from the void (screenshots 56, 57, 59)
  const a = mat('#bfc5ca'), b = mat('#cdd2d6'), T = WORLD.castleTopY;
  // [x, z, width, top above terrace, depth, bottom]: tops stay below the castle roofs (screenshot 57)
  const blocks = [
    [110, -566, 26, 26, 56, -70], [116, -606, 30, 40, 50, -70], [130, -580, 26, 48, 70, -70],
    [104, -540, 16, 16, 18, -70], [120, -640, 34, 34, 40, -70]
  ];
  blocks.forEach(([x, z, w, top, d, bottom], i) => box(w, top - bottom, d, i % 2 ? a : b, side * x, (top + bottom) / 2 + T, z, parent));
  // trees on the cliff tops
  roundTree(side * 114, -606, 8, parent, 40 + T, 2); pineTree(side * 122, -596, 18, parent, 40 + T);
  roundTree(side * 130, -570, 8, parent, 48 + T, 3); pineTree(side * 108, -560, 16, parent, 26 + T);
  roundTree(side * 122, -644, 8, parent, 34 + T, 4); pineTree(side * 134, -588, 16, parent, 48 + T);
}
function castleIsland(parent) {
  const T = WORLD.castleTopY, zF = -520, zB = -650, W = 176;
  // terrace slab: grass top, dark stone sides (gap to the cliffs on both sides)
  const side = mat('#4c5356'), grass = matte({ map: checker(C.grassA, C.grassB, W / 8, (zF - zB) / 8) });
  box(W, 30, zF - zB, [side, side, grass, side, side, side], 0, T - 15, (zF + zB) / 2, parent).userData.class = 'castle-island';
  box(W + 1, 0.6, 1, mat('#7d878b'), 0, T - 0.2, zF, parent, false);
  addColliderBox(new THREE.Vector3(0, T - 0.5, zF - 12), new THREE.Vector3(W, 1, 24), { checkpoint: new THREE.Vector3(0, T, zF - 8) });
  // castle base sits right on the terrace (same level, no raised porch)
  const g = new THREE.Group(); g.position.set(0, T, 26); parent.add(g);   // 26 studs closer to the obby (screenshot 60)
  // stepped gate surround and the big gothic window above the gate
  for (let i = 0; i < 3; i++) {   // nested U-shaped frames around the door (door stays open)
    const fw = 13 + i * 3, fh = 17 + i * 1.5, m = i % 2 ? castleShade : castleTrim, fz = -586.2 - i * 0.6;
    for (const sx of [-1, 1]) box(1.4, fh, 1, m, sx * (fw / 2), fh / 2, fz, g, false);
    box(fw + 1.4, 1.4, 1, m, 0, fh, fz, g, false);
  }
  gothicWindow(0, 36, -586.6, 6, 10, g);
  box(136, 20, 3, castleWall, 0, 10, -604, g);                             // thin curtain wall (wider castle)
  box(136, 1, 3.6, castleTrim, 0, 20.5, -604, g, false);                   // wall cap
  // gate front with an OPEN doorway (11 wide, 15 high) — you can see into the throne hall (screenshot 61)
  for (const sx of [-1, 1]) box(8.5, 28, 3, castleWall, sx * 9.75, 14, -588.5, g);   // wall either side of the opening
  box(11, 13, 3, castleWall, 0, 21.5, -588.5, g);                                      // wall above the opening
  box(29, 1, 3.6, castleTrim, 0, 28.5, -588.5, g, false);
  box(13, 1.6, 1.2, castleTrim, 0, 15.8, -586.5, g, false);                // lintel
  // white stairs up to the hall floor (6 steps, faint green chevrons)
  const stair = mat('#eef0f2'), chev = mat('#8fe0a6'), HF = 6;
  for (let k = 0; k < HF; k++) box(11, 1, 2, stair, 0, k + 0.5, -575 - k * 2, g);
  for (const sx of [-1, 1]) box(1.6, HF + 1, 12, castleTrim, sx * 6.3, (HF + 1) / 2, -580, g);       // stair side walls
  for (let k = 0; k < 3; k++) for (const r of [0.55, -0.55]) { const c = box(3.4, 0.12, 0.5, chev, 0, 2 * k + 1.06, -576 - k * 4, g, false); c.rotation.y = r; }
  box(9, 0.2, 10, mat('#2a57d0'), 0, 0.1, -568, g, false);                 // blue carpet at the foot of the stairs
  // throne hall behind the door: raised floor, blue carpet runway, blue panelled walls,
  // white pillars, throne with a blue orb, bright window at the far end
  const hallZ0 = -587, hallZ1 = -602, hallD = hallZ0 - hallZ1, hz = (hallZ0 + hallZ1) / 2;
  box(18, HF, hallD + 2, mat('#d9dee3'), 0, HF / 2, hz, g);                           // hall floor (solid)
  box(5, 0.2, hallD, mat('#1f4fd0'), 0, HF + 0.1, hz, g, false);                       // runway carpet
  const panel = mat('#3d6fe0'), panelEdge = mat('#e9eef3');
  for (const sx of [-1, 1]) {
    box(1, 18, hallD, panelEdge, sx * 8.5, HF + 9, hz, g);                            // hall side walls
    for (let k = 0; k < 3; k++) box(0.3, 9, 3.4, panel, sx * 7.9, HF + 6, hallZ0 - 2.5 - k * 4.6, g, false);   // blue wall panels
    for (let k = 0; k < 2; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 16, 12), panelEdge); c.position.set(sx * 6.4, HF + 8, hallZ0 - 4 - k * 6); c.castShadow = true; g.add(c); }
  }
  box(18, 1, hallD, mat('#c9d0d6'), 0, HF + 18, hz, g, false);                         // ceiling
  const glow = box(12, 14, 0.3, mat('#eaf6ff', { emissive: '#eaf6ff', emissiveIntensity: 0.9 }), 0, HF + 8, hallZ1 + 0.3, g, false);   // bright back window
  box(4, 1, 4, mat('#e9eef3'), 0, HF + 0.5, hallZ1 + 3.5, g);                          // dais
  box(3.4, 1.4, 2.6, mat('#f2c94c'), 0, HF + 1.7, hallZ1 + 3.5, g, false);            // throne seat
  box(3.4, 5, 0.8, mat('#f2c94c'), 0, HF + 3.4, hallZ1 + 2.4, g, false);              // throne back
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), mat('#1f3fe0')); orb.position.set(0, HF + 3.9, hallZ1 + 3.6); orb.castShadow = true; g.add(orb);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.3, 8, 16), mat('#f2c94c')); crown.rotation.x = Math.PI / 2; crown.position.set(0, HF + 7.4, hallZ1 + 2.4); g.add(crown);
  const hallSign = textSprite([{ text: 'THE KING', color: '#ffffff', size: 80, font: "'Fredoka'", weight: 700, stroke: 0.14 }], 1.2);
  hallSign.position.set(0, HF + 9.5, hallZ1 + 3); g.add(hallSign);
  arch(0, 22, -586.8, 4, 6, g);
  // 9 ROUND towers in clear height tiers: low outer → gate → back corners → mid → tallest centre keep
  [
    [-62, -596, 19, 44], [62, -596, 19, 44],      // outer front
    [-19, -590, 18, 60], [19, -590, 18, 60],      // gate towers
    [-78, -614, 18, 68], [78, -614, 18, 68],      // back corners
    [-43, -608, 22, 86], [43, -608, 22, 86],      // mid towers
    [0, -617, 28, 112]                            // centre keep
  ].forEach(([x, z, w, h]) => tower(x, z, w, h, g, w * 2.1));
  // trees and decor on the terrace
  // big trees in front of the castle, on both sides of the gate
  roundTree(-62, -538, 10, parent, T, 1); pineTree(-46, -546, 22, parent, T); roundTree(-84, -560, 11, parent, T, 2); pineTree(-84, -588, 28, parent, T);
  roundTree(62, -540, 10, parent, T, 3); pineTree(46, -547, 20, parent, T); roundTree(84, -562, 11, parent, T, 4); pineTree(84, -590, 28, parent, T);
  const pink = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), mat('#e83ab6')); pink.position.set(-7, T + 1.5, -540); pink.castShadow = true; parent.add(pink);
  cliff(-1, parent); cliff(1, parent);
}

/* ---------- build everything ---------- */
export function buildWorld(scene) {
  const root = new THREE.Group(); scene.add(root);

  // lobby island: one slab, checker grass top, thick dark-grey sides
  const z0 = 74, z1 = WORLD.islandEndZ, W = 144;
  const sideMat = texturedMat(C.islandSide, C.islandSideDark, 40, 3);
  const top = matte({ map: checker(C.grassA, C.grassB, W / 16, (z0 - z1) / 16), roughness: 0.95 });
  box(W, 12, z0 - z1, [sideMat, sideMat, top, sideMat, sideMat, sideMat], 0, -6, (z0 + z1) / 2, root).userData.class = 'island';
  box(W + 1, 0.6, 1, mat(C.islandRim), 0, -0.25, z0, root, false); box(W + 1, 0.6, 1, mat(C.islandRim), 0, -0.25, z1, root, false);

  // road: U-turns at both ends + two chevron lanes; white curbs
  const laneTop = -8, laneBot = WORLD.roadEndZ + 6, laneLen = laneTop - laneBot;
  // Conveyor loop (screenshots 11, 28): the -X lane runs toward the plaza, the near
  // U-turn carries you to +X, the +X lane runs toward the castle, the far U-turn back to -X.
  const conveyor = (cx, cz, w, len, dx, dz) => {
    const tex = chevronTex(len);
    const holder = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, len), matte({ map: tex }));
    strip.rotation.x = -Math.PI / 2; strip.receiveShadow = true; holder.add(strip);   // arrows point local -Z
    holder.rotation.y = Math.atan2(-dx, -dz); holder.position.set(cx, 0.04, cz);
    holder.userData.dynamic = true; root.add(holder);
    const along = dx !== 0;
    CONVEYORS.push({ minX: cx - (along ? len : w) / 2, maxX: cx + (along ? len : w) / 2, minZ: cz - (along ? w : len) / 2, maxZ: cz + (along ? w : len) / 2, dx, dz });
    ACTORS.push((dt) => { tex.offset.y -= dt * CONVEYOR_SPEED / 12; });   // 12 studs per chevron tile
  };
  conveyor(-16, (laneTop + laneBot) / 2, 12, laneLen, 0, 1);
  conveyor(16, (laneTop + laneBot) / 2, 12, laneLen, 0, -1);
  conveyor(0, laneTop + 6, 12, 44.8, 1, 0);
  conveyor(0, laneBot - 6, 12, 44.8, -1, 0);
  for (const s of [-1, 1]) {
    box(0.8, 0.4, laneLen + 12, mat(C.curb), s * 22.4, 0.2, (laneTop + laneBot) / 2, root, false);
    box(0.8, 0.4, laneLen - 12, mat(C.curb), s * 9.6, 0.2, (laneTop + laneBot) / 2, root, false);
  }
  for (const zc of [laneTop + 6, laneBot - 6]) {
    box(45.6, 0.4, 0.8, mat(C.curb), 0, 0.2, zc + Math.sign(zc - (laneTop + laneBot) / 2) * 6.4, root, false);
    box(20, 0.4, 0.8, mat(C.curb), 0, 0.2, zc - Math.sign(zc - (laneTop + laneBot) / 2) * 6.4, root, false);
  }

  // Playing places (screenshot 48): each one is a RED half + a BLUE half side by side —
  // one half per player, each with its own code bar and its own join pad at the seam,
  // and one shared "AVAILABLE 0/2 Players" sign above the seam. 5 places per side.
  const HALF_PITCH = 38;                 // halves touch at the seam (front pillars meet)
  for (let k = 0; k < 5; k++) {
    const zc = -55 - k * 80;
    for (const side of [-1, 1]) {
      const id = `${side < 0 ? 'L' : 'R'}${k + 1}`;
      // red half nearer the plaza, blue half further down the road; partner is across the seam
      const redZ = zc + HALF_PITCH / 2, blueZ = zc - HALF_PITCH / 2;
      const localSeam = (worldDir) => (side > 0 ? -worldDir : worldDir);   // +X-side halves are rotated 180°
      const redG = booth(side, redZ, 'red', { tokens: [] }, root, localSeam(-1));
      const blueG = booth(side, blueZ, 'cyan', { tokens: [] }, root, localSeam(1));
      redG.userData.class = `booth booth--red station-${id}`; blueG.userData.class = `booth booth--cyan station-${id}`;
      const sign = liveSign(4.6); sign.set('AVAILABLE', C.textAvailable, '0/2 Players');
      sign.sprite.position.set(side * 29, 12.5, zc); root.add(sign.sprite);
      const half = (g, color) => { g.updateMatrixWorld(true); return { color, group: g, z: g.position.z, pad: g.localToWorld(g.userData.padLocal.clone()), barTex: g.userData.barTex }; };
      STATIONS.push({ id, side, z: zc, red: half(redG, 'red'), blue: half(blueG, 'blue'), sign });
    }
    // trees behind the playing places and in the gaps between them
    const plan = [['round', 'pine'], ['pine', 'round'], ['round', 'round'], ['pine', 'round'], ['round', 'pine']][k];
    plan.forEach((kind, i) => {
      const sx = i === 0 ? -1 : 1;
      for (const tz of [zc + 22, zc - 40]) {
        if (kind === 'round') roundTree(sx * 70, tz, 12 + (k % 2) * 2, root, 0, k + i);
        else pineTree(sx * 69, tz, 28 + (k % 3) * 2, root);
        kind = kind === 'round' ? 'pine' : 'round';
      }
    });
  }

  // plaza
  spawnPad(root);
  wheelSpin(root);
  nextUpdateBoard(root);
  packsStall(root);
  // order seen facing the boards: Time Played | statue | Top Wins | statue | Best Streak | statue
  leaderboard('Time Played', 'clock', C.lbTime, [['nova_77', '1d 4h'], ['pixelpine', '1d 1h'], ['emberfox', '23h 32m'], ['quietkoi', '22h 38m'], ['mintbyte', '21h 8m'], ['lumen_12', '19h 57m']], 30, 53, root);
  leaderboard('Top Wins', 'trophy', C.lbWins, [['tidewalker', '271'], ['orbit_jay', '207'], ['cobaltcat', '203'], ['fernly', '199'], ['zigzag42', '165'], ['moonbeam', '155']], 0, 37, root);
  leaderboard('Best Streak', 'flame', C.lbStreak, [['tidewalker', '269'], ['orbit_jay', '203'], ['fernly', '198'], ['cobaltcat', '179'], ['zigzag42', '110'], ['pebble_9', '83']], -30, 17, root);
  // pedestals between the boards (statues removed: the player is the only character)
  for (const x of [15, -15, -45]) pedestal(x, root);
  bridgeChallenge(root);
  // plaza trees, crates and step blocks — positions measured on top-down screenshots 38, 43, 44
  roundTree(-56, 64, 16, root, 0, 1);     // big round tree, back corner on the Packs side
  pineTree(-62, 44, 38, root);            // two tall pines behind the Packs stall
  pineTree(-62, 26, 36, root);
  pineTree(56, 70, 40, root);             // big pine in the back corner by the wheel
  pineTree(60, -6, 38, root);             // big pine in the front corner by Next Update
  roundTree(-66, -6, 10, root, 0, 3);
  crate(-56, 0, 54, 3.4, root, 0.4); crate(-53, 0, 56, 3, root, 0.1); crate(-55, 3.4, 54.5, 3, root, 0.6);   // crates under the big tree
  stepBlock(-46, 44, root, 0.2); stepBlock(-44, 30, root, -0.3, 1.2); stepBlock(-46, 2, root, 0.5, 0.8);
  crate(-56, 0, 34, 3.4, root, 0.3); crate(-52.6, 0, 33, 3.2, root, -0.2); crate(-55, 3.4, 33.6, 3, root, 0.7);
  crate(60, 0, 52, 3.6, root, 0.3); crate(58, 3.6, 52, 3, root, 0.6); crate(62, 0, 48.6, 3, root, -0.2);    // crates by the wheel
  crate(58, 0, 26, 3.4, root, 0.5, crateMatMauve); crate(60.5, 0, 23, 3, root, 0.1, crateMatMauve);           // crates between wheel and board
  // small grey slabs on the road median (visible in video / screenshots)
  const slab = mat('#c9d1d3');
  for (let z = -46, i = 0; z > WORLD.roadEndZ + 12; z -= 26, i++) {
    const x = [-4, 3, -1, 5, -5, 1, 4][i % 7];
    box(3.6, 0.7, 2.6, slab, x, 0.35, z, root, false); box(2.2, 0.6, 1.6, slab, x + 0.3, 1, z - 0.2, root, false);
  }
  pineTree(-15, WORLD.roadEndZ - 20, 24, root); pineTree(15, WORLD.roadEndZ - 20, 24, root);   // pines at the road end (screenshot 28)

  obbyStart(root);
  obby(root);
  castleIsland(root);

  // register colliders (boxes only)
  for (const m of SOLID) addCollider(m);
  const stats = mergeStatic(root);   // ~1000 meshes → one draw call per material
  if (import.meta.env.DEV) console.info('[world] static batch', stats);
  return root;
}
