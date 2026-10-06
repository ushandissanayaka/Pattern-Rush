// Post-processing: Neon glow in ONE scene pass (the old selective bloom drew the
// whole scene twice per frame). Neon materials are emissive enough to go above
// the bloom threshold in the half-float buffer; sunlit white walls stay just
// under it, so only neon parts glow (booth trims, lasers, pedestal tops,
// spawn-pad line, wheel circle). Bloom mips run at half resolution.
// Low-power devices skip post-processing entirely.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Brightest non-neon surface (sunlit white, measured) stays below this; neon is pushed above it
export const BLOOM_THRESHOLD = 1.35;

export function lowPowerDevice() {
  return (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820) || (navigator.hardwareConcurrency || 8) <= 4;
}

export function createPost(renderer, scene, camera, enabled = !lowPowerDevice()) {
  if (!enabled) return { render: () => renderer.render(scene, camera), setSize() {}, enabled: false };
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.2, BLOOM_THRESHOLD);
  // Threshold on the brightest colour channel instead of luminance, so red / blue
  // neon needs the same small boost as green / white (luminance would need ~9× for red).
  bloom.materialHighPassFilter.fragmentShader = `
    uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity;
    uniform float luminosityThreshold; uniform float smoothWidth; varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float v = max(texel.r, max(texel.g, texel.b));
      float a = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
      gl_FragColor = mix(vec4(defaultColor, defaultOpacity), texel, a);
    }`;
  bloom.materialHighPassFilter.needsUpdate = true;
  bloom.highPassUniforms.smoothWidth.value = 0.25;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    enabled: true, bloom,
    render: () => composer.render(),
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  };
}
