// HUD glue: screen switcher (URL hash), avatar slots, dev panel, offer rotation,
// event countdown.
import { getLocalPlayer } from '../bloxity/legion-sdk.js';
import { initPopups, openBuy, OFFER_INFO } from './popups.js';
// Everything that will later call into game logic is a named no-op stub below,
// so selectors in docs/DESIGN.md map 1:1 onto future functions.

/* ---------- player identity (Boxity SDK, read-only, optional) ---------- */
export function colorFromName(name) {
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 52%)`;
}

export function getPlayerIdentity() {
  const p = getLocalPlayer();
  return { name: p.name, pfp: p.pfp, avatar: p.equipped };
}

/**
 * Fill an .avatar-slot element. Default = PLACEHOLDER circle with the first letter.
 * If the SDK gave us a profile picture we show it; the 3D avatar render
 * (Legion.SDK.avatar.getEquipped / getSkinTextureUrl) is wired in a later phase.
 * Uses textContent / DOM properties only — never innerHTML with player data.
 */
export function renderAvatar(slotElement, playerIdentity) {
  if (!slotElement) return;
  const id = playerIdentity || getPlayerIdentity();
  const face = slotElement.querySelector('.avatar-slot__face');
  const label = slotElement.querySelector('.avatar-slot__name');
  if (label) label.textContent = id.name;
  if (!face) return;
  face.replaceChildren();
  if (id.pfp) {
    const img = document.createElement('img');
    img.className = 'avatar-slot__img';
    img.alt = '';
    img.src = id.pfp;
    img.onerror = () => { img.remove(); placeholder(); };
    face.append(img);
  } else placeholder();
  function placeholder() {
    face.classList.add('PLACEHOLDER');
    face.style.background = colorFromName(id.name);
    face.textContent = id.name.trim().charAt(0).toUpperCase() || '?';
  }
}

/* ---------- future function stubs (Phase 1+) ---------- */
export const Stubs = {
  openShop: () => showScreen('shop'),
  openInventory: () => showScreen('inventory'),
  openIndex: () => showScreen('index'),
  openFreeGift: () => showScreen('gift'),
  openPacks: () => showScreen('packs'),
  buyOffer: (id) => OFFER_INFO[id] && openBuy(OFFER_INFO[id]),
  joinQueue: () => showScreen('matchmaking'),
  returnToLobby: () => window.dispatchEvent(new CustomEvent('cc:return-to-lobby')),
  openDaily: () => showScreen('daily'),
  claimDaily: (day) => {               // visual only — the server grants rewards later
    const card = document.getElementById(`daily-day-${day}`);
    const btn = card && card.querySelector('.day__btn');
    if (!btn || card.classList.contains('is-claimed')) return;
    card.classList.add('is-claimed'); btn.disabled = true; btn.querySelector('span').textContent = 'CLAIMED';
  },
  claimAllDaily: () => console.info('[stub] claimAllDaily (85 gems)'),
  placeTokenInSlot: (token, slot) => console.info('[stub] placeTokenInSlot', token, slot),
  submitGuess: () => console.info('[stub] submitGuess'),
  rematch: () => showScreen('game'),
  closeModal: () => showScreen('lobby')
};

/* ---------- screens ---------- */
const SCREENS = ['lobby', 'shop', 'inventory', 'index', 'gift', 'daily', 'packs', 'matchmaking', 'game', 'result'];
export function showScreen(name) {
  if (!SCREENS.includes(name)) name = 'lobby';
  document.querySelectorAll('.screen[data-screen]').forEach(el => { el.hidden = el.dataset.screen !== name; });
  document.body.dataset.screen = name;
  const base = location.hash.split('?');
  if (base[0] !== '#' + name) history.replaceState(null, '', '#' + name + (base[1] ? '?' + base[1] : ''));
  document.querySelectorAll('.dev-panel__screen').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.go === name)));
  window.dispatchEvent(new CustomEvent('cc:screen', { detail: name }));
}

/* ---------- offers rotation (video: changes every ~10 s) ---------- */
const OFFERS_TOP = ['offer-2x-cash', 'offer-2x-wins'];
const OFFERS_BOTTOM = ['offer-starter', 'offer-fall', 'offer-limited'];
function rotateOffers(step) {
  const show = (ids, active) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.hidden = id !== active; });
  show(OFFERS_TOP, OFFERS_TOP[step % 2]);
  show(OFFERS_BOTTOM, OFFERS_BOTTOM[step % 3]);
}

/* ---------- init ---------- */
export function initHud() {
  initPopups(showScreen);
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.detail > 0) el.blur();   // mouse / touch click: give keys back to the game (WASD, Space)
      const fn = Stubs[el.dataset.action];
      if (fn) fn(el.dataset.arg);
    });
  });
  // click outside a modal panel closes it
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) showScreen('lobby'); }));

  // PLAY becomes RETURN TO LOBBY while you are on the obby side
  const play = document.getElementById('btn-play'), playLabel = document.getElementById('btn-play-label');
  window.addEventListener('cc:zone', (e) => {
    const obby = e.detail === 'obby';
    play.dataset.action = obby ? 'returnToLobby' : 'joinQueue';
    play.classList.toggle('is-return', obby);
    playLabel.textContent = obby ? 'RETURN TO LOBBY' : 'PLAY';
    play.setAttribute('aria-label', obby ? 'Return to lobby' : 'Play — find a match');
  });
  const fillSlots = () => document.querySelectorAll('.avatar-slot').forEach(slot => {
    const who = slot.dataset.player;
    renderAvatar(slot, who === 'me' ? getPlayerIdentity()
      : { name: slot.dataset.sampleName || 'Opponent', pfp: null, avatar: null });
  });
  fillSlots();
  window.addEventListener('cc:player', fillSlots); // SDK login / avatar change

  // EVENT timer, two phases seen in the screenshots:
  //   countdown: italic "Event In: 11:27" → active: EVENT badge counting down (15:00)
  const timer = document.getElementById('event-timer'), eventBox = document.getElementById('hud-event');
  const PHASES = { countdown: { next: 'active', length: 30 * 60, say: 'starts' }, active: { next: 'countdown', length: 15 * 60, say: 'ends' } };
  let phase = 'countdown', remaining = 11 * 60 + 27;
  const showTimer = () => {
    const s2 = Math.max(0, Math.floor(remaining));
    const txt = `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`;
    if (eventBox.dataset.phase !== phase) eventBox.dataset.phase = phase;
    if (timer.textContent !== txt) {
      timer.textContent = txt;
      eventBox.setAttribute('aria-label', `Event ${PHASES[phase].say} in ${Math.floor(s2 / 60)} minutes ${s2 % 60} seconds`);
    }
  };
  showTimer();
  setInterval(() => {
    remaining -= 1;
    if (remaining < 0) { phase = PHASES[phase].next; remaining = PHASES[phase].length; }
    showTimer();
  }, 1000);
  window.addEventListener('hashchange', () => showScreen(location.hash.slice(1).split('?')[0]));
  // Daily Rewards pops up when the game opens (screenshot 83)
  const startHash = location.hash.slice(1).split('?')[0];
  showScreen(startHash && startHash !== 'lobby' ? startHash : 'daily');
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.dataset.screen !== 'lobby') showScreen('lobby'); });

  // offers rotate every ≈10.2 s, as in the video
  let step = 0;
  rotateOffers(step);
  setInterval(() => rotateOffers(++step), 10200);

  initDevPanel();
}

function initDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (!panel) return;
  panel.querySelector('.dev-panel__toggle').addEventListener('click', () => panel.classList.toggle('is-open'));
  panel.querySelectorAll('.dev-panel__screen').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.go)));
}
