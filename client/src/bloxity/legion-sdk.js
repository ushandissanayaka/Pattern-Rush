// Read-only bridge to the Boxity / Legion SDK (https://docs.bloxity.io/#html5).
// Phase 0 only READS identity + avatar; no login UI, friends, purchases or ads.
// If the SDK script failed to load, everything falls back to the default
// Legion character (skins/0.png) and the name "Player" — never throws.
import { LEGION_CDN } from './legion-avatar.js';

export const GAME_SLUG = 'cipher-clash';
let started = false;

function sdk() { return (window.Legion && window.Legion.SDK) || null; }
function safe(fn, fallback) { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } }

export function startLegion() {
  const S = sdk();
  if (!S || started) return !!S;
  started = true;
  try { S.init({ gameSlug: GAME_SLUG }); } catch (e) { console.warn('[legion] init failed', e); }
  return true;
}

/** Snapshot of the local player: { name, pfp, isGuest, equipped, skinUrl, proportions } */
export function getLocalPlayer() {
  const S = sdk();
  const fallback = { name: 'Player', pfp: null, isGuest: true, equipped: {}, skinUrl: `${LEGION_CDN}/skins/0.png`, proportions: {} };
  if (!S) return fallback;
  const u = safe(() => S.auth.getUser(), null) || safe(() => S.auth.getGuest(), null);
  return {
    name: String((u && (u.displayName || u.username)) || 'Player'),
    pfp: (u && u.pfp) || null,
    isGuest: !u || !!u.isGuest,
    equipped: safe(() => S.avatar.getEquipped(), {}) || {},
    skinUrl: safe(() => S.avatar.getSkinTextureUrl(), null) || fallback.skinUrl,
    proportions: safe(() => S.avatar.getProportions(), {}) || {}
  };
}

/** Calls cb(getLocalPlayer()) now and whenever the user or their avatar changes. */
export function onLocalPlayerChanged(cb) {
  const S = sdk();
  cb(getLocalPlayer());
  if (!S) return;
  safe(() => S.auth.onUserChanged(() => cb(getLocalPlayer())));
  safe(() => S.avatar.onAvatarChanged(() => cb(getLocalPlayer())));
}
