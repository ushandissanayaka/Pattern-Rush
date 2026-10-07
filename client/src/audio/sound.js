// Game audio — there are no sound files to download. Every effect and the background-music loop
// is synthesised ONCE on a background thread (audio/synth.worker.js) while the game loads. Playing a
// sound later only starts a ready-made buffer on the browser's audio thread, so audio costs the
// game loop next to nothing.
const MUSIC_VOLUME = 0.32, SFX_VOLUME = 0.8;
const buffers = {};
let ctx = null, sfxBus = null, musicBus = null, musicStarted = false, rendering = null;
let muted = false;
try { muted = localStorage.getItem('cc:muted') === '1'; } catch { /* storage blocked: start with sound on */ }

/** Generate every sound on a background thread (call early; no user gesture needed). */
export function prepareAudio() {
  if (rendering) return rendering;
  rendering = new Promise((resolve) => {
    let worker;
    try { worker = new Worker(new URL('./synth.worker.js', import.meta.url), { type: 'module' }); }
    catch (error) { console.warn('[audio] sound worker unavailable:', error); resolve(); return; }
    worker.onmessage = ({ data }) => {
      for (const [name, samples] of Object.entries(data.sounds)) {
        const buffer = new AudioBuffer({ length: samples.length, sampleRate: data.rate, numberOfChannels: 1 });
        buffer.copyToChannel(samples, 0);
        buffers[name] = buffer;
      }
      worker.terminate();
      startMusic();
      resolve();
    };
    worker.onerror = (error) => { console.warn('[audio] could not generate sounds:', error.message); worker.terminate(); resolve(); };
    worker.postMessage('render');
  });
  return rendering;
}

// Browsers only allow sound after the player's first click / key press.
function unlock() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOLUME;
  musicBus = ctx.createGain(); musicBus.gain.value = 0;
  const master = ctx.createGain(); master.gain.value = muted ? 0 : 1;
  sfxBus.connect(master); musicBus.connect(master); master.connect(ctx.destination);
  ctx.master = master;
  ctx.resume?.();
  startMusic();
}
function startMusic() {
  if (!ctx || musicStarted || !buffers.music) return;
  musicStarted = true;
  const src = ctx.createBufferSource(); src.buffer = buffers.music; src.loop = true;
  src.connect(musicBus); src.start();
  musicBus.gain.setValueAtTime(0, ctx.currentTime);
  musicBus.gain.linearRampToValueAtTime(MUSIC_VOLUME, ctx.currentTime + 2.5);   // gentle fade-in
}

/** Play a sound effect: click, pickup, drop, step, correct, wrong, win, lose. */
export function sfx(name, { rate = 1, volume = 1 } = {}) {
  const buffer = buffers[name];
  if (!ctx || muted || !buffer || ctx.state !== 'running') return;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffer; src.playbackRate.value = rate; g.gain.value = volume;
  src.connect(g).connect(sfxBus); src.start();
}

export const isMuted = () => muted;
export function setMuted(on) {
  muted = on;
  try { localStorage.setItem('cc:muted', on ? '1' : '0'); } catch { /* not persisted */ }
  if (ctx) ctx.master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.05);
  window.dispatchEvent(new CustomEvent('cc:muted', { detail: on }));
}

export function initAudio() {
  prepareAudio();
  const first = () => { unlock(); removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); };
  addEventListener('pointerdown', first, true);
  addEventListener('keydown', first, true);
  // a click sound for every button in the game
  addEventListener('click', (e) => { if (e.target.closest?.('button, [role="button"]')) sfx('click'); }, true);
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.repeat && !e.target.closest?.('input, textarea, [contenteditable="true"]')) setMuted(!muted);
  });
  // resume after the tab comes back (some browsers suspend audio in the background)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ctx?.resume?.(); });
}
