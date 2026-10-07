// 1v1 pattern match, server-validated for paired players with the original solo BOT flow retained.
//   PLAY / booth pad (E / click) → matchmaking queue → the server picks two queued players at
//   random and seats them in a free booth → STARTING 3·2·1 → pattern building
//   → (bot only) pick the opponent's pattern → turns: pick an object, the avatar carries it
//   to the next slot, "Is It X?" → correct: revealed + guess again / wrong: "No, no, no!" and
//   the turn passes. Wrong objects are removed for that slot. First to reveal all 9 wins.
// Spectating: every client replays the public match events of the other booths (objects carried,
//   correct ones placed on the ledge, wrong ones vanish), and WATCH points the camera at one booth.
import * as THREE from 'three';
import { STATIONS } from '../scene/world.js';
import { showScreen } from '../ui/hud.js';
import { LegionCharacter, LEGION_CDN } from '../bloxity/legion-avatar.js';
import { TOKENS, TOKEN, PATTERN_LENGTH, randomPattern, tokenIcon, tokenMesh, drawBarCell } from './tokens.js';

const TURN_TIME = 20, VOTE_TIME = 5, BUILD_TIME = 20, START_COUNT = 3;
const JOIN_RADIUS = 5;
const C_AVAILABLE = '#2fe01a', C_STARTING = '#d61ad6', C_PROGRESS = '#ff1a1a', C_WIN = '#ffd21a';
const SIDE_COLOR = { red: '#ff5a5a', blue: '#4fc3ff' };

// booth-local layout (see booth() in world.js; local +X faces the road)
const SLOT_Z = (i) => 13 - (i + 0.5) * (26 / PATTERN_LENGTH);
const DECK_X = -1, DECK_Y = 13, LEDGE_X = 12.8, LEDGE_Y = 10.2, TOKEN_SIZE = 2.85;   // objects sit on the front lip
const CHAR_SCALE = 1.5;          // characters are bigger inside the playing place (screenshots 66–78)
const BAR_X = 15.2, BAR_Y = 5.2, BAR_SIZE = 2.6;    // half sunk into the bar, like a shelf
const IDLE_Z = 12;               // stand at the left end, beside the panels
const CAM_LOCAL = new THREE.Vector3(33, 15, 0), LOOK_LOCAL = new THREE.Vector3(0, 13.5, 0);

/* ---------------- DOM ---------------- */
function el(tag, cls, parent, text) {
  const e = document.createElement(tag); if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e); return e;
}
function gemPrice(parent, label, amount) {
  const s = el('span', 'mm-price', parent);
  if (label) el('span', '', s, label + ' ');
  const img = el('img', '', s); img.src = 'assets/gem.svg'; img.alt = '';
  el('span', '', s, String(amount)); return s;
}
function buildUI() {
  const root = el('div', 'mm', document.body); root.id = 'match-ui';
  const ui = { root };
  ui.prompt = el('button', 'mm-prompt', root); ui.prompt.type = 'button';
  el('span', 'mm-prompt__key', ui.prompt, 'E'); ui.promptText = el('span', 'mm-prompt__text', ui.prompt, 'Join Game');
  ui.wait = el('div', 'mm-wait', root);
  el('p', 'mm-wait__hint stroke-text', ui.wait, 'Waiting for an opponent... or');
  ui.vsBot = el('button', 'mm-btn mm-btn--orange', ui.wait, 'PLAY VS. BOT');
  ui.leave = el('button', 'mm-btn mm-btn--red', root, 'LEAVE'); ui.leave.classList.add('mm-leave');

  ui.watch = el('div', 'mm-watch', root); ui.watch.setAttribute('aria-label', 'Live match');
  const head = el('div', 'mm-watch__head', ui.watch);
  ui.watchTitle = el('span', '', head);
  const nav = el('div', 'mm-watch__nav', head);
  ui.watchPrev = el('button', '', nav, '◀'); ui.watchPrev.setAttribute('aria-label', 'Previous live match');
  ui.watchNext = el('button', '', nav, '▶'); ui.watchNext.setAttribute('aria-label', 'Next live match');
  ui.watchRows = el('div', '', ui.watch); ui.watchRows.style.display = 'grid'; ui.watchRows.style.gap = 'calc(8 * var(--u))';
  ui.watchStatus = el('div', 'mm-watch__status', ui.watch);
  const foot = el('div', 'mm-watch__foot', ui.watch);
  ui.watchQueue = el('span', 'mm-watch__queue', foot);
  ui.watchFind = el('button', 'mm-btn mm-btn--green', foot, 'FIND MATCH');
  ui.watchStop = el('button', 'mm-btn mm-btn--red', foot, 'STOP WATCHING');

  ui.vote = el('div', 'mm-vote', root);
  ui.voteTitle = el('h2', 'mm-title stroke-text', ui.vote, "OPPONENT'S PATTERN (5s)");
  ui.votePick = el('button', 'mm-btn mm-btn--orange mm-btn--wide', ui.vote, "PICK OPPONENT'S PATTERN");
  ui.voteRandom = el('button', 'mm-btn mm-btn--pink mm-btn--wide', ui.vote, 'RANDOM PATTERN');

  ui.build = el('div', 'mm-panel mm-build', root);
  ui.buildHead = el('div', 'mm-panel__head stroke-text', ui.build, 'Pick Pattern! (20s)');
  ui.buildSlots = el('div', 'mm-build__slots', ui.build);
  ui.buildOpts = el('div', 'mm-panel__opts', ui.build);
  const buildActions = ui.buildActions = el('div', 'mm-build__actions', ui.build);
  ui.buildRandom = el('button', 'mm-btn mm-btn--pink', buildActions, 'RANDOM');
  ui.buildOk = el('button', 'mm-btn mm-btn--green', buildActions, 'CONFIRM');

  ui.turn = el('div', 'mm-turn stroke-text', root);
  ui.banner = el('div', 'mm-banner', root);

  ui.reveal = el('button', 'mm-reveal', root);
  gemPrice(el('span', 'mm-reveal__price stroke-text', ui.reveal), 'ONLY', 4);
  el('span', 'mm-reveal__text stroke-text', ui.reveal, 'REVEAL NEXT ANSWER');

  ui.guess = el('div', 'mm-panel mm-guess', root);
  el('div', 'mm-panel__head stroke-text', ui.guess, 'Guess!');
  ui.guessOpts = el('div', 'mm-panel__opts', ui.guess);
  ui.submit = el('button', 'mm-btn mm-btn--green mm-submit', root, 'SUBMIT');

  ui.repeat = el('div', 'mm-repeat', root);
  ui.repeatBtn = el('button', 'mm-btn mm-btn--blue mm-btn--big', ui.repeat, 'REPEAT GUESS');
  ui.newBtn = el('button', 'mm-btn mm-btn--green mm-btn--big', ui.repeat, 'NEW GUESS');

  ui.troll = el('div', 'mm-troll', root);
  el('div', 'mm-troll__label stroke-text', ui.troll, 'TROLL YOUR OPPONENT');
  const row = el('div', 'mm-troll__row', ui.troll);
  ui.reset = el('button', 'mm-btn mm-btn--purple mm-btn--small', row);
  el('span', '', ui.reset, 'RESET AND SHUFFLE'); gemPrice(el('span', 'mm-sub stroke-text', ui.reset), '', 49);
  ui.skip = el('button', 'mm-btn mm-btn--blue mm-btn--small', row);
  el('span', '', ui.skip, 'SKIP TURN 😂'); gemPrice(el('span', 'mm-sub stroke-text', ui.skip), 'ONLY', 7);

  ui.toast = el('div', 'mm-toast stroke-text', root);
  ui.result = el('div', 'mm-result', root);
  ui.resultTitle = el('div', 'mm-result__title stroke-text', ui.result);
  ui.resultSub = el('div', 'mm-result__sub stroke-text', ui.result);
  return ui;
}
const show = (e, on = true) => e.classList.toggle('is-on', on);

/* ---------------- small 3D helpers ---------------- */
function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = "700 34px 'Montserrat', 'Fredoka'"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(4, 1, 1); return s;
}
function guideBox() {   // translucent green box marking the next slot (screenshots 66, 74)
  const g = new THREE.Group(), s = TOKEN_SIZE + 0.4;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: '#5cff4a', transparent: true, opacity: 0.3, depthWrite: false })));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)), new THREE.LineBasicMaterial({ color: '#3cff2a', depthTest: false }));
  edges.renderOrder = 20; g.add(edges);
  return g;
}
function drawBar(half, revealed) {
  const tex = half.barTex, c = tex.image, g = c.getContext('2d'), w = c.width, h = c.height;
  g.fillStyle = '#e9eef0'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#141d24'; g.fillRect(8, 8, w - 16, h - 16);
  const cw = (w - 16) / PATTERN_LENGTH;
  g.font = "700 84px 'Fredoka'"; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < PATTERN_LENGTH; i++) {
    const x = 8 + cw * i;
    if (revealed[i]) drawBarCell(g, revealed[i], x, 8, cw + 0.5, h - 16);
    else { g.fillStyle = '#e4e6e8'; g.fillText('?', x + cw / 2, h / 2 + 4); }
  }
  tex.needsUpdate = true;
}
// code bar plus the objects half sunk into it for every revealed slot
function showProgress(p, vis) {
  drawBar(p.half, vis);
  p.barMeshes = p.barMeshes || [];
  for (let i = 0; i < PATTERN_LENGTH; i++) {
    if (vis[i] && !p.barMeshes[i]) {
      const m = tokenMesh(vis[i], BAR_SIZE); m.rotation.y = Math.PI / 2;
      m.position.set(BAR_X, BAR_Y, SLOT_Z(i)); p.half.group.add(m); p.barMeshes[i] = m;
    }
  }
}
function ledgeToken(id, slot) {
  const m = tokenMesh(id, TOKEN_SIZE); m.rotation.y = Math.PI / 2;
  m.position.set(LEDGE_X, LEDGE_Y + TOKEN_SIZE / 2, SLOT_Z(slot));
  return m;
}

/* ---------------- match system ---------------- */
export function createMatchSystem({ scene, camera, me, feet, state, getName, multiplayer, getRemoteCharacter }) {
  const ui = buildUI();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  let phase = 'idle', gen = 0, nearPad = null;
  let M = null;                          // current match
  let networkMatch = false, networkStartWaiter = null, networkGuessWaiter = null;
  const timers = [];
  const wait = (s) => new Promise(r => timers.push({ t: s, r }));
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camActive = false, camInit = false;
  let lastSpeed = 0;                     // own avatar speed during a match (sent to the lobby as 'walk')
  // matchmaking queue + spectating
  let inQueue = false, queueSize = 0, pendingBot = false, keepQueue = false, lastScreen = document.body.dataset.screen;
  const stationInfo = new Map();         // stationId → latest public booth state from the server
  const views = new Map();               // stationId → replay of another booth's live match
  let watchId = null;
  const vtimers = [];                    // spectator timers, never cleared by your own match
  const vwait = (s) => new Promise(r => vtimers.push({ t: s, r }));
  const queueUI = {
    status: document.getElementById('mm-queue-status'),
    watch: document.getElementById('mm-watch'),
    bot: document.getElementById('mm-play-bot')
  };

  const setPhase = (p) => { phase = p; document.body.dataset.match = p; refreshUI(); };
  function refreshUI() {
    show(ui.wait, phase === 'joined');
    show(ui.leave, phase === 'joined' || phase === 'starting');
    show(ui.vote, phase === 'voting');
    show(ui.build, phase === 'building');
    show(ui.turn, phase === 'playing');
    show(ui.watch, phase === 'watching');
    if (phase !== 'playing') [ui.guess, ui.submit, ui.repeat, ui.troll, ui.reveal].forEach(e => show(e, false));
    if (phase !== 'playing' && phase !== 'watching') show(ui.banner, false);
  }
  function toast(text) {
    ui.toast.textContent = text; show(ui.toast, true);
    clearTimeout(toast.t); toast.t = setTimeout(() => show(ui.toast, false), 1600);
  }

  // local-booth → world helpers
  const W = (half, x, y, z, out = new THREE.Vector3()) => half.group.localToWorld(out.set(x, y, z));
  const roadHeading = (half) => {
    W(half, 1, 0, 0, tmpA); W(half, 0, 0, 0, tmpB); tmpA.sub(tmpB);
    return Math.atan2(tmpA.x, tmpA.z);
  };

  /* ----- matchmaking queue ----- */
  const canQueue = () => phase === 'idle' || phase === 'watching';
  function renderQueue() {
    if (queueUI.status) {
      queueUI.status.textContent = !multiplayer?.connected ? 'Offline. Play vs. bot while the server reconnects.'
        : !inQueue || !queueSize ? 'Joining queue…'
          : `${queueSize} player${queueSize === 1 ? '' : 's'} in queue. You join a booth where someone is waiting, or two are picked at random.`;
    }
    if (queueUI.watch) queueUI.watch.hidden = !liveStationIds().length;
    if (phase === 'watching') renderWatch();
  }
  function enterQueue() {
    if (inQueue || !canQueue()) return;
    inQueue = !!multiplayer?.send('join-queue');
    renderQueue();
  }
  function exitQueue() {
    if (!inQueue) return;
    inQueue = false;
    multiplayer?.send('leave-queue');
    renderQueue();
  }
  // close the PLAY modal; keep = stay queued (e.g. to watch a live match while waiting)
  function closeQueueScreen(keep) {
    if (document.body.dataset.screen !== 'matchmaking') return;
    keepQueue = keep; showScreen('lobby'); keepQueue = false;
  }
  function requestBot() {
    if (!canQueue() || pendingBot) return;
    if (multiplayer?.connected) { pendingBot = multiplayer.send('play-bot'); return; }
    const station = STATIONS.find((st) => !Object.keys(stationInfo.get(st.id)?.players || {}).length);
    if (!station) { toast('All booths are busy.'); return; }
    seatForBot(station, 'red');
  }
  function seatForBot(station, color) {
    pendingBot = false;
    inQueue = false;
    stopWatching();
    closeQueueScreen(false);
    takeSeat(station, color);
    playVsBot();
  }

  /* ----- seats ----- */
  // booth pad: sit down right away and wait there; the next pad or queued player completes the match
  function joinBooth(station, color) {
    exitQueue();
    takeSeat(station, color);
    station.sign.set('AVAILABLE', C_AVAILABLE, '1/2 Players');
    multiplayer?.send('join-station', { stationId: station.id, color });
  }
  function takeSeat(station, color) {
    gen++;
    clearView(station.id);
    const oppColor = color === 'red' ? 'blue' : 'red';
    M = { station, me: { id: multiplayer?.clientId, color, half: station[color], char: me, name: getName(), nameColor: '#ffd21a', isBot: false },
          opp: { color: oppColor, half: station[oppColor], char: null, name: 'Bot', nameColor: '#ffd21a', isBot: true } };
    networkMatch = false;
    feet.copy(M.me.half.pad);
    state.heading = roadHeading(M.me.half);
    setPhase('joined');
  }
  function leave() {
    if (!M) return;
    gen++; timers.length = 0;
    networkMatch = false;
    networkStartWaiter = null;
    networkGuessWaiter = null;
    removeBot();
    clearMatchObjects(M);
    multiplayer?.send('leave-station');
    M.station.sign.set('AVAILABLE', C_AVAILABLE, '0/2 Players');
    // step off the pad toward the road so the prompt doesn't re-open immediately
    W(M.me.half, 32, 0, 0, tmpA); feet.set(tmpA.x, 0, tmpA.z);
    M = null; setPhase('idle');
  }
  function removeBot() { if (M?.opp.isBot && M.opp.char) { scene.remove(M.opp.char.root); M.opp.char = null; } }
  function clearMatchObjects(match) {
    for (const p of [match.me, match.opp]) {
      for (const mesh of p.placed || []) if (mesh) p.half.group.remove(mesh);
      for (const mesh of p.barMeshes || []) if (mesh) p.half.group.remove(mesh);
      if (p.guide) p.half.group.remove(p.guide);
      if (p.held) p.half.group.remove(p.held);
      if (p.char) p.char.root.scale.setScalar(1);
      drawBar(p.half, []);
    }
  }

  async function playVsBot() {
    if (phase !== 'joined') return;
    const myGen = ++gen;
    const bot = new LegionCharacter({ skinUrl: `${LEGION_CDN}/skins/${1 + Math.floor(Math.random() * 20)}.png` });
    const tag = nameTag('Bot'); tag.position.y = 7.4; bot.root.add(tag);
    bot.root.position.copy(M.opp.half.pad); bot.root.rotation.y = roadHeading(M.opp.half);
    scene.add(bot.root); M.opp.char = bot;
    setPhase('starting');
    for (let n = START_COUNT; n >= 1; n--) {
      M.station.sign.set('STARTING', C_STARTING, String(n), '#ffffff', true);
      await wait(1); if (myGen !== gen) return;
    }
    await vote(myGen);
  }

  async function beginNetworkMatch() {
    if (phase !== 'joined' || !M) return;
    networkMatch = true;
    const myGen = ++gen;
    setPhase('starting');
    for (let n = START_COUNT; n >= 1; n--) {
      M.station.sign.set('STARTING', C_STARTING, String(n), '#ffffff', true);
      await wait(1); if (myGen !== gen) return;
    }
    // what you build here is the pattern your opponent has to crack
    const mode = await choosePatternMode(myGen);
    if (myGen !== gen) return;
    M.station.sign.set('BUILDING', C_STARTING, 'Choose your pattern');
    M.me.target = mode === 'pick' ? await buildPattern(myGen) : await showRandomPattern(myGen);
    if (myGen !== gen) return;
    const started = new Promise((resolve) => { networkStartWaiter = resolve; });
    if (!multiplayer?.send('match-event', { event: { type: 'submit-pattern', pattern: M.me.target } })) {
      toast('Connection lost. Press PLAY to find a new match.');
      leave();
      return;
    }
    const turnPlayerId = await started;
    if (myGen !== gen) return;
    startPlaying(myGen, turnPlayerId);
  }

  /* ----- pattern voting / building ----- */
  // "PICK OPPONENT'S PATTERN" or "RANDOM PATTERN"; a click decides at once, no choice in 5s = random
  async function choosePatternMode(myGen) {
    setPhase('voting');
    M.station.sign.set('CHOOSING', C_STARTING, 'Pick or random?');
    let choice = null;
    ui.votePick.onclick = () => { choice = 'pick'; };
    ui.voteRandom.onclick = () => { choice = 'random'; };
    for (let left = VOTE_TIME; left > 0 && !choice; left -= 0.1) {
      ui.voteTitle.textContent = `OPPONENT'S PATTERN (${Math.ceil(left)}s)`;
      await wait(0.1); if (myGen !== gen) return 'random';
    }
    return choice || 'random';
  }
  // random order, shown on the build panel for a moment so you know what your opponent faces
  async function showRandomPattern(myGen) {
    const pat = randomPattern();
    setPhase('building');
    ui.buildHead.textContent = 'Random Pattern!';
    ui.buildOpts.replaceChildren();
    drawSlots(pat, null);
    ui.buildActions.style.visibility = 'hidden';
    await wait(1.5);
    ui.buildActions.style.visibility = '';
    return pat;
  }
  function drawSlots(pat, onRemove) {
    ui.buildSlots.replaceChildren();
    for (let i = 0; i < PATTERN_LENGTH; i++) {
      const s = el('button', 'mm-slot', ui.buildSlots);
      if (pat[i]) {
        const im = el('img', '', s); im.src = tokenIcon(pat[i]); im.alt = TOKEN[pat[i]].name;
        if (onRemove) s.onclick = () => onRemove(i);
      } else el('span', '', s, '?');
    }
  }
  async function vote(myGen) {
    const mode = await choosePatternMode(myGen);
    if (myGen !== gen) return;
    // the bot always gets a random pattern for you to crack; you pick or randomize the bot's
    M.me.target = randomPattern();
    M.opp.target = mode === 'pick' ? await buildPattern(myGen) : await showRandomPattern(myGen);
    if (myGen !== gen) return;
    startPlaying(myGen);
  }
  async function buildPattern(myGen) {
    setPhase('building');
    const pat = [];
    const draw = () => drawSlots(pat, (i) => { pat.splice(i, 1); draw(); });
    ui.buildRandom.onclick = () => { pat.splice(0, pat.length, ...randomPattern()); draw(); };
    ui.buildOpts.replaceChildren();
    for (const t of TOKENS) {
      const b = optionTile(t.id, ui.buildOpts); b.onclick = () => { if (pat.length < PATTERN_LENGTH) { pat.push(t.id); draw(); } };
    }
    draw();
    let done = false; ui.buildOk.onclick = () => { if (pat.length === PATTERN_LENGTH) done = true; else toast('Fill all 9 slots'); };
    for (let s = BUILD_TIME; s >= 1 && !done; s--) {
      ui.buildHead.textContent = `Pick Pattern! (${s}s)`;
      for (let k = 0; k < 10 && !done; k++) { await wait(0.1); if (myGen !== gen) return pat; }
    }
    while (pat.length < PATTERN_LENGTH) pat.push(TOKENS[Math.floor(Math.random() * TOKENS.length)].id);
    return pat;
  }
  function optionTile(id, parent) {
    const b = el('button', 'mm-opt', parent); b.type = 'button';
    const im = el('img', '', b); im.src = tokenIcon(id); im.alt = '';
    const t = TOKEN[id];
    el('span', 'mm-opt__name stroke-text' + (t.name.length > 9 ? ' is-long' : ''), b, t.name);
    return b;
  }

  /* ----- playing ----- */
  // The opponent's bar shows the whole pattern they are cracking, so you can follow their progress
  // (online that is the pattern you built, M.me.target; vs. bot it is the bot's target).
  // Your own bar only shows what you have cracked: the server never sends the opponent's pattern.
  function syncBar(p) {
    showProgress(p, p !== M.opp ? p.revealed : networkMatch ? M.me.target : p.target);
  }
  function setupPlayer(p) {
    p.idx = 0; p.revealed = []; p.wrong = Array.from({ length: PATTERN_LENGTH }, () => new Set()); p.placed = [];
    p.pos = new THREE.Vector3(DECK_X, DECK_Y, IDLE_Z); p.walkTo = null; p.speed = 0;
    p.guide = guideBox(); p.guide.visible = false; p.half.group.add(p.guide);
    if (p.char) p.char.root.scale.setScalar(CHAR_SCALE);
    syncBar(p);
  }
  function startPlaying(myGen, turnPlayerId = null) {
    setupPlayer(M.me); setupPlayer(M.opp);
    M.turn = turnPlayerId ? (turnPlayerId === M.me.id ? M.me : M.opp) : (Math.random() < 0.5 ? M.me : M.opp);
    M.over = false;
    setPhase('playing');
    camActive = true; camInit = false;
    runTurn(myGen, M.turn);
  }
  const other = (p) => (p === M.me ? M.opp : M.me);

  async function runTurn(myGen, p) {
    if (myGen !== gen || M.over) return;
    M.turn = p; M.lastWasCorrect = false;
    M.station.sign.set('IN PROGRESS', C_PROGRESS, `${p.name} is guessing!`);
    show(ui.troll, !p.isBot ? false : true);
    let keepGoing = true;
    while (keepGoing && myGen === gen && !M.over) {
      p.guide.position.set(LEDGE_X, LEDGE_Y + TOKEN_SIZE / 2 + 0.2, SLOT_Z(p.idx)); p.guide.visible = true;
      const pick = p.isBot ? await botChoose(myGen, p)
        : networkMatch && p.id !== M.me.id ? await waitForNetworkGuess(myGen)
          : await humanChoose(myGen, p);
      if (myGen !== gen) return;
      if (!pick) { keepGoing = false; break; }            // ran out of time
      keepGoing = pick.passed ? false : await place(myGen, p, pick.id || pick, pick.correct);
    }
    p.guide.visible = false;
    if (myGen !== gen || M.over) return;
    await wait(0.4);
    runTurn(myGen, other(p));
  }

  // countdown shown at the top: "NAME's turn... 20s"; resolves null on timeout
  function turnClock(myGen, p, onTick) {
    let left = TURN_TIME;
    const tick = () => { ui.turn.textContent = `${p.name}'s turn... ${Math.ceil(left)}s`; };
    tick();
    return {
      async run(isDone) {
        while (left > 0) {
          await wait(0.1); if (myGen !== gen) return false;
          if (isDone()) return true;
          left -= 0.1; tick(); onTick && onTick(left);
        }
        return false;
      }
    };
  }
  function optionsFor(p) { return TOKENS.filter(t => !p.wrong[p.idx].has(t.id)).map(t => t.id); }

  async function humanChoose(myGen, p) {
    const prev = p.idx > 0 ? p.revealed[p.idx - 1] : null;
    let picked = null, chosen = null;
    const openGuess = () => {
      show(ui.repeat, false); show(ui.guess, true); show(ui.reveal, true); show(ui.submit, false);
      ui.guessOpts.replaceChildren();
      for (const id of optionsFor(p)) {
        const b = optionTile(id, ui.guessOpts);
        b.onclick = () => {
          picked = id; ui.guessOpts.querySelectorAll('.mm-opt').forEach(x => x.classList.toggle('is-picked', x === b)); show(ui.submit, true);
        };
      }
    };
    ui.submit.onclick = () => { if (picked) chosen = picked; };
    ui.reveal.onclick = () => toast('Coming soon!');
    if (prev && M.lastWasCorrect && !p.wrong[p.idx].has(prev)) {
      show(ui.repeat, true); show(ui.reveal, true); show(ui.guess, false); show(ui.submit, false);
      ui.repeatBtn.onclick = () => { chosen = prev; };
      ui.newBtn.onclick = openGuess;
    } else openGuess();
    const clock = turnClock(myGen, p);
    const ok = await clock.run(() => chosen !== null);
    [ui.guess, ui.submit, ui.repeat, ui.reveal].forEach(e => show(e, false));
    if (networkMatch) {
      const response = new Promise((resolve) => { networkGuessWaiter = resolve; });
      const sent = ok
        ? multiplayer.send('match-event', { event: { type: 'guess', tokenId: chosen } })
        : multiplayer.send('match-event', { event: { type: 'pass' } });
      if (!sent) {
        networkGuessWaiter = null;
        toast('Connection lost. Press PLAY to find a new match.');
        leave();
        return null;
      }
      return response;
    }
    return ok ? chosen : null;
  }
  function waitForNetworkGuess(myGen) {
    ui.turn.textContent = `${M.turn.name}'s turn...`;
    return new Promise((resolve) => {
      if (myGen !== gen) resolve(null);
      else networkGuessWaiter = resolve;
    });
  }
  async function botChoose(myGen, p) {
    const clock = turnClock(myGen, p);
    const think = 1.2 + Math.random() * 1.6;
    let t = 0, choice = null;
    await clock.run(() => (t += 0.1) >= think);
    if (myGen !== gen) return null;
    const opts = optionsFor(p), prev = p.idx > 0 ? p.revealed[p.idx - 1] : null;
    choice = (prev && opts.includes(prev) && Math.random() < 0.45) ? prev : opts[Math.floor(Math.random() * opts.length)];
    return choice;
  }

  function sayBanner(name, nameColor, text) {
    ui.banner.replaceChildren(); ui.banner.className = 'mm-banner is-on';
    if (name) { const n = el('span', 'mm-banner__name', ui.banner, name + ': '); n.style.color = nameColor; }
    el('span', 'mm-banner__text', ui.banner, text);
  }
  function bannerBig(text, cls) { ui.banner.replaceChildren(); ui.banner.className = `mm-banner is-on ${cls}`; el('span', 'mm-banner__text', ui.banner, text); }

  // carry the object to the next slot, ask, reveal → returns true if the player keeps guessing
  async function place(myGen, p, id, networkCorrect = null) {
    const slot = p.idx, prev = slot > 0 ? p.revealed[slot - 1] : null;
    // walk to the slot column on the deck holding the object
    const held = tokenMesh(id, TOKEN_SIZE); held.rotation.y = Math.PI / 2; p.half.group.add(held);
    p.held = held; p.walkTo = new THREE.Vector3(DECK_X, DECK_Y, SLOT_Z(slot));
    sayBanner(p.name, p.nameColor, prev === id ? `Another ${TOKEN[id].name}?` : `Is It ${TOKEN[id].name}?`);
    while (p.walkTo) { await wait(0.05); if (myGen !== gen) return false; }
    // drop it into the green box on the ledge (short arc)
    p.held = null;
    const from = held.position.clone(), to = new THREE.Vector3(LEDGE_X, LEDGE_Y + TOKEN_SIZE / 2, SLOT_Z(slot));
    for (let t = 0; t <= 1.0001; t += 0.1) {
      held.position.lerpVectors(from, to, t); held.position.y += Math.sin(t * Math.PI) * 2;
      await wait(0.035); if (myGen !== gen) return false;
    }
    p.guide.visible = false;
    await wait(0.9); if (myGen !== gen) return false;
    if (networkMatch ? networkCorrect : p.target[slot] === id) {
      p.revealed[slot] = id; p.placed[slot] = held; p.idx++;
      syncBar(p);
      bannerBig('Correct!', 'is-correct');
      M.lastWasCorrect = true;
      if (p.idx >= PATTERN_LENGTH) { await finish(myGen, p); return false; }
      await wait(0.9);
      return true;
    }
    p.wrong[slot].add(id);
    bannerBig('No, no, no!', 'is-wrong');
    for (let s = 1; s > 0; s -= 0.1) { held.scale.setScalar(Math.max(0.01, s)); await wait(0.03); }
    p.half.group.remove(held);
    await wait(0.9);
    return false;
  }

  async function finish(myGen, winner) {
    M.over = true;
    M.station.sign.set('WINNER', C_WIN, `${winner.name} wins!`);
    const won = winner === M.me;
    ui.resultTitle.textContent = won ? 'YOU WIN!' : 'YOU LOSE!';
    ui.resultTitle.className = 'mm-result__title stroke-text ' + (won ? 'is-win' : 'is-lose');
    ui.resultSub.textContent = `${winner.name} cracked the pattern first!`;
    show(ui.result, true); show(ui.turn, false); show(ui.troll, false);
    await wait(4); if (myGen !== gen) return;
    show(ui.result, false);
    endMatch();
  }
  function endMatch() {
    const mine = M.me.half;
    clearMatchObjects(M);
    removeBot();
    multiplayer?.send('leave-station');
    camActive = false;
    W(mine, 32, 0, 0, tmpA); feet.set(tmpA.x, 0, tmpA.z);
    me.setState('idle');
    M = null; setPhase('idle'); gen++;
  }

  /* ----- spectating: replay other booths' public match events ----- */
  const liveStationIds = () => STATIONS.filter((st) => views.has(st.id)).map((st) => st.id);
  const viewPlayer = (view, id) => (id ? Object.values(view.players).find((p) => p.id === id) || null : null);
  const viewOther = (view, p) => (p === view.players.red ? view.players.blue : view.players.red);

  function createView(station, info) {
    const view = { station, gen: 0, chain: Promise.resolve(), players: {}, turn: null, winner: null, say: null };
    for (const color of ['red', 'blue']) {
      const p = { id: info.players[color], name: info.names?.[color] || 'Player', color, half: station[color],
                  revealed: [], placed: [], barMeshes: [], held: null, carrying: false, misses: 0 };
      (info.revealed?.[color] || []).forEach((id, slot) => {
        p.revealed[slot] = id; p.placed[slot] = ledgeToken(id, slot); p.half.group.add(p.placed[slot]);
      });
      showProgress(p, p.revealed);
      view.players[color] = p;
    }
    view.turn = viewPlayer(view, info.turnId);
    view.winner = viewPlayer(view, info.winnerId);
    views.set(station.id, view);
    return view;
  }
  function clearView(stationId) {
    const view = views.get(stationId);
    if (!view) return;
    view.gen++; views.delete(stationId);
    for (const p of Object.values(view.players)) {
      for (const mesh of [...p.placed, ...p.barMeshes, p.held]) if (mesh) p.half.group.remove(mesh);
      getRemoteCharacter?.(p.id)?.root.scale.setScalar(1);
      drawBar(p.half, []);
    }
    if (watchId === stationId) watchEnded();
    renderQueue();
  }
  // the booth sign doubles as the scoreboard for players walking past
  function viewChanged(view) {
    const { red, blue } = view.players, say = view.say;
    if (view.winner) view.station.sign.set('WINNER', C_WIN, `${view.winner.name} wins!`);
    else if (say?.big) view.station.sign.set('IN PROGRESS', C_PROGRESS, say.big, say.cls === 'is-correct' ? '#3cff2a' : '#ff2a2a');
    else if (say) view.station.sign.set('IN PROGRESS', C_PROGRESS, `${say.name}: ${say.text}`);
    else if (view.turn) view.station.sign.set('IN PROGRESS', C_PROGRESS, `${view.turn.name} is guessing!`);
    else view.station.sign.set('IN PROGRESS', C_PROGRESS, `${red.name} vs ${blue.name}`);
    if (watchId === view.station.id) {
      if (!say) show(ui.banner, false);
      else if (say.big) bannerBig(say.big, say.cls);
      else sayBanner(say.name, SIDE_COLOR[say.color], say.text);
      renderWatch();
    }
  }
  function syncView(station, info) {
    const live = info.inProgress && !info.bot && info.players?.red && info.players?.blue;
    let view = views.get(station.id);
    if (view && (!live || view.players.red.id !== info.players.red || view.players.blue.id !== info.players.blue)) {
      clearView(station.id); view = null;
    }
    if (!live) {
      const count = Object.keys(info.players || {}).length;
      const open = !count || info.waiting;
      station.sign.set(open ? 'AVAILABLE' : 'IN PROGRESS', open ? C_AVAILABLE : C_PROGRESS, info.bot ? 'Practice vs. Bot' : `${count}/2 Players`);
      return;
    }
    if (!view) view = createView(station, info);
    for (const color of ['red', 'blue']) view.players[color].name = info.names?.[color] || view.players[color].name;
    viewChanged(view);
    renderQueue();
  }
  function viewEvent(stationId, event) {
    const view = views.get(stationId);
    if (!view || !event) return;
    if (event.type === 'match-ended') { clearView(stationId); return; }
    view.chain = view.chain.then(() => replay(view, event)).catch((error) => console.error('[match] spectator replay failed:', error));
  }
  // same beats as place(): carry the object, drop it on the ledge, then reveal or remove it
  async function replay(view, ev) {
    const g = view.gen, alive = () => g === view.gen;
    if (ev.type === 'game-start') {
      view.turn = viewPlayer(view, ev.turnPlayerId); view.say = null; viewChanged(view);
      return;
    }
    if (ev.type === 'turn-passed') {
      const p = viewPlayer(view, ev.playerId);
      view.turn = viewPlayer(view, ev.nextTurnId);
      view.say = p ? { name: p.name, color: p.color, text: 'Out of time!' } : null; viewChanged(view);
      await vwait(1); if (!alive()) return;
      view.say = null; viewChanged(view);
      return;
    }
    if (ev.type !== 'guess-result') return;
    const p = viewPlayer(view, ev.playerId), slot = ev.index;
    if (!p || !Number.isInteger(slot) || slot < 0 || slot >= PATTERN_LENGTH || !TOKEN[ev.tokenId]) return;
    view.turn = p;
    const prev = slot > 0 ? p.revealed[slot - 1] : null;
    const held = tokenMesh(ev.tokenId, TOKEN_SIZE); held.rotation.y = Math.PI / 2;
    held.position.set(DECK_X + 1.8 * CHAR_SCALE, DECK_Y + 3.2 * CHAR_SCALE, SLOT_Z(slot));
    p.half.group.add(held); p.held = held; p.carrying = true;
    view.say = { name: p.name, color: p.color, text: prev === ev.tokenId ? `Another ${TOKEN[ev.tokenId].name}?` : `Is It ${TOKEN[ev.tokenId].name}?` };
    viewChanged(view);
    await vwait(1.1); if (!alive()) return;
    p.carrying = false;
    const from = held.position.clone(), to = new THREE.Vector3(LEDGE_X, LEDGE_Y + TOKEN_SIZE / 2, SLOT_Z(slot));
    for (let t = 0; t <= 1.0001; t += 0.1) {
      held.position.lerpVectors(from, to, t); held.position.y += Math.sin(t * Math.PI) * 2;
      await vwait(0.035); if (!alive()) return;
    }
    await vwait(0.9); if (!alive()) return;
    if (ev.correct) {
      p.revealed[slot] = ev.tokenId; p.placed[slot] = held; p.held = null;
      showProgress(p, p.revealed);
      view.say = { big: 'Correct!', cls: 'is-correct' };
    } else {
      p.misses++;
      view.say = { big: 'No, no, no!', cls: 'is-wrong' };
    }
    viewChanged(view);
    if (!ev.correct) {
      for (let s = 1; s > 0; s -= 0.1) { held.scale.setScalar(Math.max(0.01, s)); await vwait(0.03); if (!alive()) return; }
      p.half.group.remove(held); p.held = null;
    }
    await vwait(0.9); if (!alive()) return;
    view.winner = viewPlayer(view, ev.winnerId);
    view.turn = view.winner ? null : viewPlayer(view, ev.nextTurnId) || viewOther(view, p);
    view.say = null; viewChanged(view);
  }

  /* ----- watch mode: spectator camera + scoreboard ----- */
  function startWatching(stationId) {
    if (!views.has(stationId) || !canQueue()) return;
    watchId = stationId; camActive = true; camInit = false;
    setPhase('watching');
    viewChanged(views.get(stationId));
  }
  function stopWatching() {
    if (phase !== 'watching') return;
    watchId = null; camActive = false;
    setPhase('idle');
  }
  function watchEnded() {
    const next = liveStationIds().find((id) => id !== watchId);
    toast('Match over!');
    if (next) startWatching(next); else stopWatching();
  }
  function cycleWatch(step) {
    const ids = liveStationIds(), at = ids.indexOf(watchId);
    if (ids.length > 1) startWatching(ids[(at + step + ids.length) % ids.length]);
  }
  function renderWatch() {
    const view = views.get(watchId);
    if (!view) return;
    const ids = liveStationIds();
    ui.watchTitle.replaceChildren();
    el('span', 'mm-watch__live', ui.watchTitle, '● LIVE ');
    el('span', '', ui.watchTitle, `Booth ${view.station.id}`);
    ui.watchPrev.disabled = ui.watchNext.disabled = ids.length < 2;
    ui.watchRows.replaceChildren();
    for (const p of [view.players.red, view.players.blue]) {
      const row = el('div', 'mm-watch__row' + (view.turn === p ? ' is-turn' : ''), ui.watchRows);
      const name = el('span', 'mm-watch__name', row, p.name); name.style.color = SIDE_COLOR[p.color];
      const cells = el('div', 'mm-watch__cells', row);
      const next = p.revealed.length;
      for (let i = 0; i < PATTERN_LENGTH; i++) {
        const cell = el('span', 'mm-watch__cell' + (view.turn === p && i === next ? ' is-next' : ''), cells);
        if (p.revealed[i]) { const im = el('img', '', cell); im.src = tokenIcon(p.revealed[i]); im.alt = TOKEN[p.revealed[i]].name; }
        else cell.textContent = '?';
      }
      el('span', 'mm-watch__score', row, `${next}/${PATTERN_LENGTH}`).title = `${p.misses} wrong guesses seen`;
    }
    ui.watchStatus.textContent = view.winner ? `${view.winner.name} cracked the pattern first!`
      : view.turn ? `${view.turn.name} is guessing...` : 'Players are choosing their patterns...';
    ui.watchQueue.textContent = inQueue ? `Searching for an opponent… (${queueSize} in queue)` : '';
    ui.watchFind.textContent = inQueue ? 'CANCEL SEARCH' : 'FIND MATCH';
    ui.watchFind.className = 'mm-btn ' + (inQueue ? 'mm-btn--orange' : 'mm-btn--green');
  }

  /* ----- wiring ----- */
  function promptAction() {
    if (!nearPad || phase !== 'idle') return;
    if (nearPad.action === 'watch') startWatching(nearPad.station.id);
    else joinBooth(nearPad.station, nearPad.color);
  }
  ui.prompt.onclick = promptAction;
  ui.leave.onclick = leave;
  ui.vsBot.onclick = () => {
    if (phase !== 'joined') return;
    multiplayer?.send('play-bot');   // the server turns your waiting booth into a practice booth
    playVsBot();
  };
  ui.reset.onclick = () => toast('Coming soon!');
  ui.skip.onclick = () => toast('Coming soon!');
  ui.watchPrev.onclick = () => cycleWatch(-1);
  ui.watchNext.onclick = () => cycleWatch(1);
  ui.watchStop.onclick = stopWatching;
  ui.watchFind.onclick = () => { if (inQueue) exitQueue(); else enterQueue(); };
  if (queueUI.bot) queueUI.bot.onclick = requestBot;
  if (queueUI.watch) queueUI.watch.onclick = () => {
    const id = liveStationIds()[0];
    if (!id) return;
    closeQueueScreen(true);
    startWatching(id);
  };
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input,textarea')) return;
    if (e.key.toLowerCase() === 'e') promptAction();
    else if (e.key === 'Escape' && phase === 'watching') stopWatching();
  });
  // The PLAY modal is the queue: opening it joins, closing it (CANCEL, ✕, Esc) leaves.
  addEventListener('cc:screen', (e) => {
    if (e.detail === 'matchmaking') enterQueue();
    else if (lastScreen === 'matchmaking' && !keepQueue && phase !== 'watching') exitQueue();
    lastScreen = e.detail;
    renderQueue();
  });
  addEventListener('cc:network', (e) => {
    if (e.detail.connected && inQueue) multiplayer.send('join-queue');   // the server may have dropped us
    if (!e.detail.connected) pendingBot = false;
    renderQueue();
  });
  addEventListener('cc:multiplayer-message', (event) => {
    const message = event.detail;
    if (message.type === 'snapshot') {
      // booths missing from a (re)connect snapshot are empty now
      const listed = new Set((message.stations || []).map((st) => st.stationId));
      for (const st of STATIONS) {
        if (listed.has(st.id) || M?.station.id === st.id) continue;
        stationInfo.delete(st.id);
        syncView(st, { stationId: st.id, players: {}, inProgress: false });
      }
    } else if (message.type === 'station-updated') {
      const station = STATIONS.find((item) => item.id === message.stationId);
      if (!station) return;
      stationInfo.set(station.id, message);
      if (M?.station.id !== station.id) syncView(station, message);   // your own booth's sign is driven by your match
      renderQueue();
    } else if (message.type === 'queue-status') {
      inQueue = !!message.queued; queueSize = message.size || 0;
      renderQueue();
    } else if (message.type === 'bot-station' && pendingBot) {
      const station = STATIONS.find((item) => item.id === message.stationId);
      if (station && canQueue() && !M) seatForBot(station, message.color);
      else { pendingBot = false; multiplayer?.send('leave-station'); }
    } else if (message.type === 'join-denied' && pendingBot) {
      pendingBot = false;
      toast(message.message || 'All booths are busy.');
    } else if (message.type === 'join-denied' && phase === 'joined' && M?.station.id === message.stationId) {
      toast(message.message || 'That side is already taken.');
      leave();
    } else if (message.type === 'match-ready') {
      const station = STATIONS.find((item) => item.id === message.stationId);
      const mine = message.players?.find((player) => player.id === multiplayer?.clientId);
      if (!station || !mine) return;
      const waitingHere = phase === 'joined' && M?.station.id === station.id;   // seated on a pad, opponent arrived
      if (M && !waitingHere) return;
      inQueue = false;
      stopWatching();
      closeQueueScreen(false);
      if (!waitingHere || M.me.color !== mine.color) takeSeat(station, mine.color);
      const opponent = message.players.find((player) => player.id !== multiplayer?.clientId);
      if (opponent) {
        M.opp.id = opponent.id;
        M.opp.name = opponent.name;
        M.opp.isBot = false;
        M.opp.char = getRemoteCharacter?.(opponent.id) || null;
      }
      toast(opponent ? `Matched with ${opponent.name}!` : 'Opponent found!');
      window.dispatchEvent(new CustomEvent('cc:match-ready', { detail: message }));
      beginNetworkMatch();
    } else if (message.type === 'match-event' && message.stationId === M?.station.id) {
      const event = message.event;
      if (event?.type === 'game-start') {
        networkStartWaiter?.(event.turnPlayerId);
        networkStartWaiter = null;
      } else if (event?.type === 'guess-result' || event?.type === 'turn-passed') {
        networkGuessWaiter?.(event.type === 'turn-passed'
          ? { passed: true }
          : { id: event.tokenId, correct: event.correct, winnerId: event.winnerId });
        networkGuessWaiter = null;
      } else if (event?.type === 'match-ended') {
        toast(event.reason || 'Opponent left.');
        leave();
      }
    } else if (message.type === 'match-event') {
      viewEvent(message.stationId, message.event);
    }
  });
  refreshUI();
  renderQueue();

  /* ----- per frame ----- */
  function animatePlayer(p, dt) {
    if (!p.char) return;
    let speed = 0;
    if (p.walkTo) {
      const d = tmpA.subVectors(p.walkTo, p.pos), dist = d.length(), step = 16 * dt;
      if (dist <= step) { p.pos.copy(p.walkTo); p.walkTo = null; }
      else { p.pos.addScaledVector(d.normalize(), step); speed = 16; }
    }
    W(p.half, p.pos.x, p.pos.y, p.pos.z, tmpB);
    p.char.root.position.copy(tmpB);
    p.char.root.rotation.y = roadHeading(p.half);
    if (p.held) p.held.position.set(p.pos.x + 1.8 * CHAR_SCALE, p.pos.y + 3.2 * CHAR_SCALE, p.pos.z);
    p.char.setState('idle');
    if (p !== M.me) p.char.update(dt, speed);
    return speed;
  }
  // spectated booths: players stand big on the deck and carry the object they are asking about
  function animateViews() {
    for (const view of views.values()) {
      if (!view.turn && !view.winner) continue;
      for (const p of Object.values(view.players)) {
        const char = getRemoteCharacter?.(p.id);
        if (!char) continue;
        if (char.root.scale.x !== CHAR_SCALE) char.root.scale.setScalar(CHAR_SCALE);
        if (!p.carrying || !p.held) continue;
        p.half.group.worldToLocal(char.root.getWorldPosition(tmpA));
        if (tmpA.y > DECK_Y - 2) p.held.position.set(tmpA.x + 1.8 * CHAR_SCALE, tmpA.y + 3.2 * CHAR_SCALE, tmpA.z);
      }
    }
  }
  // free booth or a free side next to a waiting player → join; live match → watch
  function padAction(station, color) {
    if (views.has(station.id)) return 'watch';
    const info = stationInfo.get(station.id);
    if (!info || !Object.keys(info.players || {}).length) return 'join';
    return info.waiting && !info.players[color] ? 'join' : null;
  }

  return {
    _debug: () => M,   // dev tests only
    locksPlayer: () => phase !== 'idle',
    ownsAvatar: () => phase === 'playing',
    // while playing, the match moves the opponent on the deck; network updates must not fight it
    controlsRemote: (id) => phase === 'playing' && !!M && !M.opp.isBot && M.opp.id === id,
    cameraActive: () => camActive,
    avatarSpeed: () => lastSpeed,
    update(dt) {
      for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); t.r(); } }
      for (let i = vtimers.length - 1; i >= 0; i--) { const t = vtimers[i]; t.t -= dt; if (t.t <= 0) { vtimers.splice(i, 1); t.r(); } }
      animateViews();
      // prompt near a booth pad: join the queue at a free booth, watch a live one
      const prevAction = nearPad?.action;
      nearPad = null;
      if (phase === 'idle') {
        let best = JOIN_RADIUS;
        for (const st of STATIONS) for (const color of ['red', 'blue']) {
          const pad = st[color].pad, d = Math.hypot(pad.x - feet.x, pad.z - feet.z), action = padAction(st, color);
          if (action && d < best && feet.y < 1) { best = d; nearPad = { station: st, color, action }; }
        }
      }
      show(ui.prompt, !!nearPad);
      if (nearPad) {
        if (nearPad.action !== prevAction) ui.promptText.textContent = nearPad.action === 'watch' ? 'Watch Game' : 'Join Game';
        tmpA.copy(nearPad.station[nearPad.color].pad).add(new THREE.Vector3(0, 3.5, 0)).project(camera);
        ui.prompt.style.left = `${(tmpA.x * 0.5 + 0.5) * innerWidth}px`; ui.prompt.style.top = `${(-tmpA.y * 0.5 + 0.5) * innerHeight}px`;
      }
      lastSpeed = 0;
      if (M && (phase === 'joined' || phase === 'starting' || phase === 'voting' || phase === 'building')) {
        feet.copy(M.me.half.pad);
        if (M.opp.isBot && M.opp.char) { M.opp.char.setState('idle'); M.opp.char.update(dt, 0); }   // a real opponent is animated by the network
      }
      if (phase === 'playing' && M) {
        const s = animatePlayer(M.me, dt); animatePlayer(M.opp, dt);
        feet.copy(me.root.position);
        me.update(dt, s);
        lastSpeed = s;
      }
    },
    updateCamera(dt) {
      const view = phase === 'watching' ? views.get(watchId) : null;
      const half = view ? (view.turn || view.winner || view.players.red).half : M && M.turn ? M.turn.half : null;
      if (!half) return;
      W(half, CAM_LOCAL.x, CAM_LOCAL.y, CAM_LOCAL.z, tmpA); W(half, LOOK_LOCAL.x, LOOK_LOCAL.y, LOOK_LOCAL.z, tmpB);
      if (!camInit) { camPos.copy(camera.position); camLook.copy(tmpB); camInit = true; }
      const k = 1 - Math.exp(-dt * 4);
      camPos.lerp(tmpA, k); camLook.lerp(tmpB, k);
      camera.position.copy(camPos); camera.lookAt(camLook);
    }
  };
}
