# Cipher Clash — Game Spec (Phase 0, captured from the reference video)

Working title **Cipher Clash** (config: `<title>` in `client/index.html`). Reference game: "[UPD] Is It Verity?" by Prince Creations (Roblox).
Evidence tags use the form `[t=mm:ss, frame]`. Frame numbers f_NNNN refer to 2 fps extraction (t = (N-1)·0.5 + 0.25 s). **UNKNOWN** means not shown in the video.

## 0. What the video contains

A 95-second recording of one player in the **lobby hub**. The player orbits and zooms the camera (0:00–0:27), then walks
down the booth road and back (0:28–1:00), then visits the wheel, leaderboards and packs stall (1:00–1:28), and finally zooms out to a top-down view (1:29–1:35).
**No match is played, no menu is opened, no pack is opened.** Rules below combine the public description
("race to crack the hidden pattern… place your Verity, check the result, guess the entire pattern before your opponent")
with what is visible from outside the booths.

## 1. Rules

| Item | Value | Evidence |
|------|-------|----------|
| Format | 1v1. A booth shows "0/2 Players" | `[t=00:08, f_0017]` |
| How a match starts | Each booth has a red pad and a blue pad in front of it. Stepping on them is assumed to fill slot 1 and slot 2 | pads `[t=00:08, f_0017]`; behaviour UNKNOWN |
| Lobby PLAY button | Present at all times. Assumed to be quick-match / auto-queue | `[all frames]`; behaviour UNKNOWN |
| Pattern length | **UNKNOWN**. Each booth's code bar shows **9 cells**, the first often already holds a token. This suggests 8 hidden + 1 placed, or 9 | `[t=00:44, f_0089]` |
| Token types | UNKNOWN count. Seen on booth bars: yellow smiley-face balls, blue balls, pink/magenta balls, blue gems/diamonds | `[t=00:36, f_0073]`, `[t=00:44, f_0089]` |
| Repeats allowed | UNKNOWN | — |
| Guesses per match | UNKNOWN | — |
| Turn structure | One player at a time? The billboard reads "<name> is guessing!" while the second player waits on the stand | `[t=00:08, f_0017]`, `[t=00:36, f_0073]` |
| Rounds / best-of | UNKNOWN | — |
| Timer | UNKNOWN (no match timer visible from outside) | — |
| Win / lose / draw | First to guess the entire pattern wins (description). Draw is UNKNOWN | description |

## 2. Feedback

UNKNOWN. The video never shows a guess being checked. The description says you "check the result" after placing a Verity,
which suggests feedback per placed token, possibly per slot rather than per full row. The placeholder `#game` screen uses
Mastermind-style pegs (exact / misplaced / miss) **as an assumption**. Confirm this before Phase 1.

## 3. Opponent progress

From outside, a booth shows the shared code bar. Placed tokens replace `?` cells, plus the line "<name> is guessing!".
`[t=00:44, f_0089]`. What each player sees of the other inside a match is UNKNOWN.

## 4. Flow

```
            ┌──────────── walk to booth pad (red/blue) ─────────────┐
 [Lobby] ───┤                                                       ├─> [Booth: 0/2 → 1/2 → 2/2] ─> [Match: IN PROGRESS]
            └──────────── PLAY button (assumed auto-queue) ─────────┘                                     │
    ^                                                                                                     v
    └──────────────────────────── result → rematch / back to lobby (UNKNOWN) ─────────────────────────────┘
```

| Transition | Seen? | Evidence |
|------------|-------|----------|
| Spawn into lobby | No (video starts already in the lobby, player near the statue) | `[t=00:00, f_0001]` |
| Booth AVAILABLE → IN PROGRESS | Only both states, not the change | `[t=00:08]` |
| Matchmaking, countdown, result, rematch | No | — |

## 5. Economy, packs, loadout

| Item | Detail | Evidence |
|------|--------|----------|
| Soft currency | **Cash** (green cash-stack icon), balance `0` bottom-left | `[all frames]` |
| Packs | Bought with Cash at the "PACKS / Spend Cash Here" stall. On approach a "Buy Packs" prompt appears | `[t=01:19, f_0159]`, `[t=01:27, f_0175]` |
| Premium offers (platform currency) | 2x Cash **35**, 2x Wins **75**, Starter Pack **25**, LIMITED TIME Fall Pack **35**, Limited Pack **40** | right HUD, `[t=00:00–01:34]` |
| Offer rotation | Top slot alternates 2x Cash / 2x Wins. Bottom slot cycles Starter → Fall → Limited, every ≈10 s | contact sheets |
| Free gift | "FREE GIFT" button with a red `!` badge | `[all frames]` |
| Wheel spin | "WHEEL SPIN — Free spin every day!", "YOU HAVE 2 SPINS!" | `[t=01:06, f_0133]` |
| Event | "EVENT" with countdown 10:08 → 8:35 | `[t=00:00]`, `[t=01:34]` |
| Leaderboards | "Time Played", "Top Wins", third board title unclear (low confidence: "Best Streak"). Text: "Updating in: 54s" | `[t=01:06, f_0133]`, `[t=01:28, f_0177]` |
| Obby | Signed "King Falsity's Obby — Exclusive Rewards NOW!" (renamed **SKY OBBY** in Cipher Clash). Floating course beyond the castle | `[t=00:15, f_0031]` |
| Next update board | "NEXT UPDATE" teaser screen | `[t=00:01, f_0003]` |
| Rarity | Only "Mythic" seen (red, as a title under a player) | `[t=01:06, f_0133]` |
| Token list / drop rates / loadout size | UNKNOWN | — |
| Index | "Index" button (collection book). Contents UNKNOWN | HUD |

## 6. Controls (seen)

- Mouse drag rotates the camera; mouse wheel or touchpad scrolling zooms from close up to ≈400 studs `[t=00:00–00:27]`, `[t=00:09, t=01:31]`.
- WASD / arrow keys move, Space jumps; touch devices use the on-screen joystick to move and the JUMP button to jump.
- Moving with the joystick, keyboard or camera input switches the preview into free-roam mode.
- Click HUD buttons. None are clicked in the video.

## 7. Visible objects (lobby)

**HUD:** system buttons (top-left ×3, top-right ×2), FREE GIFT, Shop, Inventory, Index, offer slot ×2, PLAY, Cash counter, EVENT badge + timer.
**World:** grey void, sky with clouds, castle with blue cone roofs, checker grass island, U-turn road with chevrons,
statue with obby sign, booths (red-trim/pink and cyan-trim/white) with code bars, stands, and red/blue pads, billboards,
stepping slabs, low-poly round trees and pines, crates, packs stall, spin wheel with glowing pad, Next-Update board,
3 leaderboards, NPC statues, spawn pad, other players with name tags.
**Avatar:** own avatar has no name tag. Other players show a grey name tag. One player shows an equipped title ("Wheelity / Mythic").

## 8. Audio cues (do not copy; make originals)

The recording has an AAC stereo track. I could not listen to it here, so audio cues are **UNKNOWN**. Likely needs:
UI click, offer pop-in, footsteps, wheel tick, pack open, token place, check result (correct / wrong), win / lose stingers, lobby music.

## 9. Deferred (not in Phase 0)

Game logic (pattern, checking, scoring), bot, Colyseus multiplayer (server-authoritative, the secret is held only on the server), login,
full Boxity SDK integration (friends, invites, loading screen, ads, settings, gem packs), avatar movement, proximity prompts, wheel spin, pack opening.
