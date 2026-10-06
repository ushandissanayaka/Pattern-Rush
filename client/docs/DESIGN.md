# Cipher Clash — Phase 0 Design Reference

Source: `references/Screen Recording 2026-10-06 120626.mp4` (94.73 s, **1914×1006**, 30 fps, AAC audio).
All pixel numbers below are measured on that 1914×1006 frame. In CSS they are written as `calc(N * var(--u))`,
where `--u = min(100vh/1006, 100vw/1914)` (floored at 0.36px for small phones).
Frame numbers `f_NNNN` refer to a 2 fps extraction (t = (N-1)·0.5 + 0.25 s). The analysis frames, contact sheets and
render-vs-reference comparisons were working files and are not part of the project (only `client/` and `server/` ship).

> **What the video shows:** only the **3D lobby hub** with its HUD. Nobody plays a round on camera. The booths
> show matches *in progress* from the outside, but the match UI, packs UI, shop, inventory and results never appear.
> Everything outside the lobby is marked **NOT IN VIDEO** and built as a placeholder.

---

## 1. Screens and camera framings

| ID | Screen | Hash | Reference frame | Status |
|----|--------|------|-----------------|--------|
| S01 | Lobby (3D world + HUD) | `#lobby` | f_0017 (t=8.25) | **from video** |
| S02 | Shop modal | `#shop` | — | NOT IN VIDEO |
| S03 | Inventory / loadout | `#inventory` | — | NOT IN VIDEO |
| S04 | Index (collection) | `#index` | — | NOT IN VIDEO |
| S05 | Free gift | `#gift` | — | NOT IN VIDEO |
| S06 | Packs | `#packs` | stall only: f_0163 (t=81) | UI NOT IN VIDEO |
| S07 | Matchmaking | `#matchmaking` | — | NOT IN VIDEO |
| S08 | Match | `#game` | booth code bar: f_0089 (t=44) | NOT IN VIDEO |
| S09 | Result | `#result` | — | NOT IN VIDEO |

Camera framings seen in S01. These were used to tune the world scale. The game does **not** replay them: the camera is fully player-controlled.

| ID | Framing | t (s) | Frame | yaw / pitch / distance (studs) |
|----|---------|-------|-------|------------------------------|
| C01 | High overview behind spawn | 0.25 | f_0001 | 0° / 52° / 170 |
| C02 | Ground level, along the road | 8.25 | f_0017 | 0° / 3° / 60 |
| C03 | Max zoom-out, obby visible | 15.25 | f_0031 | 2° / 38° / 210 |
| C04 | Third-person follow | 36.25 | f_0073 | 62° / 6° / 19 |
| C05 | Wheel + leaderboards | 66.25 | f_0133 | 240° / 5° / 17 |
| C06 | Overhead near spawn pad | 89.25 | f_0179 | 160° / 62° / 30 |
| C07 | Top-down whole plaza | 93.25 | f_0187 | 160° / 55° / 190 |

The game starts behind the avatar on the spawn pad (yaw 0°, pitch 15°, 22 studs), looking toward the castle. Afterwards the camera moves only on player input.
Camera rules (Roblox "Classic" camera, matched to the video):
- Orbit target = avatar head (feet + 4.5 studs). Vertical FOV **70°**.
- Zoom range **0.5 → 400** studs. Zoom eases in log space with smoothstep between keyframes.
- At distance below 1.2 studs the camera is first-person and the avatar is hidden.
- Mouse: left or right drag rotates (0.35°/px yaw, 0.3°/px pitch, pitch clamp ±80°). The wheel zooms.
- Touchpad: two-finger scroll zooms, two-finger sideways swipe orbits, pinch (wheel + ctrlKey) zooms.
- Touch screen: one-finger drag on the world rotates, two-finger pinch zooms. The joystick and JUMP button are separate.
- Keyboard: `I` / `O` zoom, `,` / `.` orbit 10°.
- Camera input is ignored while a modal or the match screen is open. Code: `src/controls/camera.js`.
- The camera never goes below y = 0.6 (no clipping under the ground).

**World layout** (studs, +Y up, castle toward −Z): plaza x ±80, z −6…90; spawn pad (16×16) at z=50.
Road: two dark lanes 12 wide centred at x=±15 with a U-turn at z≈0. The median carries the statue at z=−30.
Booths 34 wide × 30 deep are spaced every 40 studs on both sides (x=±51), from z=−48 to −408. Castle at z=−470.
The sky-obby floats at y≈120 beyond the castle. Wheel (46,46), Next-Update board (40,16), Packs stall (−38,26).
Leaderboards sit at z=84, x = −26 / 0 / 26.

## 2. Colour tokens (pixel-sampled)

Sampled as 3×3 averages. Frame and pixel are listed so each value can be re-checked. Values marked * were adjusted by eye because the sample landed on anti-aliased text.

| Token | Hex | Role | Sample |
|-------|-----|------|--------|
| `--c-play-top` | `#e3ff18` | PLAY gradient top | f_0017 (850,875) |
| `--c-play-mid` | `#8cff12` | PLAY gradient middle | f_0017 col x=1000 |
| `--c-play-bot` | `#3dff12` | PLAY gradient bottom | f_0017 col x=1000 |
| `--c-play-shine` | `#f7ff74` | PLAY top highlight band (≈12 %) | f_0017 (1000,872) |
| `--c-shop-top/bot` | `#c20064` → `#e9001d` | Shop tile gradient | f_0017 col x=25 |
| `--c-inv-top/bot` | `#f2f336` → `#d87426` | Inventory tile gradient | f_0017 col x=22 |
| `--c-idx-top/bot` | `#46fedc` → `#5c6be8` | Index tile gradient | f_0017 col x=22 |
| `--c-gift-text` | `#92ff12` | "FREE GIFT" fill | f_0017 row y=376 |
| `--c-gift-stroke` | `#1e3a07` | "FREE GIFT" stroke | f_0017 row y=376 |
| `--c-cash-top/bot` | `#bfff0f` → `#58ff06` | Cash amount gradient | f_0017 col x=113 |
| `--c-available` | `#38e318` | "AVAILABLE" billboard | f_0017 row y=558 |
| `--c-in-progress` | `#e0101e`* | "IN PROGRESS", "PACKS", "NEXT UPDATE" | f_0017 (1400,545) ≈ `#c20012` |
| `--c-event` | `#2e5bff`* | "EVENT" text | f_0017 (1858,915) |
| `--c-sys-bg` | `rgba(25,27,33,.72)` | top system buttons | f_0017 (33,20) `#24272f` |
| sky top / mid / horizon | `#2988e7` / `#72c5e7` / `#d6dcda` | sky dome gradient | f_0017 (600,20); f_0003 col x=300 |
| void | `#4e4e4e` (top `#5e605f`) | below horizon | f_0187 |
| grass A / B | `#3be75d` / `#4bf070` | checker ground (8-stud squares) | f_0017 (900,800)/(950,760) |
| lane / chevron | `#2a4e5e` / `#419d79` | road lanes | f_0017 (560,880)/(600,830) |
| trim red / cyan | `#e4001c` / `#14f6f9` | booth neon strips | f_0017 (20,250)/(1640,300) |
| pad red / blue | `#e12836` / `#20bfe2` | booth join pads | f_0017 (220,810)/(380,720) |
| castle roof / wall | `#3f67a6` / `#a4b7be` (lit `#c3d0d5`) | castle | f_0017 (895,180)/(870,330) |
| tree / dark | `#40e974` / `#31d25b` | low-poly foliage | f_0017 (480,260)/(560,300) |
| wheel segments | `#6d00df #d6002c* #f08a17* #e6e60d* #11da40 #0975dc` | spin wheel | f_0133 (samples were shaded; red/orange/yellow brightened) |
| leaderboard bg / neon | `#222535` / `#80f075` | boards | f_0133 (1200,420)/(1345,300) |
| wheel pad | `#31cfc2` | glowing ring | f_0133 (560,590) |

Token / peg / rarity colours (`--tk-*`, `--peg-*`, `--r-*`) are **assumed**. They are not visible in the video.

## 3. Typography

The original uses Roblox engine fonts. These free Google Fonts match the glyph shapes:

| Use | Font | Weight | Size (ref px) | Colour / stroke | Why |
|-----|------|--------|---------------|-----------------|-----|
| HUD tile labels (Shop / Inventory / Index) | **Fredoka** | 700 | 28 | white, 3px black stroke | rounded geometric sans; matches the soft "a", "y", round dots |
| FREE GIFT | Fredoka | 700 | 22 | `#92ff12`, 3px `#1e3a07` stroke | same family, uppercase |
| Offer titles (2x Cash / 2x Wins / Starter Pack) | Fredoka | 700 | 30, rotated +4° | white, 3px black | — |
| Offer prices | Fredoka | 700 | 38 | `#7dff2e`, 3px black | — |
| PLAY | Fredoka | 700 | 40, tracking +0.02em | white, 4.5px black | — |
| Cash amount | Fredoka | 700 | 52 | lime gradient, 4.5px `#184002` | — |
| EVENT / timer | Fredoka | 700 | 26 | `#2e5bff` with white stroke / white with black stroke | — |
| Billboards: AVAILABLE, IN PROGRESS, PACKS, NEXT UPDATE, WHEEL SPIN, LIMITED TIME, FALL PACK | **Luckiest Guy** | 400 | world-space sprites | fill + ~16 % black stroke | heavy, slightly condensed display face with flat terminals, like the in-game billboards |
| Billboard sub-lines ("0/2 Players", "x is guessing!") | Fredoka | 600 | — | white, thin stroke | — |
| Small body / notes | Nunito | 600–800 | 16 | `#9aa3c7` | neutral rounded sans |

Text stroke is done with `-webkit-text-stroke` and `paint-order: stroke fill` (class `.stroke-text`). This copies Roblox `UIStroke`.

## 4. Layout (lobby HUD, 1914×1006 reference)

| Object | Selector | x, y, w, h (px) | % of frame | Notes |
|--------|----------|-----------------|------------|-------|
| System buttons left | `.sysbar--left` | 11, 8, —, 44 | 0.6 %, 0.8 % | circles Ø44, pill group 95 wide |
| System buttons right | `.sysbar--right` | 1803–1903, 8 | — | two Ø44 circles |
| Free gift | `#btn-free-gift` | 8–118, 282–392 | 0.4 %, 28 % | `!` badge Ø30 top-right, rays behind |
| Shop tile | `#btn-shop` | 17, 409, 92, 92 | 0.9 %, 40.7 %, 4.8 %w | 3px dark border, radius 3, label overlaps the bottom edge by 9px |
| Inventory tile | `#btn-inventory` | 17, 518, 92, 92 | 51.5 % | 17px gap |
| Index tile | `#btn-index` | 17, 627, 92, 92 | 62.3 % | — |
| Offer slot top | `.offer-slot--top` | centre x 1795, y 330–470 | 93.8 %, 32.8 % | title / icon / price stacked, rays |
| Offer slot bottom | `.offer-slot--bottom` | centre x 1795, y 520–690 | 51.7 % | — |
| PLAY | `#btn-play` | 783, 867, 343, 65 | 40.9 %, 86.2 %, 17.9 %w, 6.5 %h | 4px black border, radius ≈2 |
| Cash | `#hud-cash` | 22–135, 925–980 | 1.1 %, 92 % | icon 60, gap 12 |
| Event | `#hud-event` | 1815–1900, 900–1000 | 94.8 %, 89.5 % | — |

Spacing scale (ref px): 4 · 8 · 12 · 17 · 24 · 40. Radius: 2 (PLAY) · 3 (tiles) · 10 (modal buttons) · 18 (panels) · 999 (pills).
Shadow: HUD `0 3px 0 rgba(0,0,0,.35)` (hard drop, no blur, which is typical for Roblox).

## 5. Animations

| Animation | Seen in video | Timing / easing | Implementation |
|-----------|---------------|-----------------|----------------|
| Offer rotation (top: 2x Cash ↔ 2x Wins; bottom: Starter → Fall → Limited) | yes. Changes at ≈6, 16.5, 26, 36, 46, 56, 66, 76, 86 s | every ≈10.2 s. Pop-in scale 0.6→1 in 0.35 s, overshoot ease | `rotateOffers()` on a 10.2 s interval + `@keyframes offer-in` |
| Light rays behind gift / offers | yes (white rays, clearest on the grey void, f_0187) | continuous rotation, ≈9 s per turn (assumed) | `.rays`, `@keyframes rays-spin` |
| Free-gift `!` badge bob | badge visible; motion **not measurable** at 2 fps | 1.6 s ease-in-out (assumed) | `@keyframes badge-bob` |
| Event timer countdown | yes: 10:08 at t=0 → 8:35 at t=94 (1 s/s) | linear, 1 s ticks | `hud.js`: real-time, starting at 10:08 |
| Camera zoom / orbit | yes (the main motion in the video) | smoothstep keyframes, log-space zoom | `js/camera.js` |
| Avatar walk cycle | yes, own avatar t=28–60 s, walkers t=30–80 s (measured on 10 fps strips) | arms + legs ±1.0 rad, 9 rad/s (≈0.70 s per stride), legs opposite to arms; blends in/out over ≈0.1 s | `LegionCharacter.update()` in `js/legion-avatar.js` |
| Avatar idle | yes, t=0–27 s (avatar standing) | arm sway ±0.1 rad at 1 rad/s, breathing 1.8 rad/s, spine sway 0.7 rad/s | `legion-avatar.js` |
| Turn toward movement | yes (avatar turns when walking back, t=47–50 s) | exponential, ≈0.07 s time constant | `main.js` (AutoRotate) |
| Jump / in-air pose | NPC hopping on the green pedestal, t=70–72 s | hop 3.2 studs every 0.75 s, arms straight up | `state 'jump'` / own character `'airborne'` (Space) |
| Leaderboard statues | gold figures, arms raised, t=72–74 s | arms up 0.92π with slow ±0.12 rad wave at 2.2 rad/s | `state 'cheer'` |
| Other players walking the road | yes, t=28–80 s | WalkSpeed 16 studs/s, back-and-forth patrols | `world.js` walkers |
| "Exclusive Rewards NOW!" sign | multicolour letters on "NOW!", f_0003 | colour step every 0.18 s (cycle assumed; colours seen, motion not measurable) | `rainbowSign()` in `world.js` |
| Billboard fade near camera | — (fix for close follow cam) | opacity 0 → 1 between 16 and 36 studs | `main.js` |
| Wheel spin, pack opening, token place, peg pop, win/lose | **not in video** | assumed: token 0.26 s, peg 0.28 s, modal 0.22 s (`--ease-pop`) | `@keyframes token-place`, `peg-pop`, `modal-pop` |

`prefers-reduced-motion` turns all of these off.

## 6. States

- Hover / pressed / disabled / focus: **not visible in video**. Assumed values: hover scale 1.06, press scale 0.94, disabled grayscale. Focus uses a 3px white ring plus a 6px blue halo.
- Booth state: **AVAILABLE "0/2 Players"** (green) or **IN PROGRESS "<name> is guessing!"** (red). Both are seen in the video.
- Code bar: 9 cells. The first cell often holds a token and the rest show `?`. Seen in f_0089 and f_0073.
- Rarity: only the word **"Mythic"** (red, under a player's "Wheelity" title, f_0133). The other rarity tiers are assumed.

## 7. Object → selector → future function

| Object | Selector | Future function |
|--------|----------|-----------------|
| PLAY button | `#btn-play` / `.btn--play` | `joinQueue()` |
| Free gift | `#btn-free-gift` | `openFreeGift()` → `claimGift()` (`#btn-claim-gift`) |
| Shop tile | `#btn-shop` | `openShop()` |
| Inventory tile | `#btn-inventory` | `openInventory()` → loadout edit |
| Index tile | `#btn-index` | `openIndex()` |
| Offer buttons | `#offer-2x-cash`, `#offer-2x-wins`, `#offer-starter`, `#offer-fall`, `#offer-limited` | `buyOffer(id)` |
| Cash counter | `#cash-amount` | `setCash(n)` (textContent) |
| Event timer | `#event-timer` | `startEventCountdown(endsAt)` |
| Packs stall (3D) | `userData.class = 'landmark-packs'` | proximity prompt → `openPacks()` → `openPack()` (`#btn-open-pack`) |
| Booth (3D) | `userData.class = 'booth booth--red/cyan'` | `setBoothState(id, state)` |
| Join pads (3D) | `join-pad--1` (red), `join-pad--2` (blue) | `onPadEnter(boothId, slot)` |
| Wheel (3D) | `landmark-wheel`, `userData.spinDisc` | `spinWheel()` |
| Leaderboards (3D) | `leaderboard` | `setLeaderboard(kind, rows)` |
| Palette token | `.palette .token[data-token]` | `placeTokenInSlot(token, slot)` |
| Guess row | `#guess-row-N`, `.slot` | `renderGuess(row, tokens)` |
| Feedback pegs | `.peg--exact`, `.peg--misplaced`, `.peg--miss` | `renderFeedback(row, result)` |
| Submit | `#btn-submit` / `.btn--submit` | `submitGuess()` |
| Opponent code bar | `.board--opponent .code-bar__cell` | `renderOpponentProgress()` |
| Match timer | `#match-timer` | `tickMatchTimer()` |
| Avatar slots | `.avatar-slot[data-player=me/opponent]` | `renderAvatar(slotElement, playerIdentity)` (implemented, placeholder) |
| 3D avatar (yours) | `avatar-3d--me` (`LegionCharacter`) | done: skin, parts, hat, back from `Legion.SDK` |
| Walk / jump input | `main.js` `walk()` | later: send movement to server (`MatchRoom`) |
| Rematch / Lobby | `[data-action=rematch]`, `[data-action=closeModal]` | `rematch()`, `showScreen('lobby')` |

All stubs are in `js/hud.js` → `Stubs`. Player-supplied text is always written with `textContent`.

## 8. Placeholders and originality

Every item below is an original stand-in, tagged `PLACEHOLDER` in a class name or comment:
- All HUD icons are new SVGs (`assets/*.svg`): gift, basket, backpack, book, cash, trophy, money bag, packs, event badge, system icons.
- The premium price icon is a **gem** (`assets/gem.svg`), not the platform currency logo.
- The median statue is a **blue crystal on a gold plinth**. It replaces the original character statue, and its sign reads "SKY OBBY".
- The Next-Update screen shows plain bars instead of the original face art.
- The spawn-pad mark is an original 8-point star.
- Your avatar and all NPCs use the official Legion rig and skins from the Boxity CDN (see §10). No Roblox avatars are copied.
- Leaderboard names are invented.
- Tokens on booth bars are plain spheres. The original Veritys (smiley-face balls, gems) were **not** copied.
- No frames, audio, logos or textures from the video are used in `client/`.

## 9. Assumed / not visible in the video

- Any match, shop, inventory, index, gift, packs or result UI.
- Pattern length, guess count and feedback style. See GAME_SPEC.md.
- Hover, pressed and disabled states, plus all UI sounds.
- Exact easing curves. At 2 fps sampling these are approximate.
- The third leaderboard title is OCR-uncertain. "Best Streak" is a guess; the first two read "Time Played" and "Top Wins".
- The world scale in studs is estimated from avatar height (≈5 studs). Road length and booth count were tuned to match the framings, not measured.
- Top-right system button icons are too small to read (about 20 px). Generic icons are used.
- No OCR engine was installed (tesseract unavailable). All text was read visually from full-resolution frames.

## 10. Legion character (Boxity avatar)

- `index.html` loads `https://sdk.bloxity.io/v1/legion-sdk.min.js`. `js/legion-sdk.js` calls `Legion.SDK.init({ gameSlug: 'cipher-clash' })` and only **reads** data:
  `auth.getUser() || auth.getGuest()`, `avatar.getEquipped()`, `avatar.getSkinTextureUrl()` and `avatar.getProportions()`.
  It also subscribes to `auth.onUserChanged` and `avatar.onAvatarChanged`. There is no login UI, customizer, friends or purchases.
- `js/legion-avatar.js` loads the official rig `static.bloxity.io/avatars/player.glb` (22 bones: `Spine1/2`, `Arm{L,R}_Offset/1/2`, `Leg{L,R}_Offset/1/2`, `Neck_Offset`, `Neck1`).
  It applies the skin texture (nearest filtering, `flipY=false`) and swaps body parts from `/parts/{head|torso|arms|legs}/{id}{_L|_R}.glb`.
  Hats and hair attach to `Neck1`, back items to `Spine2` (`/items/...obj` + `/textures/...png`). This is the same method as `bloxity.io/test-game.html`.
- The rig is scaled to **5.3 studs** tall to match the avatar in the video. It faces +Z.
- If the SDK is unavailable, the default Legion character (`skins/0.png`) and the name "Player" are used. Nothing throws.
- NPCs (booth players, walkers, the hopping player) use the same rig with CDN skins 1–20. The leaderboard statues are gold-tinted rigs.
- Proportions: only `height` is applied in Phase 0. Shoulder, arm and head scaling (the `patchSkeletons` code in test-game) is left for later.

## 11. Controls (Phase 0 viewer)

| Input | Action |
|-------|--------|
| WASD / arrow keys / touch joystick | walk (camera-relative, 16 studs/s) |
| Space | jump (Roblox defaults: 50 studs/s up, gravity 196.2) |
| Drag (mouse, touchpad click, one finger) | rotate camera |
| Wheel, two-finger scroll, pinch, `I`, `O` | zoom 0.5–400 studs |
| Two-finger sideways swipe (touchpad) | orbit |
| `,` `.` | orbit 10° |
| DEV panel | screen switcher only |

There are no collisions yet: the character is clamped to the plaza and the road corridor.
