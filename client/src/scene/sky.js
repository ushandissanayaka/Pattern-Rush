// Sky + void, matched to the Roblox default atmosphere in the reference screenshots.
// The colour depends only on the VIEW DIRECTION, exactly like the game:
//   looking up     → deep blue (#0157d7) with wispy white clouds
//   at the horizon → pale cyan → whitish haze band (#d5d7d6)
//   looking down   → greys that darken with angle (#bbbdbc → #666767 → #4e4e4e)
// So a low camera shows blue sky, a high camera looking down shows the grey void.
import * as THREE from 'three';

export const SKY = {
  zenith: '#0157d7', high: '#1a7de9', mid: '#44a6e8', low: '#9ccfe0',
  horizon: '#d5d7d6', below1: '#b9bbba', below2: '#8d908f', below3: '#666767', nadir: '#4e4e4e',
  fog: '#cfd4d3'
};

const vert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }`;

const frag = /* glsl */`
  uniform vec3 zenith, high, mid, low, horizon, below1, below2, below3, nadir;
  uniform vec3 sunDir;
  uniform float time;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
    return v;
  }
  vec3 ramp(float y) {
    if (y >= 0.0) {
      if (y < 0.04) return mix(horizon, low, y / 0.04);
      if (y < 0.18) return mix(low, mid, (y - 0.04) / 0.14);
      if (y < 0.45) return mix(mid, high, (y - 0.18) / 0.27);
      return mix(high, zenith, clamp((y - 0.45) / 0.5, 0.0, 1.0));
    }
    float d = -y;
    if (d < 0.06) return mix(horizon, below1, d / 0.06);
    if (d < 0.18) return mix(below1, below2, (d - 0.06) / 0.12);
    if (d < 0.38) return mix(below2, below3, (d - 0.18) / 0.20);
    return mix(below3, nadir, clamp((d - 0.38) / 0.4, 0.0, 1.0));
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = ramp(d.y);
    // sun glow
    float s = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.97, 0.9) * (pow(s, 600.0) * 0.6 + pow(s, 12.0) * 0.06);
    // the moon sits opposite the sun, so it shows as a dim grey disc in the void when you
    // look down from high up (full zoom-out screenshots)
    vec3 moonDir = normalize(vec3(-sunDir.x, -sunDir.y, -sunDir.z));
    float md = dot(d, moonDir);
    if (md > 0.9952) {
      vec2 mp = vec2(dot(d, normalize(cross(moonDir, vec3(0.0, 1.0, 0.001)))), d.y) * 160.0;
      float crater = fbm(mp * 0.9) * 0.022;
      vec3 moon = vec3(0.108, 0.108, 0.112) - crater;   // linear ≈ #5c5c5d (screenshot 30)
      col = mix(col, moon, smoothstep(0.9952, 0.9958, md));
    }
    // wispy clouds on a high plane (only above the horizon, fading into the haze)
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.12) * 1.35 + vec2(time * 0.004, time * 0.002);
      float n = fbm(uv * 1.6);
      float streak = fbm(vec2(uv.x * 0.6, uv.y * 2.2) + 4.0);
      float c = smoothstep(0.52, 0.8, n * 0.65 + streak * 0.45);
      float fade = smoothstep(0.02, 0.22, d.y);
      col = mix(col, vec3(1.0), c * 0.92 * fade);
    }
    gl_FragColor = vec4(min(col, vec3(0.97)), 1.0); // stay under the bloom threshold
    #include <colorspace_fragment>
  }`;

export function createSky(scene, sunDirection) {
  const u = { time: { value: 0 }, sunDir: { value: sunDirection.clone().normalize() } };
  for (const [k, v] of Object.entries(SKY)) if (k !== 'fog') u[k] = { value: new THREE.Color(v) };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false })
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData.class = 'sky';
  scene.add(mesh);
  // Roblox atmosphere haze: distant geometry fades toward a light grey
  scene.fog = new THREE.Fog(SKY.fog, 380, 1500);
  return {
    mesh,
    update(dt, camera) { u.time.value += dt; mesh.position.copy(camera.position); mesh.scale.setScalar(camera.far * 0.9); }
  };
}
