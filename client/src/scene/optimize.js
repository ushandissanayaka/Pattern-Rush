// Static-geometry batching. The lobby is ~1000 small boxes / cones / blobs; drawn
// one by one that is >800 draw calls per pass (×3 passes with shadows + bloom).
// Every mesh that never moves is baked into world space and merged with all
// other meshes that use the same material, so each material is ONE draw call.
// Anything under an object with userData.dynamic = true (animated parts) is left alone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function isDynamic(o) {
  for (let p = o; p; p = p.parent) if (p.userData && p.userData.dynamic) return true;
  return false;
}

export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();     // material + shadow flags → { material, geos[], cast, receive }
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || Array.isArray(o.material) || isDynamic(o)) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { material: o.material, geos: [], cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    g.clearGroups();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    b.geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  const batch = new THREE.Group(); batch.name = 'static-batch';
  let merged = 0;
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, b.material);
    m.castShadow = b.cast; m.receiveShadow = b.receive; m.renderOrder = b.order;
    m.matrixAutoUpdate = false;
    batch.add(m); merged += b.geos.length;
  }
  root.add(batch);
  // static objects that could not be merged (multi-material boxes) never move either
  root.traverse((o) => { if (o.isMesh && !isDynamic(o) && o.parent !== batch) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
  return { merged, drawCalls: batch.children.length };
}
