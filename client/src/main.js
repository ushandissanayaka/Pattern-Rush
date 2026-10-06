// Cipher Clash — Phase 0 client entry. Renders the lobby world, your Legion
// character, and the camera. No game logic, networking or login (docs/GAME_SPEC.md §9).
import * as THREE from 'three';
import { buildWorld, tickWorld, BILLBOARDS, WORLD, CONVEYORS, CONVEYOR_SPEED } from './scene/world.js';
import { createSky } from './scene/sky.js';
import { moveCharacter, cameraClearance } from './scene/physics.js';
import { createPost, lowPowerDevice } from './effects/post.js';
import { CameraRig, CAMERA_LIMITS } from './controls/camera.js';
import { initHud } from './ui/hud.js';
import { LegionCharacter } from './bloxity/legion-avatar.js';
import { startLegion, onLocalPlayerChanged, getLocalPlayer } from './bloxity/legion-sdk.js';
import { createMatchSystem } from './game/match.js';

const canvas = document.getElementById('world-canvas');
const LOW = lowPowerDevice();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Adaptive resolution: start at up to 1.5× (2× is rarely visible but costs ~78 % more
// pixels) and step down / up to hold ~60 fps (see the frame loop below).
const FIXED_PR = parseFloat(new URLSearchParams(location.search).get('pr'));   // ?pr=1 pins resolution (screenshots)
// Never drop below 1× on desktop (that is what made the scene look soft / blurry).
const MAX_PR = FIXED_PR || Math.min(devicePixelRatio, LOW ? 1.25 : 2), MIN_PR = FIXED_PR || (LOW ? Math.min(0.8, MAX_PR) : 1);
let pixelRatio = MAX_PR;
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // Roblox look: saturated, untonemapped
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // filtered (radius) but much cheaper than PCFSoft

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA_LIMITS.fov, 1, 0.3, 3000);

// Lighting: bright midday sun from the front-left, soft shadows (Roblox ShadowMap look)
// Afternoon sun (lower than noon → longer, clearer shadows, as in the screenshots)
const SUN_DIR = new THREE.Vector3(0.6, 0.66, 0.42).normalize();
// Calibrated so an upward face renders at its palette colour (like Roblox):
// (hemi + sun·cosθ) / π ≈ 1. Shadowed ground keeps only the hemisphere fill (≈ 58 % in sRGB).
const HEMI = 1.0, UP_LIGHT = 3.06;
scene.add(new THREE.HemisphereLight('#ffffff', '#c9d2cc', HEMI));
const sun = new THREE.DirectionalLight('#fffaf0', (UP_LIGHT - HEMI) / SUN_DIR.y);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 700 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 1.4;   // soft Roblox-like edges
scene.add(sun, sun.target);
const sky = createSky(scene, SUN_DIR);
const post = createPost(renderer, scene, camera, !LOW && !location.search.includes('nobloom'));

startLegion();
await document.fonts.ready; // billboards are drawn to canvas with web fonts
await Promise.all(["400 40px 'Luckiest Guy'", "700 40px 'Fredoka'", "600 40px 'Fredoka'", "900 40px 'Montserrat'", "800 40px 'Montserrat'"].map(f => document.fonts.load(f).catch(() => {})));
buildWorld(scene);

// --- your Legion character (skin + equipped parts from Legion.SDK) ---
const me = new LegionCharacter({});
me.root.userData.class = 'avatar-3d avatar-3d--me legion-character';
scene.add(me.root);
// No name tag on your own avatar (matches the video: only other players show one).
onLocalPlayerChanged((p) => {
  me.setSkin(p.skinUrl);
  me.applyEquipped(p.equipped);
  if (p.proportions && p.proportions.height) me.root.scale.set(1, p.proportions.height, 1);
  window.dispatchEvent(new CustomEvent('cc:player', { detail: p }));
});

const rig = new CameraRig(camera, canvas);
// Spawn on the spawn pad facing the castle. The camera is fully player-controlled.
const state = { heading: Math.PI, grounded: true, checkpoint: WORLD.spawn.clone(), inObby: false };
const feet = WORLD.spawn.clone();
const prevFeet = new THREE.Vector3().copy(feet);
const vel = new THREE.Vector3();
rig.clearance = (focus, camPos, dist) => cameraClearance(focus, camPos, dist);

function respawn(at = WORLD.spawn, faceCastle = true) {
  feet.copy(at); vel.set(0, 0, 0); prevFeet.copy(feet);
  if (faceCastle) { state.heading = Math.PI; me.root.rotation.y = Math.PI; }
  window.dispatchEvent(new CustomEvent('cc:respawn'));
}
// HUD "RETURN TO LOBBY" (shown while you are on the obby side)
window.addEventListener('cc:return-to-lobby', () => { state.checkpoint.copy(WORLD.spawn); respawn(); });

// --- walking (WASD / arrows / joystick, Space = jump) with simple box collisions.
// Client-side feel only; the server will own movement when multiplayer lands.
const keys = new Set();
const WALK_SPEED = 16, JUMP_V = 50, GRAVITY = 196.2; // Roblox defaults (studs, s)
const touchControls = document.getElementById('touch-controls');
const touchStick = document.getElementById('touch-stick');
const touchStickThumb = document.getElementById('touch-stick-thumb');
const touchJump = document.getElementById('touch-jump');
const touchInput = { x: 0, y: 0, jump: false, stickPointer: null, jumpPointer: null };
if (navigator.maxTouchPoints > 0) touchControls.hidden = false;

function updateTouchStick(e) {
  const bounds = touchStick.getBoundingClientRect();
  const radius = bounds.width * 0.32;
  const dx = e.clientX - (bounds.left + bounds.width / 2);
  const dy = e.clientY - (bounds.top + bounds.height / 2);
  const distance = Math.hypot(dx, dy);
  const scale = distance > radius ? radius / distance : 1;
  const x = dx * scale, y = dy * scale;
  touchInput.x = x / radius;
  touchInput.y = y / radius;
  touchStickThumb.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
}

function resetTouchStick() {
  touchInput.x = 0; touchInput.y = 0; touchInput.stickPointer = null;
  touchStickThumb.style.transform = 'translate(-50%, -50%)';
}

touchStick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touchInput.stickPointer = e.pointerId;
  touchStick.setPointerCapture(e.pointerId);
  updateTouchStick(e);
});
touchStick.addEventListener('pointermove', (e) => {
  if (e.pointerId === touchInput.stickPointer) updateTouchStick(e);
});
touchStick.addEventListener('pointerup', (e) => {
  if (e.pointerId === touchInput.stickPointer) resetTouchStick();
});
touchStick.addEventListener('pointercancel', resetTouchStick);

touchJump.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touchInput.jumpPointer = e.pointerId;
  touchInput.jump = true;
  touchJump.setPointerCapture(e.pointerId);
});
function releaseTouchJump(e) {
  if (e.pointerId !== touchInput.jumpPointer) return;
  touchInput.jumpPointer = null;
  touchInput.jump = false;
}
touchJump.addEventListener('pointerup', releaseTouchJump);
touchJump.addEventListener('pointercancel', releaseTouchJump);

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input,textarea,select,button')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
    keys.add(k); e.preventDefault();
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => {
  keys.clear(); resetTouchStick(); touchInput.jump = false; touchInput.jumpPointer = null;
});

function walk(dt) {
  const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - touchInput.y;
  const r = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + touchInput.x;
  const inputLength = Math.hypot(f, r);
  vel.x = 0; vel.z = 0; state.inputSpeed = 0;
  if (inputLength > 0.12 && rig.enabled) {
    const yaw = THREE.MathUtils.degToRad(rig.yaw);
    // camera looks along -(sin yaw, cos yaw); right = (cos yaw, -sin yaw)
    const dx = -Math.sin(yaw) * f + Math.cos(yaw) * r, dz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
    const sp = Math.min(inputLength, 1) * WALK_SPEED / inputLength;
    vel.x = dx * sp; vel.z = dz * sp;
    state.heading = Math.atan2(dx, dz);
    state.inputSpeed = Math.min(inputLength, 1) * WALK_SPEED;
  }
  // conveyor road: standing on a chevron strip carries you in the arrow direction
  state.onConveyor = false;
  if (feet.y < 0.6) {
    for (const c of CONVEYORS) {
      if (feet.x >= c.minX && feet.x <= c.maxX && feet.z >= c.minZ && feet.z <= c.maxZ) {
        vel.x += c.dx * CONVEYOR_SPEED; vel.z += c.dz * CONVEYOR_SPEED; state.onConveyor = true; break;
      }
    }
  }
  if ((keys.has(' ') || touchInput.jump) && state.grounded && rig.enabled) vel.y = JUMP_V;
  vel.y = Math.max(vel.y - GRAVITY * dt, -160);
  const res = moveCharacter(feet, vel, dt);
  state.grounded = res.grounded;
  if (res.checkpoint) state.checkpoint.copy(res.checkpoint);
  if (res.killed) respawn(state.checkpoint, false);             // obby laser
  else if (feet.y < WORLD.killY) respawn(state.checkpoint.z < WORLD.roadEndZ ? state.checkpoint : WORLD.spawn, false); // fell off
  const inObby = feet.z < WORLD.roadEndZ;
  if (inObby !== state.inObby) { state.inObby = inObby; window.dispatchEvent(new CustomEvent('cc:zone', { detail: inObby ? 'obby' : 'lobby' })); }
}

// Camera is paused while a modal / match screen is open (no stray orbiting behind panels).

initHud();
if (import.meta.env.DEV) window.__cc = { rig, feet, vel, state, respawn, renderer, scene, sun, me, get pixelRatio() { return pixelRatio; } }; // dev-only debug handle (tests)

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); post.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas); resize();

const match = createMatchSystem({ scene, camera, me, feet, state, getName: () => getLocalPlayer().name });
if (import.meta.env.DEV) window.__match = match;
const clock = new THREE.Clock();
const wp = new THREE.Vector3(), shadowFocus = new THREE.Vector3();
const perf = { t: 0, n: 0, last: 0 };
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  prevFeet.copy(feet);
  match.update(dt);
  rig.enabled = !match.cameraActive() && document.body.dataset.screen === 'lobby';
  if (!match.locksPlayer()) walk(dt);
  else { vel.set(0, 0, 0); state.grounded = true; state.inputSpeed = 0; }

  // smooth turning toward the movement heading (Roblox AutoRotate)
  if (!match.ownsAvatar()) {
    const cur = me.root.rotation.y, d = Math.atan2(Math.sin(state.heading - cur), Math.cos(state.heading - cur));
    me.root.rotation.y = cur + d * (1 - Math.exp(-dt * 14));
    me.root.position.copy(feet);
    // walk animation follows your own input, not the conveyor (standing still on a belt = idle)
    me.setState(state.grounded ? 'idle' : 'airborne');
    me.update(dt, state.grounded ? state.inputSpeed : 0);
  }
  tickWorld(dt, camera);

  if (match.cameraActive()) { match.updateCamera(dt); me.root.visible = true; }
  else { const firstPerson = rig.update(dt, feet); me.root.visible = !firstPerson; }
  // shadow frustum follows the player, snapped to whole shadow texels so edges don't shimmer
  const span = rig.dist > 110 ? 200 : rig.dist > 50 ? 130 : 90;
  if (sun.shadow.camera.right !== span) {
    sun.shadow.camera.left = sun.shadow.camera.bottom = -span;
    sun.shadow.camera.right = sun.shadow.camera.top = span;
    sun.shadow.camera.updateProjectionMatrix();
  }
  const texel = (2 * span) / sun.shadow.mapSize.x;
  shadowFocus.set(Math.round(feet.x / texel) * texel, 0, Math.round(feet.z / texel) * texel);
  sun.position.copy(shadowFocus).addScaledVector(SUN_DIR, 300); sun.target.position.copy(shadowFocus);
  sky.update(dt, camera);
  // billboards fade out inside ~16–36 studs of the camera so they never fill the screen
  for (const b of BILLBOARDS) {
    b.getWorldPosition(wp);
    b.material.opacity = THREE.MathUtils.smoothstep(wp.distanceTo(camera.position), 16, 36);
  }
  post.render();

  // adaptive resolution: average frame time over ~1 s, step pixel ratio by 0.15
  perf.t += clock.elapsedTime - perf.last; perf.last = clock.elapsedTime; perf.n++;
  if (perf.t >= 1) {
    const ms = (perf.t / perf.n) * 1000; perf.t = 0; perf.n = 0;
    let next = pixelRatio;
    if (ms > 22 && pixelRatio > MIN_PR) next = Math.max(MIN_PR, pixelRatio - 0.15);
    else if (ms < 13 && pixelRatio < MAX_PR) next = Math.min(MAX_PR, pixelRatio + 0.15);
    if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(pixelRatio); resize(); }
  }
});
document.body.dataset.ready = '1';
