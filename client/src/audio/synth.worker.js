// Sound synthesis on a background thread. Every effect and the music loop is computed as raw PCM
// samples here, so generating audio never blocks the game (main) thread. The finished Float32Arrays
// are transferred back to audio/sound.js, which only wraps them in AudioBuffers.
const RATE = 32000;
const TAU = Math.PI * 2;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const track = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

function wave(type, phase) {
  const p = phase - Math.floor(phase);
  if (type === 'triangle') return 1 - 4 * Math.abs(p - 0.5);
  if (type === 'square') return p < 0.5 ? 1 : -1;
  return Math.sin(TAU * p);
}
// one voice: quick linear attack, exponential decay to silence at `dur`; optional pitch sweep and low-pass
function tone(out, { type = 'sine', freq, to = freq, start = 0, dur = 0.2, gain = 0.3, attack = 0.005, lowpass = 0 }) {
  const s0 = Math.round(start * RATE), n = Math.round(dur * RATE), sweep = to / freq;
  const decay = Math.pow(0.001, 1 / Math.max(1, n - attack * RATE));
  const lp = lowpass ? 1 - Math.exp(-TAU * lowpass / RATE) : 1;
  let phase = 0, level = 1, y = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / RATE;
    phase += freq * (sweep === 1 ? 1 : Math.pow(sweep, Math.min(1, t / (dur * 0.8)))) / RATE;
    let e;
    if (t < attack) e = t / attack; else { e = level; level *= decay; }
    let v = wave(type, phase) * gain * e;
    if (lowpass) { y += lp * (v - y); v = y; }
    out[s0 + i] += v;
  }
}
// glockenspiel-like bell: inharmonic partials, the high ones fade first
function bell(out, freq, start, dur, gain) {
  for (const [ratio, amp, life] of [[1, 1, 1], [2.76, 0.32, 0.45], [5.4, 0.14, 0.25]]) {
    tone(out, { freq: freq * ratio, start, dur: dur * life, gain: gain * amp, attack: 0.003 });
  }
}
// soft sustained chord tone (linear in / out)
function pad(out, freq, start, dur, gain) {
  const s0 = Math.round(start * RATE), n = Math.round(dur * RATE), fade = 0.3 * RATE;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const e = Math.min(1, i / fade, (n - i) / (0.25 * RATE));
    out[s0 + i] += Math.sin(TAU * freq * i / RATE) * gain * e;
  }
}
// filtered white-noise burst (RBJ biquad): footsteps, sleigh bells, sparkle
function noise(out, { start = 0, dur = 0.1, gain = 0.3, type = 'bandpass', freq = 1000, q = 1 }) {
  const w = TAU * freq / RATE, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  const s0 = Math.round(start * RATE), n = Math.round(dur * RATE);
  const decay = Math.pow(0.001, 1 / Math.max(1, n));
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, level = 1;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const x = Math.random() * 2 - 1;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const attack = Math.min(1, i / (0.004 * RATE));
    out[s0 + i] += y * gain * attack * level; level *= decay;
  }
}
function normalize(out, peakTarget = 0.9) {
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > peakTarget) { const k = peakTarget / peak; for (let i = 0; i < out.length; i++) out[i] *= k; }
  return out;
}

const EFFECTS = {
  click: () => { const o = track(0.09); tone(o, { freq: 1500, to: 900, dur: 0.06, gain: 0.28 }); noise(o, { dur: 0.025, gain: 0.06, type: 'highpass', freq: 4000 }); return o; },
  pickup: () => { const o = track(0.14); tone(o, { freq: 330, to: 990, dur: 0.12, gain: 0.45 }); return o; },           // bubbly "pop!" up
  drop: () => { const o = track(0.2); tone(o, { freq: 760, to: 240, dur: 0.13, gain: 0.45 }); noise(o, { start: 0.01, dur: 0.08, gain: 0.18, type: 'lowpass', freq: 700 }); return o; },
  step: () => { const o = track(0.11); noise(o, { dur: 0.08, gain: 0.35, type: 'lowpass', freq: 900 }); tone(o, { freq: 120, to: 70, dur: 0.07, gain: 0.22 }); return o; },
  correct: () => { const o = track(0.8); [84, 88, 91].forEach((m, i) => bell(o, hz(m), i * 0.07, 0.7, 0.24)); return o; },
  wrong: () => {   // friendly "uh-uh": two falling, slightly buzzy notes
    const o = track(0.55);
    tone(o, { type: 'square', freq: 311, to: 294, dur: 0.17, gain: 0.16, lowpass: 1400 });
    tone(o, { type: 'square', freq: 233, to: 208, start: 0.19, dur: 0.32, gain: 0.16, lowpass: 1400 });
    tone(o, { type: 'triangle', freq: 155, start: 0.19, dur: 0.3, gain: 0.2 });
    return o;
  },
  win: () => {
    const o = track(2.4);
    [72, 76, 79, 84].forEach((m, i) => bell(o, hz(m), i * 0.11, 0.5, 0.26));                 // C E G C arpeggio
    [84, 88, 91, 96].forEach((m) => bell(o, hz(m), 0.5, 1.8, 0.16));                           // big bright chord
    [60, 67].forEach((m) => tone(o, { type: 'triangle', freq: hz(m), start: 0.5, dur: 1.6, gain: 0.14, attack: 0.02 }));
    for (let i = 0; i < 10; i++) noise(o, { start: 0.5 + i * 0.12, dur: 0.1, gain: 0.05, type: 'highpass', freq: 7000 }); // sleigh-bell sparkle
    return o;
  },
  lose: () => { const o = track(1.0); [67, 64, 60].forEach((m, i) => tone(o, { type: 'triangle', freq: hz(m), start: i * 0.22, dur: 0.38, gain: 0.2, attack: 0.01 })); return o; },
};

// Background music: an original, cheerful Christmas-style loop at 132 bpm — sleigh bells on every
// eighth, a glockenspiel tune, soft chord pads and a bouncy bass (C | F | G | C | Am | F | G | C).
function music() {
  const BEAT = 60 / 132, BAR = 4 * BEAT;
  const prog = [[48, [60, 64, 67]], [41, [60, 65, 69]], [43, [59, 62, 67]], [48, [60, 64, 67]],
                [45, [57, 60, 64]], [41, [60, 65, 69]], [43, [59, 62, 67]], [48, [60, 64, 67]]];
  const tune = [  // [beat, length in beats, midi] over 8 bars
    [0, .5, 67], [.5, .5, 72], [1, 1, 76], [2, .5, 74], [2.5, .5, 72], [3, 1, 76],
    [4, 1, 77], [5, .5, 81], [5.5, .5, 79], [6, 1, 77], [7, 1, 76],
    [8, .5, 74], [8.5, .5, 76], [9, 1, 77], [10, 1, 79], [11, 1, 71],
    [12, 1.5, 72], [13.5, .5, 76], [14, 2, 79],
    [16, 1, 81], [17, .5, 79], [17.5, .5, 76], [18, 1, 72], [19, 1, 76],
    [20, .5, 77], [20.5, .5, 76], [21, .5, 74], [21.5, .5, 72], [22, 2, 69],
    [24, .5, 71], [24.5, .5, 74], [25, 1, 79], [26, .5, 77], [26.5, .5, 74], [27, 1, 71],
    [28, 1, 72], [29, 1, 67], [30, 2, 72]];
  const o = track(16 * BAR);
  for (let half = 0; half < 2; half++) {
    const t0 = half * 8 * BAR;
    prog.forEach(([root, chord], bar) => {
      const s = t0 + bar * BAR;
      tone(o, { type: 'triangle', freq: hz(root), start: s, dur: BEAT * 1.6, gain: 0.2, attack: 0.008 });           // bass: root…
      tone(o, { type: 'triangle', freq: hz(root + 7), start: s + 2 * BEAT, dur: BEAT * 1.6, gain: 0.16, attack: 0.008 }); // …and fifth
      for (const m of chord) pad(o, hz(m), s, BAR, 0.03);
      for (let e = 0; e < 8; e++) {                                                           // sleigh bells
        const accent = e === 2 || e === 6;
        noise(o, { start: s + e * BEAT / 2, dur: accent ? 0.16 : 0.06, gain: accent ? 0.07 : 0.035, type: 'highpass', freq: 6500 });
      }
    });
    // the tune; the second time round a soft bell doubles it an octave higher
    for (const [b, len, m] of tune) {
      bell(o, hz(m), t0 + b * BEAT, Math.max(0.5, len * BEAT + 0.35), 0.13);
      if (half) bell(o, hz(m + 12), t0 + b * BEAT, Math.max(0.4, len * BEAT + 0.2), 0.04);
    }
  }
  return o;
}

self.onmessage = () => {
  const result = {};
  for (const [name, make] of Object.entries(EFFECTS)) result[name] = normalize(make(), 0.95);
  result.music = normalize(music(), 0.9);
  self.postMessage({ rate: RATE, sounds: result }, Object.values(result).map((a) => a.buffer));
};
