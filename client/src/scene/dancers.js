// Three Legion characters dancing in step on the glowing pedestals between the leaderboards.
// Cost control: a dancer is only drawn and posed while its pedestal is on screen and within
// DRAW_DISTANCE; otherwise it is hidden and skipped entirely (no draw calls, no bone updates).
import * as THREE from 'three';
import { LegionCharacter, LEGION_CDN } from '../bloxity/legion-avatar.js';

const SKINS = [3, 7, 12];
const DRAW_DISTANCE = 260;
const SCALE = 1.5;                       // taller than players so they read from across the plaza

export function createDancers(scene, spots) {
  const dancers = spots.map((spot, i) => {
    const character = new LegionCharacter({ skinUrl: `${LEGION_CDN}/skins/${SKINS[i % SKINS.length]}.png` });
    character.root.position.copy(spot);
    character.root.rotation.y = Math.PI;                    // face the plaza
    character.root.scale.setScalar(SCALE);
    character.root.userData.class = 'avatar-3d legion-character dancer';
    character.setState('dance');
    scene.add(character.root);
    // covers the raised arms and the shadow on the pedestal top
    return { character, bounds: new THREE.Sphere(spot.clone().add(new THREE.Vector3(0, 4.5, 0)), 7 * SCALE) };
  });
  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4();

  return {
    update(dt, camera) {
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection);
      for (const { character, bounds } of dancers) {
        const visible = frustum.intersectsSphere(bounds) && camera.position.distanceTo(bounds.center) < DRAW_DISTANCE;
        character.root.visible = visible;
        if (visible) character.update(dt, 0);
      }
    }
  };
}
