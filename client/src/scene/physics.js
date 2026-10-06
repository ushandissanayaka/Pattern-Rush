// Tiny character physics for the lobby (client-side feel only — the server will
// own real movement later). Everything collidable is an axis-aligned box:
//   - a box whose top is within STEP_UP of your feet is ground you can stand on
//   - a taller box blocks you horizontally (pushed out along the shallow axis)
//   - "kill" boxes (obby lasers) send you back to the last checkpoint
// Boxes are registered with addCollider(mesh) after the world is built; the
// world-space AABB is computed once, so colliders must be static.
import * as THREE from 'three';

export const PLAYER = { radius: 1.3, height: 5.3, stepUp: 2.2 };
const colliders = [];   // { box: Box3, kill: bool, checkpoint?: Vector3 }
const tmpBox = new THREE.Box3();

// Broad phase: uniform XZ grid so each query only checks boxes in nearby cells
// (the world has ~1000 colliders; the player touches a handful at a time).
const CELL = 24;
const grid = new Map();
let gridDirty = true, stamp = 0;
const cellKey = (i, j) => i * 73856093 ^ j * 19349663;
function rebuildGrid() {
  grid.clear();
  colliders.forEach((c, idx) => {
    c.mark = 0;
    const b = c.box;
    for (let i = Math.floor(b.min.x / CELL); i <= Math.floor(b.max.x / CELL); i++)
      for (let j = Math.floor(b.min.z / CELL); j <= Math.floor(b.max.z / CELL); j++) {
        const k = cellKey(i, j);
        let list = grid.get(k); if (!list) grid.set(k, list = []);
        list.push(c);
      }
  });
  gridDirty = false;
}
const nearList = [];
/** Colliders whose cells overlap the XZ rectangle (deduplicated). */
function near(minX, minZ, maxX, maxZ) {
  if (gridDirty) rebuildGrid();
  nearList.length = 0; stamp++;
  for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++)
    for (let j = Math.floor(minZ / CELL); j <= Math.floor(maxZ / CELL); j++) {
      const list = grid.get(cellKey(i, j));
      if (list) for (const c of list) if (c.mark !== stamp) { c.mark = stamp; nearList.push(c); }
    }
  return nearList;
}

/** Register a static mesh (or group) as solid. opts: { kill, checkpoint, pad } */
export function addCollider(object, opts = {}) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (opts.pad) box.expandByScalar(opts.pad);
  colliders.push({ box, kill: !!opts.kill, checkpoint: opts.checkpoint || null });
  gridDirty = true;
  return box;
}
/** Register a raw world-space box (for spheres / decorative meshes with simpler hit shapes). */
export function addColliderBox(center, size, opts = {}) {
  const box = new THREE.Box3().setFromCenterAndSize(center, size);
  colliders.push({ box, kill: !!opts.kill, checkpoint: opts.checkpoint || null });
  gridDirty = true;
  return box;
}
export function colliderCount() { return colliders.length; }

/** Highest walkable surface under (x,z) that is not above feetY + stepUp, or -Infinity. */
export function groundHeight(x, z, feetY, r = PLAYER.radius * 0.6) {
  let best = -Infinity;
  for (const c of near(x - r, z - r, x + r, z + r)) {
    if (c.kill) continue;
    const b = c.box;
    if (x < b.min.x - r || x > b.max.x + r || z < b.min.z - r || z > b.max.z + r) continue;
    if (b.max.y <= feetY + PLAYER.stepUp && b.max.y > best) best = b.max.y;
  }
  return best;
}

/**
 * Move a character: pos (feet) is updated in place.
 * Returns { grounded, killed, checkpoint } — checkpoint is set when standing on one.
 */
export function moveCharacter(pos, vel, dt) {
  const res = { grounded: false, killed: false, checkpoint: null };
  // horizontal
  pos.x += vel.x * dt; pos.z += vel.z * dt;
  const r = PLAYER.radius;
  for (const c of near(pos.x - r - 1, pos.z - r - 1, pos.x + r + 1, pos.z + r + 1).slice()) {
    const b = c.box;
    if (c.kill) {                          // touching a laser anywhere on the body
      if (pos.x > b.min.x - r && pos.x < b.max.x + r && pos.z > b.min.z - r && pos.z < b.max.z + r &&
          b.max.y > pos.y && b.min.y < pos.y + PLAYER.height) res.killed = true;
      continue;
    }
    if (b.max.y <= pos.y + PLAYER.stepUp || b.min.y >= pos.y + PLAYER.height) continue; // walkable or overhead
    const cx = THREE.MathUtils.clamp(pos.x, b.min.x, b.max.x), cz = THREE.MathUtils.clamp(pos.z, b.min.z, b.max.z);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {                       // outside the box: push along the contact normal
      const d = Math.sqrt(d2), push = r - d;
      pos.x += dx / d * push; pos.z += dz / d * push;
    } else {                               // centre inside: leave by the shallowest side
      const opts = [[b.min.x - r - pos.x, 0], [b.max.x + r - pos.x, 0], [0, b.min.z - r - pos.z], [0, b.max.z + r - pos.z]];
      opts.sort((a, b2) => Math.abs(a[0] + a[1]) - Math.abs(b2[0] + b2[1]));
      pos.x += opts[0][0]; pos.z += opts[0][1];
    }
  }
  // vertical
  pos.y += vel.y * dt;
  const g = groundHeight(pos.x, pos.z, Math.max(pos.y, pos.y - vel.y * dt));
  if (vel.y <= 0 && pos.y <= g + 0.05 && g > -Infinity) {
    pos.y = g; vel.y = 0; res.grounded = true;
    for (const c of near(pos.x - 1, pos.z - 1, pos.x + 1, pos.z + 1)) {
      const b = c.box;
      if (Math.abs(b.max.y - g) < 0.01 && pos.x >= b.min.x - 0.8 && pos.x <= b.max.x + 0.8 && pos.z >= b.min.z - 0.8 && pos.z <= b.max.z + 0.8) {
        if (c.checkpoint) res.checkpoint = c.checkpoint;
      }
    }
  }
  // bonk head on ceilings
  if (vel.y > 0) {
    for (const c of near(pos.x - 1, pos.z - 1, pos.x + 1, pos.z + 1)) {
      const b = c.box;
      if (pos.x > b.min.x && pos.x < b.max.x && pos.z > b.min.z && pos.z < b.max.z &&
          b.min.y > pos.y + PLAYER.stepUp && b.min.y < pos.y + PLAYER.height) { vel.y = 0; break; }
    }
  }
  return res;
}

const ray = new THREE.Ray(), hit = new THREE.Vector3();
/** Camera occlusion (Roblox "Zoom" behaviour): distance to the first box between focus and camera. */
export function cameraClearance(focus, camPos, maxDist) {
  ray.origin.copy(focus);
  ray.direction.subVectors(camPos, focus).normalize();
  let best = maxDist;
  const ex = camPos.x, ez = camPos.z;
  for (const c of near(Math.min(focus.x, ex), Math.min(focus.z, ez), Math.max(focus.x, ex), Math.max(focus.z, ez))) {
    if (c.kill) continue;
    tmpBox.copy(c.box);
    if (tmpBox.containsPoint(focus)) continue;
    if (ray.intersectBox(tmpBox, hit)) {
      const d = hit.distanceTo(focus) - 0.6;
      if (d < best) best = Math.max(0.5, d);
    }
  }
  return best;
}
