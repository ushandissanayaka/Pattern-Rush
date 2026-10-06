// Popups (screenshots 83–93): Daily Rewards, Shop (Offers / Luck / Passes / Cash),
// Inventory, Index, and the purchase confirmation. Prices are in Bloxity Gems.
// Purchases are UI only: "Buy" will call the Bloxity SDK checkout in a later phase.
// All text is set with textContent; art is drawn on canvas (original, no copied assets).
import { TOKENS, tokenIcon, faceIcon } from '../game/tokens.js';

/* ---------------- tiny DOM helpers ---------------- */
function el(tag, cls, parent, text) {
  const e = document.createElement(tag); if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e); return e;
}
function img(src, cls, parent) { const i = el('img', cls, parent); i.src = src; i.alt = ''; i.draggable = false; return i; }
function gemPrice(parent, amount, cls = 'pp-gemprice') {
  const s = el('span', cls, parent); img('assets/gem.svg', 'pp-gem', s); el('span', '', s, String(amount)); return s;
}

/* ---------------- canvas art ---------------- */
const artCache = new Map();
function art(key, w, h, draw) {
  if (!artCache.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); artCache.set(key, c.toDataURL()); }
  return artCache.get(key);
}
// one isometric cash brick (green bills, orange band, black outline)
function brick(g, x, y, s) {
  const w = s, d = s * 0.5, h = s * 0.32;
  const top = [[x, y], [x + w * 0.5, y - d * 0.5], [x + w, y], [x + w * 0.5, y + d * 0.5]];
  const poly = (pts, c) => { g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fillStyle = c; g.fill(); g.stroke(); };
  g.lineWidth = s * 0.045; g.lineJoin = 'round'; g.strokeStyle = '#0d1f10';
  poly([[x, y], [x + w * 0.5, y + d * 0.5], [x + w * 0.5, y + d * 0.5 + h], [x, y + h]], '#2a9a45');
  poly([[x + w * 0.5, y + d * 0.5], [x + w, y], [x + w, y + h], [x + w * 0.5, y + d * 0.5 + h]], '#1f7d38');
  poly(top, '#45c85e');
  g.fillStyle = '#f2a531';   // band across the top + sides
  g.beginPath(); g.moveTo(x + w * 0.62, y - d * 0.19); g.lineTo(x + w * 0.76, y - d * 0.12); g.lineTo(x + w * 0.26, y + d * 0.37); g.lineTo(x + w * 0.12, y + d * 0.3); g.closePath(); g.fill();
  g.fillRect(x + w * 0.12, y + d * 0.3, w * 0.14, h * 0.95);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = s * 0.02;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + w * 0.5 + 1, y + d * 0.5 + h * i / 4); g.lineTo(x + w - 1, y + h * i / 4); g.stroke(); }
}
const cashArt = (n) => art('cash' + n, 256, 220, (g) => {
  const layouts = {
    1: [[50, 90, 156]],
    3: [[20, 120, 110], [126, 120, 110], [72, 80, 110]],
    6: [[10, 140, 92], [90, 140, 92], [170, 140, 76], [50, 105, 92], [130, 105, 92], [90, 70, 92]],
    10: [[0, 160, 80], [70, 165, 80], [140, 160, 80], [35, 130, 80], [105, 130, 80], [175, 130, 70], [70, 100, 80], [140, 100, 80], [105, 70, 80], [40, 72, 70]]
  };
  for (const [x, y, s] of layouts[n]) brick(g, x, y, s);
});
const chestArt = () => art('chest', 256, 220, (g) => {
  g.lineWidth = 7; g.strokeStyle = '#3b1d05'; g.lineJoin = 'round';
  g.fillStyle = '#e8941f'; g.beginPath(); g.roundRect(28, 100, 200, 100, 10); g.fill(); g.stroke();
  g.fillStyle = '#f2b23a'; g.beginPath(); g.moveTo(28, 100); g.lineTo(60, 40); g.lineTo(236, 40); g.lineTo(228, 100); g.closePath(); g.fill(); g.stroke();
  for (const [x, y] of [[70, 92], [120, 84], [165, 92], [95, 70], [145, 66]]) brick(g, x - 30, y - 22, 64);
  g.fillStyle = '#ffd34d'; g.fillRect(112, 130, 32, 30); g.strokeRect(112, 130, 32, 30);
});
const bagArt = () => art('bag', 256, 220, (g) => {
  g.lineWidth = 7; g.strokeStyle = '#4a2a00';
  g.fillStyle = '#f2a01e'; g.beginPath(); g.moveTo(96, 40); g.lineTo(160, 40); g.lineTo(150, 70); g.bezierCurveTo(240, 110, 230, 210, 128, 210); g.bezierCurveTo(26, 210, 16, 110, 106, 70); g.closePath(); g.fill(); g.stroke();
  brick(g, 20, 150, 70); brick(g, 166, 150, 70); brick(g, 92, 20, 70);
});
const cloverArt = (dark) => art('clover' + dark, 256, 256, (g) => {
  g.translate(128, 128); g.lineWidth = 9; g.strokeStyle = dark ? '#123d1a' : '#145c22';
  for (let i = 0; i < 4; i++) {
    g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4);
    g.fillStyle = dark ? '#2e8a3e' : '#3fbf55';
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-70, -30, -60, -110, 0, -82); g.bezierCurveTo(60, -110, 70, -30, 0, 0); g.fill(); g.stroke();
    g.restore();
  }
});
// tall crimped pack wrapper with an emblem
function packArt(key, stops, emblem, leafy = false) {
  return art('pack' + key, 200, 256, (g, w, h) => {
    const path = () => {
      g.beginPath(); const L = 40, R = 160, T = 26, B = 230;
      g.moveTo(L, T); for (let x = L; x < R; x += 15) { g.lineTo(x + 7.5, T - 8); g.lineTo(x + 15, T); }
      g.lineTo(R, B); for (let x = R; x > L; x -= 15) { g.lineTo(x - 7.5, B + 8); g.lineTo(x - 15, B); }
      g.closePath();
    };
    const gr = g.createLinearGradient(40, 20, 160, 236); stops.forEach((c, i) => gr.addColorStop(i / Math.max(1, stops.length - 1), c));
    path(); g.fillStyle = gr; g.fill();
    g.save(); path(); g.clip();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(40, 20); g.lineTo(80, 20); g.lineTo(40, 120); g.fill();
    if (leafy) { g.fillStyle = '#b8320c'; for (const [x, y, r] of [[60, 60, .4], [140, 200, 2.2], [150, 70, 1.2], [55, 190, 2.8]]) { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.ellipse(0, 0, 18, 9, 0, 0, Math.PI * 2); g.fill(); g.restore(); } }
    g.restore();
    path(); g.lineWidth = 8; g.strokeStyle = '#141414'; g.lineJoin = 'round'; g.stroke();
    if (emblem === 'gem') {
      g.save(); g.translate(100, 128);
      const f = [['#bfe9ff', [-36, -6, -18, -26, 0, -6]], ['#e6f7ff', [-18, -26, 18, -26, 0, -6]], ['#8fd3ff', [0, -6, 18, -26, 36, -6]], ['#4aa8f0', [-36, -6, 0, -6, 0, 34]], ['#2c86d8', [0, -6, 36, -6, 0, 34]]];
      for (const [c, p] of f) { g.fillStyle = c; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); g.lineTo(p[4], p[5]); g.closePath(); g.fill(); }
      g.restore();
    } else {
      g.strokeStyle = '#141414'; g.fillStyle = '#141414'; g.lineCap = 'round';
      for (const x of [86, 114]) { g.beginPath(); g.ellipse(x, 112, 5, 9, 0, 0, Math.PI * 2); g.fill(); }
      g.lineWidth = 6; g.beginPath(); g.arc(100, 120, 26, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    }
  });
}
const PACKS = {
  cipher: () => packArt('cipher', ['#ffe94a', '#f2c40c'], 'smile'),
  emoji: () => packArt('emoji', ['#3a3f47', '#121418'], 'gem'),
  shop: () => packArt('shop', ['#ffd6ec', '#fff3a6', '#bfe6ff', '#e0c8ff'], 'smile'),
  fall: () => packArt('fall', ['#ffb43a', '#e2611a'], 'smile', true),
  limited: () => packArt('limited', ['#ffd6ec', '#fff3a6', '#c9f7c2', '#bfe6ff', '#e0c8ff'], 'smile')
};
const silhouette = (shape) => art('sil' + shape, 128, 128, (g) => {
  g.fillStyle = '#050505';
  if (shape === 'circle') { g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill(); }
  else if (shape === 'square') g.fillRect(16, 16, 96, 96);
  else if (shape === 'triangle') { g.beginPath(); g.moveTo(64, 12); g.lineTo(118, 112); g.lineTo(10, 112); g.closePath(); g.fill(); }
  else if (shape === 'crown') { g.beginPath(); g.moveTo(14, 104); g.lineTo(20, 46); g.lineTo(42, 72); g.lineTo(64, 34); g.lineTo(86, 72); g.lineTo(108, 46); g.lineTo(114, 104); g.closePath(); g.fill(); for (const x of [20, 64, 108]) { g.beginPath(); g.arc(x, x === 64 ? 30 : 42, 8, 0, Math.PI * 2); g.fill(); } }
  else if (shape === 'leaf') { for (const [x, y, r] of [[48, 70, -0.6], [80, 84, 0.5]]) { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.ellipse(0, 0, 20, 36, 0, 0, Math.PI * 2); g.fill(); g.restore(); } g.lineWidth = 5; g.strokeStyle = '#050505'; g.beginPath(); g.moveTo(64, 20); g.quadraticCurveTo(58, 50, 48, 60); g.moveTo(64, 20); g.quadraticCurveTo(78, 50, 82, 70); g.stroke(); }
});

/* ---------------- frame ---------------- */
function frame(section, { theme, icon, title, wide }) {
  section.replaceChildren();
  const p = el('div', `pp pp--${theme}${wide ? ' pp--wide' : ''}`, section);
  const head = el('div', 'pp__head', p);
  img(icon, 'pp__icon', head);
  el('h2', 'pp__title pp-stroke', head, title);
  const actions = el('div', 'pp__actions', head);
  const x = el('button', 'pp-x pp-stroke', head, 'X'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', () => api.close());
  const body = el('div', 'pp__body', p);
  return { p, head, actions, body };
}

/* ---------------- payment confirmation (Bloxity Gems) ---------------- */
let buyLayer;
export function openBuy({ name, price, icon }) {
  buyLayer.replaceChildren();
  const box = el('div', 'pay', buyLayer);
  const top = el('div', 'pay__top', box);
  el('span', 'pay__title', top, 'Buy Gems and item');
  const bal = el('span', 'pay__bal', top); img('assets/gem.svg', 'pay__gem', bal); el('span', '', bal, '0');
  const x = el('button', 'pay__x', top, '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = closeBuy;
  const item = el('div', 'pay__item', box);
  img(icon, 'pay__icon', item);
  const meta = el('div', 'pay__meta', item); el('div', 'pay__name', meta, name);
  const pr = el('div', 'pay__price', meta); img('assets/gem.svg', 'pay__gem', pr); el('span', '', pr, String(price));
  const opt = el('button', 'pay__opt', box); opt.type = 'button';
  const l = el('span', 'pay__optl', opt); img('assets/gem.svg', 'pay__gem', l); el('span', '', l, '500');
  const old = el('span', 'pay__old', l); img('assets/gem.svg', 'pay__gem pay__gem--old', old); el('s', '', old, '400');
  el('span', 'pay__usd', opt, '$4.99');
  const buy = el('button', 'pay__buy', box, 'Buy'); buy.type = 'button';
  buy.onclick = () => { buy.textContent = 'Coming soon'; buy.disabled = true; };   // Bloxity checkout hooks in later
  const legal = el('p', 'pay__legal', box, 'Your payment method will be charged. Bloxity ');
  const a = el('a', '', legal, 'Terms of Use'); a.href = 'https://bloxity.io/'; a.target = '_blank'; a.rel = 'noopener';
  legal.append(' apply.');
  buyLayer.hidden = false;
}
function closeBuy() { buyLayer.hidden = true; buyLayer.replaceChildren(); }

/* ---------------- Daily Rewards (screenshot 83) ---------------- */
function buildDaily(section) {
  const { actions, body } = frame(section, { theme: 'daily', icon: art('cal', 128, 128, (g) => {
    g.lineWidth = 8; g.strokeStyle = '#111'; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(12, 18, 104, 98, 14); g.fill(); g.stroke();
    g.fillStyle = '#f2384a'; g.beginPath(); g.roundRect(12, 18, 104, 30, [14, 14, 0, 0]); g.fill(); g.stroke();
    g.fillStyle = '#fff'; for (const x of [38, 90]) { g.fillRect(x - 5, 8, 10, 22); g.strokeRect(x - 5, 8, 10, 22); }
    g.fillStyle = '#2b2f36'; g.font = "900 52px 'Montserrat', sans-serif"; g.textAlign = 'center'; g.fillText('31', 64, 102);
  }), title: 'Daily Rewards' });
  const all = el('button', 'pp-claimall', actions); all.type = 'button';
  el('span', 'pp-stroke', all, 'CLAIM ALL');
  const only = el('span', 'pp-only pp-stroke', all); el('span', '', only, 'ONLY '); gemPrice(only, 85, 'pp-inline');
  all.onclick = () => openBuy({ name: 'Claim All Daily Rewards', price: 85, icon: PACKS.cipher() });
  const grid = el('div', 'daily-grid', body);
  const days = [
    [1, 'pink', PACKS.cipher(), '+1 Cipher Pack', true], [2, 'orange', cashArt(1), '+750 Cash'], [3, 'yellow', PACKS.emoji(), '+1 Emoji Pack'],
    [4, 'green', cashArt(6), '+1.5K Cash'], [5, 'cyan', PACKS.shop(), '+1 Shop Pack'], [6, 'purple', cashArt(10), '+3K Cash']
  ];
  for (const [n, color, icon, label, open] of days) {
    const c = el('div', `day-card day-card--${color}`, grid); c.style.gridArea = `d${n}`;
    el('div', 'day-card__n pp-stroke', c, `DAY ${n}`);
    img(icon, 'day-card__icon', c);
    el('div', 'day-card__label pp-stroke', c, label);
    const b = el('button', `day-card__btn pp-stroke ${open ? 'is-claim' : 'is-locked'}`, c, open ? 'CLAIM' : 'LOCKED'); b.type = 'button';
    if (open) b.onclick = () => { b.textContent = 'CLAIMED'; b.className = 'day-card__btn pp-stroke is-done'; b.disabled = true; };
  }
  const big = el('div', 'day-card day-card--rainbow day-card--big', grid); big.style.gridArea = 'd7';
  el('div', 'day-card__n day-card__n--big pp-stroke', big, 'DAY 7');
  img(faceIcon('#0b0b0b', 'grin'), 'day-card__orb', big);   // PLACEHOLDER legendary item (original art)
  el('div', 'day-card__name pp-stroke', big, 'Shadowgrin');
  el('div', 'day-card__rarity pp-stroke', big, 'Legendary');
  el('button', 'day-card__btn day-card__btn--big pp-stroke is-locked', big, 'LOCKED').type = 'button';
}

/* ---------------- Shop (screenshots 84–87) ---------------- */
const PCT_COLOR = { 37: 'pct--blue', 8: 'pct--orange', 2: 'pct--red' };
function packCard(parent, { theme, packIcon, isNew, title, sub, items, prices, tag }) {
  const card = el('div', `shop-card shop-card--${theme}`, parent);
  const left = el('div', 'shop-card__art', card);
  el('div', 'shop-card__rays', left);
  img(packIcon, 'shop-card__pack', left);
  if (isNew) el('div', 'shop-card__new pp-stroke', card, 'NEW');
  const right = el('div', 'shop-card__main', card);
  el('div', 'shop-card__title pp-stroke', right, title);
  el('div', 'shop-card__sub pp-stroke', right, sub);
  const row = el('div', 'shop-card__items', right);
  for (const it of items) {
    const t = el('div', 'item-chip', row);
    el('span', `item-chip__pct pp-stroke ${PCT_COLOR[it.pct]}`, t, `${it.pct}%`);
    img(it.icon, 'item-chip__icon', t);
    el('span', 'item-chip__name pp-stroke', t, it.name);
  }
  const buy = el('div', 'shop-card__buys', card);
  prices.forEach(([qty, price], i) => {
    const w = el('div', 'buy-wrap', buy);
    el('span', 'buy-wrap__qty pp-stroke', w, `x${qty}`);
    const b = el('button', `buy-btn pp-stroke ${i === 0 ? 'buy-btn--purple' : `buy-btn--${theme === 'limited' ? 'green' : 'orange'}`}`, w); b.type = 'button';
    gemPrice(b, price, 'pp-inline');
    if (i === 0) el('span', 'buy-btn__tag pp-stroke', w, tag);
    b.onclick = () => openBuy({ name: `${title} x${qty}`, price, icon: packIcon });
  });
}
function buildShop(section) {
  const { p, body } = frame(section, { theme: 'shop', icon: 'assets/basket.svg', title: 'Shop', wide: true });
  const tabs = el('div', 'shop-tabs', p);
  const scroller = el('div', 'shop-scroll', body);
  const sec = (title) => { const s = el('div', 'shop-sec', scroller); el('div', 'shop-sec__title pp-stroke', s, title); return s; };

  const offers = sec('Best Offers');
  packCard(offers, { theme: 'fall', packIcon: PACKS.fall(), isNew: true, title: 'FALL PACK', sub: 'Exclusive fall items available!', tag: '52% OFF',
    items: [
      { pct: 37, name: 'Maple Leaf', icon: faceIcon('#d9761f', '', 'block') }, { pct: 37, name: 'Honey Block', icon: faceIcon('#e0a43a', '', 'block') },
      { pct: 8, name: 'Apple Grin', icon: faceIcon('#e5251f', 'smile') }, { pct: 8, name: 'Spice Latte', icon: faceIcon('#b07a4a', 'smile') },
      { pct: 8, name: 'Gourd Grin', icon: faceIcon('#ef7d16', 'grin') }, { pct: 2, name: 'Pumpkin Pal', icon: faceIcon('#ff8a1a', 'smile') }],
    prices: [[50, 839], [10, 249], [3, 89], [1, 35]] });
  packCard(offers, { theme: 'limited', packIcon: PACKS.limited(), title: 'LIMITED TIME PACK', sub: 'Get exclusive items!', tag: 'BEST DEAL',
    items: [
      { pct: 37, name: 'Curious', icon: faceIcon('#4fd13a', 'grin') }, { pct: 37, name: 'Redstone', icon: faceIcon('#b8231c', '', 'block') },
      { pct: 8, name: 'Devil Face', icon: faceIcon('#8b3fd6', 'grin') }, { pct: 8, name: 'Mop Top', icon: faceIcon('#9a5a2a', 'smile') },
      { pct: 8, name: 'Pup Face', icon: faceIcon('#e2c08f', 'smile') }, { pct: 2, name: 'Halo', icon: faceIcon('#f6f6f6', 'smile') }],
    prices: [[50, 955], [10, 279], [3, 105], [1, 40]] });

  const st = el('div', 'starter', offers);
  el('div', 'starter__title pp-stroke', st, 'Starter Pack');
  const srow = el('div', 'starter__row', st);
  const tile = (top, icon, name, rare) => { const t = el('div', 'starter__tile', srow); el('span', `starter__top pp-stroke${rare ? ' is-rare' : ''}`, t, top); img(icon, 'starter__icon', t); if (name) el('span', 'starter__name pp-stroke', t, name); };
  tile('1K Cash', cashArt(1)); el('span', 'starter__plus pp-stroke', srow, '+');
  tile('Rare', faceIcon('#f6e21c', 'grin'), 'Smugly', true); el('span', 'starter__plus pp-stroke', srow, '+');
  tile('Rare', faceIcon('#f6c21c', 'smile', 'ball', 'nerd'), 'Nerdy', true);
  const sbuy = el('div', 'starter__buy', srow);
  el('div', 'starter__op pp-stroke', sbuy, 'OP Offer!');
  const sb = el('button', 'buy-btn buy-btn--green buy-btn--big pp-stroke', sbuy); sb.type = 'button'; gemPrice(sb, 25, 'pp-inline');
  sb.onclick = () => openBuy({ name: 'Starter Pack', price: 25, icon: 'assets/starter-pack.svg' });

  const luck = sec('Server Luck');
  const lc = el('div', 'luck', luck);
  img(cloverArt(false), 'luck__clover', lc);
  el('div', 'luck__mins pp-stroke', lc, '+15 Mins');
  const lm = el('div', 'luck__mid', lc);
  el('div', 'luck__title pp-stroke', lm, 'Server Luck');
  const big = el('div', 'luck__mult pp-stroke', lm); el('span', '', big, '1x > '); el('span', 'luck__two', big, '2x');
  const lr = el('div', 'luck__buy', lc); el('div', 'luck__up pp-stroke', lr, 'Upgrade to 2x');
  const lb = el('button', 'buy-btn buy-btn--green buy-btn--big pp-stroke', lr); lb.type = 'button'; gemPrice(lb, 35, 'pp-inline');
  lb.onclick = () => openBuy({ name: 'Server Luck 2x', price: 35, icon: cloverArt(false) });

  const passes = sec('Gamepasses');
  const pg = el('div', 'passes', passes);
  for (const [cls, name, desc, icon, price] of [['green', 'x2 Cash', 'Get double cash permanently!', cashArt(1), 35], ['orange', 'x2 Wins', 'Get double wins permanently!', 'assets/trophy.svg', 75]]) {
    const c = el('div', `pass pass--${cls}`, pg);
    el('div', 'pass__rays', c); img(icon, 'pass__icon', c);
    el('div', 'pass__name pp-stroke', c, name); el('div', 'pass__desc pp-stroke', c, desc);
    const b = el('button', 'buy-btn buy-btn--green pass__buy pp-stroke', c); b.type = 'button'; gemPrice(b, price, 'pp-inline');
    b.onclick = () => openBuy({ name, price, icon });
  }

  const cash = sec('Extra Cash');
  const cg = el('div', 'cashgrid', cash);
  for (const [amt, price, icon, wide, best] of [['150K', 1119, chestArt(), true, true], ['50K', 449, bagArt(), true], ['10K', 105, cashArt(10)], ['3K', 35, cashArt(3)], ['1K', 14, cashArt(1)]]) {
    const c = el('div', `cashcard${wide ? ' cashcard--wide' : ''}`, cg);
    img(icon, 'cashcard__icon', c);
    el('div', 'cashcard__amt pp-stroke', c, `${amt} Cash`);
    if (best) el('div', 'cashcard__best pp-stroke', c, 'Best Deal!');
    const b = el('button', 'buy-btn buy-btn--green cashcard__buy pp-stroke', c); b.type = 'button'; gemPrice(b, price, 'pp-inline');
    b.onclick = () => openBuy({ name: `${amt} Cash`, price, icon });
  }

  const tabDefs = [['Offers', 'purple', PACKS.limited(), offers], ['Luck', 'teal', cloverArt(true), luck], ['Passes', 'brown', 'assets/trophy.svg', passes], ['Cash', 'olive', bagArt(), cash]];
  const tabBtns = tabDefs.map(([name, color, icon, target]) => {
    const t = el('button', `shop-tab shop-tab--${color}`, tabs); t.type = 'button';
    img(icon, 'shop-tab__icon', t); el('span', 'shop-tab__name pp-stroke', t, name);
    t.onclick = () => scroller.scrollTo({ top: target.offsetTop - scroller.offsetTop, behavior: 'smooth' });
    return [t, target];
  });
  scroller.addEventListener('scroll', () => {
    let cur = tabBtns[0];
    for (const tb of tabBtns) if (tb[1].offsetTop - scroller.offsetTop <= scroller.scrollTop + 40) cur = tb;
    tabBtns.forEach(tb => tb[0].classList.toggle('is-active', tb === cur));
  });
  tabBtns[0][0].classList.add('is-active');
}

/* ---------------- Inventory (screenshot 88) ---------------- */
function buildInventory(section) {
  const { body } = frame(section, { theme: 'inventory', icon: 'assets/backpack.svg', title: 'Inventory' });
  el('div', 'pp-heading pp-stroke', body, 'Select 6 items to use in your games!');
  const grid = el('div', 'inv-grid', body);
  const count = el('div', 'inv-count pp-stroke', section);
  const equipped = new Set(TOKENS.map(t => t.id));
  const upd = () => { count.textContent = `Equipped: ${equipped.size}/6`; };
  for (const t of TOKENS) {
    const c = el('button', 'inv-card is-on', grid); c.type = 'button';
    el('span', 'inv-card__rarity pp-stroke', c, 'Common');
    el('span', 'inv-card__check', c);
    img(tokenIcon(t.id), 'inv-card__icon', c);
    el('span', 'inv-card__name pp-stroke' + (t.name.length > 9 ? ' is-long' : ''), c, t.name);
    c.onclick = () => { if (equipped.has(t.id)) equipped.delete(t.id); else if (equipped.size < 6) equipped.add(t.id); c.classList.toggle('is-on', equipped.has(t.id)); upd(); };
  }
  upd();
}

/* ---------------- Index (screenshots 89–91) ---------------- */
const RARITIES = [['Common', 6], ['Uncommon', 10], ['Rare', 14], ['Epic', 8], ['Legendary', 6], ['Mythic', 4]];
function buildIndex(section) {
  const { p, body } = frame(section, { theme: 'index', icon: 'assets/book.svg', title: 'Index' });
  el('div', 'pp-heading pp-stroke', body, 'Discover every item!');
  const grid = el('div', 'idx-grid', body);
  const shapes = ['circle', 'triangle', 'circle', 'circle', 'square', 'circle', 'crown', 'circle', 'leaf', 'square', 'circle'];
  let k = 0, total = 0;
  for (const [rarity, n] of RARITIES) {
    for (let i = 0; i < n; i++, total++) {
      const c = el('div', 'idx-card', grid);
      el('span', `idx-card__rarity pp-stroke r-${rarity.toLowerCase()}`, c, rarity);
      if (rarity === 'Common') { const t = TOKENS[i]; img(tokenIcon(t.id), 'idx-card__icon', c); el('span', 'idx-card__name pp-stroke' + (t.name.length > 9 ? ' is-long' : ''), c, t.name); }
      else { img(silhouette(shapes[k++ % shapes.length]), 'idx-card__icon', c); el('span', 'idx-card__name pp-stroke', c, '???'); }
    }
  }
  const foot = el('div', 'idx-foot', p);
  el('span', 'idx-foot__chip', foot);
  el('span', 'idx-foot__text pp-stroke', foot, `Discovered: ${TOKENS.length}/${total}`);
}

/* ---------------- init ---------------- */
let show = () => {};
const api = { close: () => show('lobby') };
export function initPopups(showScreen) {
  show = showScreen;
  const get = (name) => document.querySelector(`.screen[data-screen="${name}"]`);
  buildDaily(get('daily')); buildShop(get('shop')); buildInventory(get('inventory')); buildIndex(get('index'));
  buyLayer = el('div', 'pay-layer', document.body); buyLayer.hidden = true;
  buyLayer.addEventListener('click', (e) => { if (e.target === buyLayer) closeBuy(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !buyLayer.hidden) { e.stopImmediatePropagation(); closeBuy(); } }, true);
}
export const OFFER_INFO = {
  '2x-cash': { name: '2x Cash', price: 35, icon: 'assets/money-bag.svg' },
  '2x-wins': { name: '2x Wins', price: 75, icon: 'assets/trophy.svg' },
  'starter-pack': { name: 'Starter Pack', price: 25, icon: 'assets/starter-pack.svg' },
  'fall-pack': { name: 'Fall Pack', price: 35, icon: 'assets/pack.svg' },
  'limited-pack': { name: 'Limited Pack', price: 40, icon: 'assets/pack-limited.svg' }
};
