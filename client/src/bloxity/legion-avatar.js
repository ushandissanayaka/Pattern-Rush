// Legion (Boxity) character for the lobby world.
// Loads the official rig (static.bloxity.io/avatars/player.glb), applies the
// player's skin texture, equipped body parts, hat and back item — the same
// approach as bloxity.io/test-game.html — and animates it procedurally.
//
// Animations are timed to the reference video (see docs/DESIGN.md §5):
//   walk  : arms + legs swing ±1.0 rad at 9 rad/s (≈0.70 s per stride)   [t=30–34s]
//   idle  : ±0.1 rad arm sway at 1 rad/s + breathing                      [t=0–27s]
//   jump  : arms raised overhead, legs straight, hop arc                   [t=70–72s, NPC]
//   airborne: same arms-up pose while your own character is in the air (Roblox R6 default)
//   cheer : both arms up (leaderboard statues)                             [t=72–74s]
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const LEGION_CDN = 'https://static.bloxity.io/avatars';
export const AVATAR_HEIGHT = 5.3; // studs — matches the avatar size in the video

const PART_MESH_NAMES = {
  head: 'default_head', arm_L: 'default_arm_L', arm_R: 'default_arm_R',
  leg_L: 'default_leg_L', leg_R: 'default_leg_R', torso: 'default_torso'
};
const SLOT_INFO = {
  head: { dir: 'head', suffix: '' }, torso: { dir: 'torso', suffix: '' },
  arm_L: { dir: 'arms', suffix: '_L' }, arm_R: { dir: 'arms', suffix: '_R' },
  leg_L: { dir: 'legs', suffix: '_L' }, leg_R: { dir: 'legs', suffix: '_R' }
};
const EQUIP_KEYS = { head: 'headId', torso: 'torsoId', arm_L: 'armLId', arm_R: 'armRId', leg_L: 'legLId', leg_R: 'legRId' };
const isEq = (id) => id !== null && id !== undefined && id !== '' && id !== '-1' && id !== 'undefined';

let basePromise = null;
function loadBase() {
  if (!basePromise) {
    basePromise = new Promise((resolve, reject) =>
      new GLTFLoader().load(`${LEGION_CDN}/player.glb`, resolve, undefined, reject));
  }
  return basePromise;
}

const texCache = new Map();
function loadSkinTexture(url) {
  if (!texCache.has(url)) {
    texCache.set(url, new Promise((resolve) => {
      new THREE.TextureLoader().load(url, (tex) => {
        tex.flipY = false;
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      }, undefined, () => resolve(null));
    }));
  }
  return texCache.get(url);
}

const X_AXIS = new THREE.Vector3(1, 0, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmpQ = new THREE.Quaternion();

export class LegionCharacter {
  /** @param {{skinUrl?:string, equipped?:object, tint?:string, castShadow?:boolean}} opts */
  constructor(opts = {}) {
    this.root = new THREE.Group();            // positioned / rotated by the world
    this.root.userData.class = 'avatar-3d legion-character';
    this.state = 'idle';                      // idle | walk | jump | cheer
    this.phase = Math.random() * 10;
    this.blend = 0;                           // 0 = idle, 1 = walk (smoothed)
    this.ready = false;
    this.opts = opts;
    this.equipped = {};
    this._loaded = this._build(opts);
  }

  async _build(opts) {
    const gltf = await loadBase();
    const model = SkeletonUtils.clone(gltf.scene);
    this.parts = {}; this.origGeos = {}; this.skeleton = null;
    const material = new THREE.MeshStandardMaterial({ color: opts.tint || '#ffffff', roughness: 0.9, metalness: 0 });
    this.material = material;
    model.traverse((c) => {
      if (!c.isSkinnedMesh) return;
      this.skeleton = this.skeleton || c.skeleton;
      c.material = material;
      c.castShadow = opts.castShadow !== false; c.receiveShadow = true;
      c.frustumCulled = false; // skinned bounds are bind-pose only
      for (const [slot, name] of Object.entries(PART_MESH_NAMES)) {
        if (c.name.toLowerCase() === name) { this.parts[slot] = c; this.origGeos[slot] = c.geometry; }
      }
    });
    this.bones = {};
    for (const b of this.skeleton.bones) this.bones[b.name] = { bone: b, q: b.quaternion.clone(), p: b.position.clone() };

    // normalise size: feet on y=0, height = AVATAR_HEIGHT studs
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const s = AVATAR_HEIGHT / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    this.model = model;
    this.root.add(model);
    this.ready = true;
    if (opts.skinUrl || !opts.tint) await this.setSkin(opts.skinUrl || `${LEGION_CDN}/skins/0.png`);
    if (opts.equipped) this.applyEquipped(opts.equipped);
    return this;
  }

  whenReady() { return this._loaded; }

  async setSkin(url) {
    const tex = await loadSkinTexture(url);
    if (tex && this.material) { this.material.map = tex; this.material.color.set('#ffffff'); this.material.needsUpdate = true; }
  }

  /** Apply Legion.SDK.avatar.getEquipped() output (body parts, hat, back). */
  applyEquipped(eq = {}) {
    if (!this.ready) { this.opts.equipped = eq; return; }
    const prev = this.equipped;
    for (const [slot, key] of Object.entries(EQUIP_KEYS)) if (eq[key] !== prev[key]) this._swapPart(slot, eq[key]);
    if (eq.hatId !== prev.hatId) this._attachObj('hat', 'hats', eq.hatId, 'Neck1', new THREE.Vector3(0, 0.8, 0));
    if (eq.hairId !== prev.hairId) this._attachObj('hair', 'hats', eq.hairId, 'Neck1', new THREE.Vector3(0, 0.8, 0));
    if (eq.backId !== prev.backId) this._attachObj('back', 'back', eq.backId, 'Spine2', new THREE.Vector3());
    this.equipped = { ...eq };
  }

  _swapPart(slot, id) {
    const target = this.parts[slot];
    if (!target) return;
    if (!isEq(id)) { target.geometry = this.origGeos[slot]; return; }
    const info = SLOT_INFO[slot];
    new GLTFLoader().load(`${LEGION_CDN}/parts/${info.dir}/${id}${info.suffix}.glb`, (g) => {
      let sm = null, rm = null;
      g.scene.traverse((c) => { if (c.isSkinnedMesh && !sm) sm = c; else if (c.isMesh && !rm) rm = c; });
      if (!sm) { if (rm) target.geometry = rm.geometry; return; }
      const geo = sm.geometry.clone();
      const idx = new Map(this.skeleton.bones.map((b, i) => [b.name, i]));
      const remap = new Map();
      sm.skeleton.bones.forEach((b, i) => { const j = idx.get(b.name); if (j !== undefined) remap.set(i, j); });
      const si = geo.getAttribute('skinIndex');
      if (si) { for (let i = 0; i < si.array.length; i++) { const m = remap.get(si.array[i]); if (m !== undefined) si.array[i] = m; } si.needsUpdate = true; }
      target.geometry = geo;
    }, undefined, (e) => console.warn(`[legion] part ${slot}/${id} failed`, e));
  }

  _attachObj(key, dir, id, boneName, offset) {
    this[key]?.parent?.remove(this[key]); this[key] = null;
    if (!isEq(id)) return;
    new OBJLoader().load(`${LEGION_CDN}/items/${dir}/${id}.obj`, (obj) => {
      const tex = new THREE.TextureLoader().load(`${LEGION_CDN}/textures/${dir}/${id}.png`, (t) => {
        t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
      });
      obj.traverse((c) => { if (c.isMesh) { c.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }); c.castShadow = true; } });
      obj.position.copy(offset);
      (this.bones[boneName]?.bone || this.model).add(obj);
      this[key] = obj;
    }, undefined, (e) => console.warn(`[legion] ${key} ${id} failed`, e));
  }

  /** Per-frame pose. speed: horizontal speed in studs/s (0 = standing). */
  update(dt, speed = 0) {
    if (!this.ready) return;
    const moving = speed > 0.5 && this.state !== 'jump' && this.state !== 'cheer';
    this.blend += ((moving ? 1 : 0) - this.blend) * (1 - Math.exp(-dt * 10));
    this.phase += dt;
    const t = this.phase, B = this.bones;
    for (const k in B) { B[k].bone.quaternion.copy(B[k].q); B[k].bone.position.copy(B[k].p); }
    const rot = (name, axis, a) => { const b = B[name]; if (b) b.bone.quaternion.multiply(tmpQ.setFromAxisAngle(axis, a)); };

    if (this.state === 'cheer') {                      // leaderboard statues: arms up, slow wave
      const w = Math.sin(t * 2.2) * 0.12;
      rot('ArmL_Offset', X_AXIS, Math.PI * 0.92 + w); rot('ArmR_Offset', X_AXIS, Math.PI * 0.92 - w);
      return;
    }
    if (this.state === 'airborne') {                   // your own jump / fall: R6 arms-up pose
      rot('ArmL_Offset', X_AXIS, Math.PI); rot('ArmR_Offset', X_AXIS, Math.PI);
      return;
    }
    if (this.state === 'jump') {                       // R6 jump pose + hop (NPC on pedestal)
      const hop = Math.abs(Math.sin(t * Math.PI / 0.75));
      this.model.parent.position.y = this.baseY + hop * 3.2;
      rot('ArmL_Offset', X_AXIS, Math.PI); rot('ArmR_Offset', X_AXIS, Math.PI);
      return;
    }
    // walk (amplitude 1 rad, 9 rad/s) blended with idle (0.1 rad, 1 rad/s)
    const walk = Math.sin(t * 9) * 1.0 * this.blend;
    const idle = Math.sin(t * 1.0) * 0.1 * (1 - this.blend);
    rot('ArmL_Offset', X_AXIS, walk + idle); rot('ArmR_Offset', X_AXIS, -walk - idle);
    rot('LegL_Offset', X_AXIS, -walk); rot('LegR_Offset', X_AXIS, walk);
    const breathe = Math.sin(t * 1.8) * 0.015 * (1 - this.blend);
    if (B.Spine2) B.Spine2.bone.position.y += breathe * 0.5;
    rot('Spine1', Z_AXIS, Math.sin(t * 0.7) * 0.015 * (1 - this.blend));
  }

  setState(s) {
    if (s === this.state) return;
    this.state = s;
    if (s === 'jump') this.baseY = this.root.position.y;
  }
}
