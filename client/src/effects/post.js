// Post-processing: Neon glow in ONE scene pass (the old selective bloom drew the
// whole scene twice per frame). Neon materials are emissive enough to go above
// the bloom threshold in the half-float buffer; sunlit white walls stay just
// under it, so only neon parts glow (booth trims, lasers, pedestal tops,
// spawn-pad line, wheel circle). Bloom mips run at half resolution.
// Low-power devices skip post-processing entirely.
// The glow is a wide blur, so its mip chain runs at half the usual bloom resolution
// (a quarter of the screen); that looks the same and is the biggest GPU saving.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Brightest non-neon surface (sunlit white, measured) stays below this; neon is pushed above it
export const BLOOM_THRESHOLD = 1.35;
const BLOOM_SCALE = 0.5;

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
  // UnrealBloomPass ends by blending the glow back into the multisampled HDR scene target —
  // a full-screen MSAA write plus another resolve, the single most expensive step on
  // integrated GPUs. Skip that blend and let the output pass add the glow while it writes
  // to the screen. Same math as the additive blend (SRC_ALPHA, ONE): rgb += glow.rgb * glow.a.
  const output = new OutputPass();
  const fs = output.material.fragmentShader
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\n\t\tuniform sampler2D tBloom;')
    .replace('gl_FragColor = texture2D( tDiffuse, vUv );',
      'gl_FragColor = texture2D( tDiffuse, vUv );\n\t\t\tvec4 glow = texture2D( tBloom, vUv );\n\t\t\tgl_FragColor.rgb += glow.rgb * glow.a;');
  if (fs.includes('tBloom, vUv')) {          // three's OutputShader as expected; otherwise keep the stock blend
    output.uniforms.tBloom = { value: bloom.renderTargetsHorizontal[0].texture };
    output.material.fragmentShader = fs;
    const quad = bloom.fsQuad, quadRender = quad.render.bind(quad);
    quad.render = (r) => { if (quad.material !== bloom.blendMaterial) quadRender(r); };
  }
  composer.addPass(output);
  return {
    enabled: true, bloom,
    render: () => composer.render(),
    setSize(w, h) {
      const pr = renderer.getPixelRatio();
      composer.setPixelRatio(pr); composer.setSize(w, h);
      bloom.setSize(Math.max(1, Math.round(w * pr * BLOOM_SCALE)), Math.max(1, Math.round(h * pr * BLOOM_SCALE)));
    }
  };
}
