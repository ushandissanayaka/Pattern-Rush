// 1v1 pattern match, client-side vs BOT (screenshots 62–78).
//   join pad (E / click) → AVAILABLE 1/2 → PLAY VS. BOT → STARTING 3·2·1 → PATTERN VOTING
//   → (optional) pick the opponent's pattern → turns: pick an object, the avatar carries it
//   to the next slot, "Is It X?" → correct: revealed + guess again / wrong: "No, no, no!" and
//   the turn passes. Wrong objects are removed for that slot. First to reveal all 9 wins.
// Real 2-player matches need the server (later); the flow and UI here are the same.
import * as THREE from 'three';
import { STATIONS } from '../scene/world.js';
import { LegionCharacter, LEGION_CDN } from '../bloxity/legion-avatar.js';
import { TOKENS, TOKEN, PATTERN_LENGTH, randomPattern, tokenIcon, tokenMesh, drawBarCell } from './tokens.js';

const TURN_TIME = 20, VOTE_TIME = 5, BUILD_TIME = 20, START_COUNT = 3;
const JOIN_RADIUS = 5;
const C_AVAILABLE = '#2fe01a', C_STARTING = '#d61ad6', C_PROGRESS = '#ff1a1a', C_WIN = '#ffd21a';

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
  el('span', 'mm-prompt__key', ui.prompt, 'E'); el('span', 'mm-prompt__text', ui.prompt, 'Join Game');

  ui.wait = el('div', 'mm-wait', root);
  el('p', 'mm-wait__hint stroke-text', ui.wait, "Don't want to wait for an opponent?");
  ui.vsBot = el('button', 'mm-btn mm-btn--orange', ui.wait, 'PLAY VS. BOT');
  ui.leave = el('button', 'mm-btn mm-btn--red', root, 'LEAVE'); ui.leave.classList.add('mm-leave');

  ui.vote = el('div', 'mm-vote', root);
  ui.voteTitle = el('h2', 'mm-title stroke-text', ui.vote, 'PATTERN VOTING (5s)');
  ui.votePick = el('button', 'mm-btn mm-btn--orange mm-btn--wide', ui.vote, 'PICK OPPONENTS PATTERN');
  ui.voteRandom = el('button', 'mm-btn mm-btn--pink mm-btn--wide', ui.vote, 'RANDOM PATTERNS');

  ui.build = el('div', 'mm-panel mm-build', root);
  ui.buildHead = el('div', 'mm-panel__head stroke-text', ui.build, 'Pick Pattern! (20s)');
  ui.buildSlots = el('div', 'mm-build__slots', ui.build);
  ui.buildOpts = el('div', 'mm-panel__opts', ui.build);
  ui.buildOk = el('button', 'mm-btn mm-btn--green', ui.build, 'CONFIRM');

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

/* ---------------- match system ---------------- */
export function createMatchSystem({ scene, camera, me, feet, state, getName }) {
  const ui = buildUI();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  let phase = 'idle', gen = 0, nearPad = null;
  let M = null;                          // current match
  const timers = [];
  const wait = (s) => new Promise(r => timers.push({ t: s, r }));
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camActive = false, camInit = false;

  const setPhase = (p) => { phase = p; document.body.dataset.match = p; refreshUI(); };
  function refreshUI() {
    show(ui.wait, phase === 'joined');
    show(ui.leave, phase === 'joined' || phase === 'starting');
    show(ui.vote, phase === 'voting');
    show(ui.build, phase === 'building');
    show(ui.turn, phase === 'playing');
    if (phase !== 'playing') { [ui.guess, ui.submit, ui.repeat, ui.troll, ui.reveal, ui.banner].forEach(e => show(e, false)); }
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

  /* ----- joining ----- */
  function join(station, color) {
    gen++;
    const oppColor = color === 'red' ? 'blue' : 'red';
    M = { station, me: { color, half: station[color], char: me, name: getName(), nameColor: '#ffd21a', isBot: false },
          opp: { color: oppColor, half: station[oppColor], char: null, name: 'Bot', nameColor: '#ffd21a', isBot: true } };
    feet.copy(M.me.half.pad);
    state.heading = roadHeading(M.me.half);
    station.sign.set('AVAILABLE', C_AVAILABLE, '1/2 Players');
    setPhase('joined');
  }
  function leave() {
    if (!M) return;
    gen++; timers.length = 0;
    removeBot();
    M.station.sign.set('AVAILABLE', C_AVAILABLE, '0/2 Players');
    // step off the pad toward the road so the prompt doesn't re-open immediately
    W(M.me.half, 32, 0, 0, tmpA); feet.set(tmpA.x, 0, tmpA.z);
    M = null; setPhase('idle');
  }
  function removeBot() { if (M && M.opp.char) { scene.remove(M.opp.char.root); M.opp.char = null; } }

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

  /* ----- pattern voting / building ----- */
  async function vote(myGen) {
    setPhase('voting');
    M.station.sign.set('VOTING', C_STARTING, 'Voting');
    let choice = null;
    ui.votePick.onclick = () => { choice = 'pick'; ui.votePick.classList.add('is-picked'); ui.voteRandom.classList.remove('is-picked'); };
    ui.voteRandom.onclick = () => { choice = 'random'; ui.voteRandom.classList.add('is-picked'); ui.votePick.classList.remove('is-picked'); };
    ui.votePick.classList.remove('is-picked'); ui.voteRandom.classList.remove('is-picked');
    for (let s = VOTE_TIME; s >= 1; s--) {
      ui.voteTitle.textContent = `PATTERN VOTING (${s}s)`;
      await wait(1); if (myGen !== gen) return;
    }
    // the bot always gets a random pattern for you to crack; you may build the bot's
    M.me.target = randomPattern();
    M.opp.target = choice === 'pick' ? await buildPattern(myGen) : randomPattern();
    if (myGen !== gen) return;
    startPlaying(myGen);
  }
  async function buildPattern(myGen) {
    setPhase('building');
    const pat = [];
    const draw = () => {
      ui.buildSlots.replaceChildren();
      for (let i = 0; i < PATTERN_LENGTH; i++) {
        const s = el('button', 'mm-slot', ui.buildSlots);
        if (pat[i]) { const im = el('img', '', s); im.src = tokenIcon(pat[i]); im.alt = TOKEN[pat[i]].name; s.onclick = () => { pat.splice(i, 1); draw(); }; }
        else el('span', '', s, '?');
      }
    };
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
  // code bar: 3D objects in the revealed slots (opponent's side: their full pattern is visible)
  function syncBar(p) {
    const vis = p === M.opp ? p.target : p.revealed;
    drawBar(p.half, vis);
    p.barMeshes = p.barMeshes || [];
    for (let i = 0; i < PATTERN_LENGTH; i++) {
      if (vis[i] && !p.barMeshes[i]) {
        const m = tokenMesh(vis[i], BAR_SIZE); m.rotation.y = Math.PI / 2;
        m.position.set(BAR_X, BAR_Y, SLOT_Z(i)); p.half.group.add(m); p.barMeshes[i] = m;
      }
    }
  }
  function setupPlayer(p) {
    p.idx = 0; p.revealed = []; p.wrong = Array.from({ length: PATTERN_LENGTH }, () => new Set()); p.placed = [];
    p.pos = new THREE.Vector3(DECK_X, DECK_Y, IDLE_Z); p.walkTo = null; p.speed = 0;
    p.guide = guideBox(); p.guide.visible = false; p.half.group.add(p.guide);
    if (p.char) p.char.root.scale.setScalar(CHAR_SCALE);
    syncBar(p);
  }
  function startPlaying(myGen) {
    setupPlayer(M.me); setupPlayer(M.opp);
    M.turn = Math.random() < 0.5 ? M.me : M.opp;
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
      const pick = p.isBot ? await botChoose(myGen, p) : await humanChoose(myGen, p);
      if (myGen !== gen) return;
      if (!pick) { keepGoing = false; break; }            // ran out of time
      keepGoing = await place(myGen, p, pick);
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
    return ok ? chosen : null;
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
  async function place(myGen, p, id) {
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
    if (p.target[slot] === id) {
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
    const st = M.station, mine = M.me.half;
    for (const p of [M.me, M.opp]) {
      for (const m of p.placed) if (m) p.half.group.remove(m);
      for (const m of p.barMeshes || []) if (m) p.half.group.remove(m);
      if (p.guide) p.half.group.remove(p.guide);
      if (p.char) p.char.root.scale.setScalar(1);
      drawBar(p.half, []);
    }
    removeBot();
    camActive = false;
    W(mine, 32, 0, 0, tmpA); feet.set(tmpA.x, 0, tmpA.z);
    me.setState('idle');
    M = null; setPhase('idle'); gen++;
    setTimeout(() => st.sign.set('AVAILABLE', C_AVAILABLE, '0/2 Players'), 2500);
  }

  /* ----- wiring ----- */
  ui.prompt.onclick = () => { if (nearPad) join(nearPad.station, nearPad.color); };
  ui.vsBot.onclick = playVsBot;
  ui.leave.onclick = leave;
  ui.reset.onclick = () => toast('Coming soon!');
  ui.skip.onclick = () => toast('Coming soon!');
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e' && phase === 'idle' && nearPad && !e.target.closest?.('input,textarea')) join(nearPad.station, nearPad.color);
  });
  refreshUI();

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

  return {
    _debug: () => M,   // dev tests only
    locksPlayer: () => phase !== 'idle',
    ownsAvatar: () => phase === 'playing',
    cameraActive: () => camActive,
    update(dt) {
      for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); t.r(); } }
      // join prompt near a free pad
      nearPad = null;
      if (phase === 'idle') {
        let best = JOIN_RADIUS;
        for (const st of STATIONS) for (const color of ['red', 'blue']) {
          const pad = st[color].pad, d = Math.hypot(pad.x - feet.x, pad.z - feet.z);
          if (d < best && feet.y < 1) { best = d; nearPad = { station: st, color }; }
        }
      }
      show(ui.prompt, !!nearPad);
      if (nearPad) {
        tmpA.copy(nearPad.station[nearPad.color].pad).add(new THREE.Vector3(0, 3.5, 0)).project(camera);
        ui.prompt.style.left = `${(tmpA.x * 0.5 + 0.5) * innerWidth}px`; ui.prompt.style.top = `${(-tmpA.y * 0.5 + 0.5) * innerHeight}px`;
      }
      if (M && (phase === 'joined' || phase === 'starting' || phase === 'voting' || phase === 'building')) {
        feet.copy(M.me.half.pad);
        if (M.opp.char) { M.opp.char.setState('idle'); M.opp.char.update(dt, 0); }
      }
      if (phase === 'playing' && M) {
        const s = animatePlayer(M.me, dt); animatePlayer(M.opp, dt);
        feet.copy(me.root.position);
        me.update(dt, s);
      }
    },
    updateCamera(dt) {
      const half = M && M.turn ? M.turn.half : null;
      if (!half) return;
      W(half, CAM_LOCAL.x, CAM_LOCAL.y, CAM_LOCAL.z, tmpA); W(half, LOOK_LOCAL.x, LOOK_LOCAL.y, LOOK_LOCAL.z, tmpB);
      if (!camInit) { camPos.copy(camera.position); camLook.copy(tmpB); camInit = true; }
      const k = 1 - Math.exp(-dt * 4);
      camPos.lerp(tmpA, k); camLook.lerp(tmpB, k);
      camera.position.copy(camPos); camera.lookAt(camLook);
    }
  };
}
