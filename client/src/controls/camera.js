// Player-controlled camera (Roblox "Classic" style). Nothing moves the camera
// automatically — only the player's mouse, touchpad, touch screen or keys.
//
//   Mouse      : left / right drag = orbit, wheel = zoom
//   Touchpad   : click-drag = orbit, two-finger scroll up/down = zoom,
//                two-finger swipe left/right = orbit, pinch = zoom
//   Touch      : one-finger drag on the world = orbit, two-finger pinch = zoom
//   Keyboard   : I / O = zoom, , / . = orbit
//
// Orbit target = avatar head. FOV 70°, zoom 0.5 (first person) .. 400 studs —
// the same ranges seen in the reference video.
import * as THREE from 'three';

export const CAMERA_LIMITS = { minDist: 0.5, maxDist: 190, minPitch: -80, maxPitch: 80, fov: 70, headHeight: 4.5 };
// Start framing: behind the avatar, looking down the road toward the castle.
export const CAMERA_START = { yaw: 0, pitch: 15, dist: 22 };

const ROTATE_SPEED = 0.35;      // degrees per pixel dragged (horizontal)
const PITCH_SPEED = 0.3;        // degrees per pixel dragged (vertical)
const WHEEL_ZOOM = 0.0016;      // mouse wheel / two-finger scroll
const PINCH_ZOOM = 0.01;        // trackpad pinch (wheel + ctrlKey) is finer-grained
const SWIPE_ORBIT = 0.25;       // trackpad horizontal swipe, degrees per pixel

function lerpAngle(a, b, k) { const d = ((b - a + 540) % 360) - 180; return a + d * k; }

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    const s = CAMERA_START;
    this.yaw = s.yaw; this.pitch = s.pitch; this.dist = s.dist;
    this.target = { ...s };
    this.focus = new THREE.Vector3();
    this.damping = 12;
    this.enabled = true;
    this._bindInput(dom);
  }

  orbit(dYaw, dPitch) {
    this.target.yaw += dYaw;
    this.target.pitch = THREE.MathUtils.clamp(this.target.pitch + dPitch, CAMERA_LIMITS.minPitch, CAMERA_LIMITS.maxPitch);
  }
  zoomBy(factor) {
    this.target.dist = THREE.MathUtils.clamp(this.target.dist * factor, CAMERA_LIMITS.minDist, CAMERA_LIMITS.maxDist);
  }

  _bindInput(dom) {
    const pointers = new Map();           // active pointers on the world canvas
    let pinchStart = 0, pinchDist = 0;

    dom.addEventListener('contextmenu', (e) => e.preventDefault()); // right-drag orbit
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dom.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y); pinchDist = this.target.dist;
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('lostpointercapture', end);
    dom.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || !this.enabled) return;
      if (pointers.size === 1) {
        this.orbit(-(e.clientX - p.x) * ROTATE_SPEED, (e.clientY - p.y) * PITCH_SPEED);
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2 && pinchStart > 0) {           // touch pinch zoom
        const [a, b] = [...pointers.values()];
        const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        this.target.dist = THREE.MathUtils.clamp(pinchDist * (pinchStart / d), CAMERA_LIMITS.minDist, CAMERA_LIMITS.maxDist);
      }
    });

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      // normalise line / page deltas (Firefox, some mice) to pixels
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const dy = e.deltaY * unit, dx = e.deltaX * unit;
      if (e.ctrlKey) this.zoomBy(Math.exp(dy * PINCH_ZOOM));   // trackpad pinch
      else {
        this.zoomBy(Math.exp(dy * WHEEL_ZOOM));                 // wheel / two-finger scroll
        if (Math.abs(dx) > Math.abs(dy)) this.orbit(-dx * SWIPE_ORBIT, 0); // two-finger sideways swipe
      }
    }, { passive: false });
    // stop Safari's page pinch-zoom from stealing trackpad / touch pinches
    for (const ev of ['gesturestart', 'gesturechange']) dom.addEventListener(ev, (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.closest?.('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (k === 'i') this.zoomBy(0.8);
      else if (k === 'o') this.zoomBy(1.25);
      else if (k === ',') this.orbit(10, 0);
      else if (k === '.') this.orbit(-10, 0);
    });
  }

  update(dt, focusFeet) {
    const k = 1 - Math.exp(-this.damping * dt);
    this.yaw = lerpAngle(this.yaw, this.target.yaw, k);
    this.pitch += (this.target.pitch - this.pitch) * k;
    this.dist = Math.exp(Math.log(this.dist) + (Math.log(this.target.dist) - Math.log(this.dist)) * k);
    this.focus.set(focusFeet.x, focusFeet.y + CAMERA_LIMITS.headHeight, focusFeet.z);
    const y = THREE.MathUtils.degToRad(this.yaw), p = THREE.MathUtils.degToRad(this.pitch);
    const place = (d) => this.camera.position.set(
      this.focus.x + Math.sin(y) * Math.cos(p) * d,
      this.focus.y + Math.sin(p) * d,
      this.focus.z + Math.cos(y) * Math.cos(p) * d);
    place(this.dist);
    // Roblox-style occlusion: pull the camera in front of walls between it and the
    // avatar, then ease back out once the view is clear (the zoom setting is untouched).
    let d = this.dist;
    if (this.clearance && this.dist > 1.2) d = this.clearance(this.focus, this.camera.position, this.dist);
    this.effDist = this.effDist === undefined ? d : (d < this.effDist ? d : this.effDist + (d - this.effDist) * (1 - Math.exp(-6 * dt)));
    if (this.effDist < this.dist - 0.01) place(this.effDist);
    if (this.camera.position.y < 0.6) this.camera.position.y = 0.6; // never clip under the ground
    this.camera.lookAt(this.focus);
    return this.dist < 1.2; // first-person: caller hides the avatar
  }
}
