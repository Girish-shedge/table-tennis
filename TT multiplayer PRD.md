# Table Tennis — Online Multiplayer PRD (v2.0)

Host a game and share a link or a 4-letter code. A friend joins on desktop or phone. You play the same hand-drawn table tennis game, head to head.

---

## 0. Document Control

| | |
|---|---|
| **Status** | Draft, ready to build |
| **Owner** | Girish |
| **Game** | [tabel-tennis.vercel.app](https://tabel-tennis.vercel.app) (repo: [Girish-shedge/table-tennis](https://github.com/Girish-shedge/table-tennis)) |
| **Companion file** | `TT game project.md` (single-player game and shared engine, v1.2) |
| **Replaces** | `multiplayer.md` and `multiplayer-build.md`. **Delete both from the repo** once this file is in, so nothing clashes |
| **Work branch** | `multiplayer` (never build on `main`, see §8.1) |
| **Models** | Day 1 (frontend + backend): **Grok**. Day 2 (design): **Claude Sonnet** |

### 0.1 Which file owns what

| Topic | Owner |
|---|---|
| Rules, physics, constants, rendering, art direction, Bot AI, vs-Bot screens and controls | `TT game project.md` |
| Everything online: rooms, lobby, join flows, network, relay server, multiplayer-only behavior | **This PRD** |
| Overlaps (start screen, top-corner controls, game states, hotkeys) | `TT game project.md` describes vs-Bot mode. This PRD lists **"MP addition"** items. In multiplayer mode this PRD wins, and in vs-Bot mode `TT game project.md` wins |

Whenever the code changes behavior in either file, update the owning file. Appendix A lists the few edits `TT game project.md` needs so the two read consistently.

### 0.2 What this PRD is based on (and what it isn't)

I read your `TT game project.md` in full (spec, structure, constants, history). **I have not seen the source code.** Internal names used below (`RenderState`, `PaddleController`, and so on) are proposals. Task **F-0** has Cursor survey the real code first and map these names to what exists, so nothing is built against a guess.

---

## 1. Summary

### 1.1 Problem and goal

The game is single-player only. Playing against a real friend is the most natural next step, and `TT game project.md` already lists it under "Ideas for Later".

**Goal:** a friend can be playing within about 20 seconds of you tapping Host: no accounts, no installs, any device combination.

### 1.2 Non-goals (v2.0)

- Matchmaking with strangers, accounts, rankings or persistent stats.
- More than two players, or spectators.
- Voice or text chat (quick emotes only).
- A paid server. The goal is to run on free tiers.

### 1.3 Success looks like

- A host-and-join match can be completed end to end on two phones over mobile data.
- The game feels responsive up to about 150 ms round-trip latency.
- Single-player is untouched, and still works if the online service is down.

---

## 2. Reconciliation: What Changed From My Earlier Drafts

My first multiplayer drafts were written before I saw your real project file. These are the corrections made to match what you actually built. **Nothing in the rows below is left to chance. These are now rules.**

| # | Earlier draft said | Now (from your real project) |
|---|---|---|
| 1 | Serif font (Newsreader), generic UI | **SF Cartoonist Hand** everywhere, with your type scale (`--t-title` 56, `--t-heading` 28, `--t-body` 21, `--t-label` 17, `--t-caption` 15) |
| 2 | Generic "opponent" and a placeholder name | The far-end character is **Bot's character**. It represents the friend and the scoreboard shows the friend's name |
| 3 | Placeholder footer email | Footer stays **Instagram │ X │ LinkedIn** with your own links. Nothing to decide |
| 4 | Host the client on Cloudflare Pages or Netlify | Client stays on **Vercel**. Only the relay runs on Cloudflare |
| 5 | A new repo | The **existing public repo**. Work on branch `multiplayer`, because every push to `main` deploys to production |
| 6 | New state names (WAITING, etc.) mixed into the game | The game FSM (MENU, SERVE, RALLY, POINT, GAME_OVER) is unchanged. MP adds only **COUNTDOWN** and **PAUSED**. Lobby and room states are a separate "session" machine |
| 7 | Remote paddle used Bot's hit size | Both human paddles use the **player hit radius, 0.17 m**, and the player shot speed |
| 8 | Paddle easing 0.12 s | **0.07 s** (`paddleSmooth`) |
| 9 | Point freeze 1.2 s | **1.6 s** (`pointFreezeMs`). The ball keeps falling and rolling during it |
| 10 | Serve alternates every 2 points | Every 2 points, **and every point from 10–10** (deuce) |
| 11 | New close button | The top corner already holds a mode chip and a mute button. In MP the mode chip is **replaced** by a connection chip, the mute button stays, and a leave button is added |
| 12 | Separate menu | **Host a game** and **Join with code** are added to the existing start screen under the Easy, Medium and Hard buttons |
| 13 | Play again, Change difficulty after the match | In MP the modal shows **Rematch** and **Leave**. Tap-outside and Space do **not** trigger a rematch |
| 14 | Esc does nothing | In MP, Esc opens the Leave dialog |
| 15 | 31-character code alphabet with digits | **Letters only, 23 letters** (no I, L, O). A hand-drawn font makes 2/Z, 5/S, 8/B, 0/O and 1/I/L easy to confuse. 23⁴ = **279,841** codes |
| 16 | Red and amber/green signal colours | Only your palette. Warnings use the `bubble` red, and signal strength is shown with bars and text |
| 17 | Hidden tabs pause quietly | In MP, a hidden host or guest **tells the other player** and the match pauses with a grace period |
| 18 | Protocol types in `src/net/` | Shared types live in `shared/protocol.ts`, imported by both client and server |
| 19 | Bubbles for reactions | In MP the character's face still reacts, but **auto speech bubbles are off**. The speech bubble is reserved for the friend's emotes (see §4.7) |
| 20 | Small extras were free | The bundle budget is unchanged: stay **under 150 KB gzipped** (now about 12.7 KB). No new client libraries. Native `WebSocket` only |

---

## 3. Product Requirements

### 3.1 Functional requirements

**Hosting**
- **FR-1** A player can host a game from the start screen.
- **FR-2** The host gets a **4-letter room code** and a shareable link (`<current site>/?room=CODE`).
- **FR-3** The host can share through the system share sheet (mobile), or copy the link or the code.
- **FR-4** A room **expires 2 minutes after creation** if nobody joins. The lobby shows a live countdown. The host can add 2 more minutes **once** (pending Y-10).
- **FR-5** The host presses **Start** once the friend has joined (pending Y-11).

**Joining**
- **FR-6** A friend can join by opening the link, or by typing the code.
- **FR-7** The link shows who invited them ("Girish invited you to play") before joining.
- **FR-8** If a name is saved, joining by link happens automatically. Otherwise they confirm a prefilled name.

**Match**
- **FR-9** Rules, physics and scoring are identical to vs-Bot (first to 11, win by 2).
- **FR-10** Each player sees themselves at the **near end with the red paddle**, and the friend at the far end with the blue paddle and the character.
- **FR-11** The scoreboard shows **You** and the friend's name.
- **FR-12** A human server has a **10-second serve timer**, then the serve happens automatically.
- **FR-13** A player can send quick emotes. The friend sees them as a speech bubble from the character.
- **FR-14** Leaving mid-match needs a confirmation, and the other player wins by forfeit (pending Y-9).

**Resilience**
- **FR-15** A dropped connection pauses the match for up to **15 seconds** and recovers automatically.
- **FR-16** If the host's page reloads or crashes, play resumes from the last saved score.
- **FR-17** A player who hides the game (switches apps, locks the phone) pauses the match with a grace period instead of losing points.

**After the match**
- **FR-18** Rematch needs both players to agree, and keeps sides.
- **FR-19** Leaving tells the friend, with clear next steps.

**General**
- **FR-20** The player's name comes from a saved profile (`localStorage`), prefilled and editable, never blocking.
- **FR-21** Every failure has a friendly screen with a next step (see §4.5).
- **FR-22** **vs-Bot mode is unaffected**, and works even if the relay is down or not configured.

### 3.2 Non-functional requirements

| | |
|---|---|
| **Responsiveness** | Playable up to about 150 ms round trip. Your own paddle feels instant at any latency |
| **Frame rate** | 60 fps on a mid-range phone |
| **Bundle** | Under 150 KB gzipped, no new client libraries |
| **Privacy** | No accounts, no analytics, no personal data stored. Rooms are deleted when finished (Y-16) |
| **Cost** | Free tiers only (see §6.9) |
| **Browsers** | iOS Safari 15+, Android Chrome (last 2 versions), desktop Chrome, Edge, Firefox, Safari (latest) (Y-14) |
| **Accessibility** | Matches the existing checklist in `TT game project.md` §11, plus the additions in §10 |

---

## 4. UX

### 4.1 Principles

1. **One obvious next step on every screen.**
2. **Reuse the look you already have:** the existing button, modal, chip, info badge and footer pill styles. Add new components only where nothing exists.
3. **Never lose a room or a score to something harmless**, like switching apps to paste a link.
4. **Say what happened and what to do next**, in plain words.

### 4.2 Start screen changes (MP addition)

Keep everything that exists: the crossed-bats icon, the title **Table Tennis**, the subtitle, the **Easy / Medium / Hard** buttons and the info badge. Add under the difficulty buttons:

- A quiet divider: "or play a friend".
- Two buttons: **Host a game** and **Join with code**.
- A small line: "Playing as **Girish** ✎" (tap to edit). First launch shows a friendly default name like "Player 482". Saving uses `localStorage` and never errors if storage is blocked (E-33).
- If the relay isn't configured or reachable, the two MP buttons are hidden (E-50). vs-Bot is untouched.

### 4.3 Top-corner controls in a match (MP addition)

Single-player shows a static mode chip and a mute button. In multiplayer:

| Control | Behavior |
|---|---|
| Mode chip | **Hidden** (there is no difficulty) |
| **Connection chip** | A small bars icon plus ping text on tap or hover. 3 bars under 120 ms, 2 bars up to 250 ms, 1 bar above that, in `ink`. Above 250 ms for 5 s it turns `bubble` red and a toast says "Weak connection" |
| Mute button | Unchanged (the choice is saved as `tt-muted`) |
| **Leave button (×)** | New. 44 px target. Opens the Leave dialog (S13) |

### 4.4 Screen inventory

| ID | Screen | Notes |
|---|---|---|
| S01 | **Start screen** | Extended as in §4.2 (this is the existing `MENU` state) |
| S02 | **Creating room** | A spinner. After 5 s: "Taking longer than usual…" with Retry |
| S03 | **Host lobby** | Large spaced code (e.g. `K T Q R`), **Share invite** (primary), Copy link, Copy code, expiry countdown, **+2 min** (once), Cancel |
| S04 | **Host lobby, friend joined** | "Ravi joined", **Start game** (primary), Leave room |
| S05 | **Join with code** | Four boxes, auto-uppercase, auto-advance, paste fills all four, submits on the 4th letter |
| S06 | **Invite screen** | "Girish invited you to play", name field (prefilled), **Join game**. Shown only if no name is saved |
| S07 | **Guest lobby** | "Joined. Waiting for Girish to start…", Leave |
| S08 | **Countdown** | 3, 2, 1, Go (large type in the existing title size, with tok-style beeps) |
| S09 | **Match** | The game, plus the top-corner controls in §4.3 and an emote button |
| S10 | **Reconnect overlay** | "Ravi lost connection. Waiting 12 s…", and for the dropped player "Reconnecting…" |
| S11 | **Result modal** | Same modal as game-over: "You win!" or "Ravi wins", final score, **Rematch** and **Leave** |
| S12 | **Rematch pending** | "Waiting for Ravi…" or "Girish wants a rematch" with Accept and Leave |
| S13 | **Leave dialog** | "Leave match? Your friend will win." Stay / Leave |
| S14 | **Message screens** | See §4.5 |

### 4.5 Message screens (copy)

Each has one primary button, plus a quiet "Play vs Bot" link.

| Situation | Title | Body | Primary |
|---|---|---|---|
| Room not found | "We can't find that room" | "Check the code, or ask your friend for a new link." | Try another code |
| Room expired | "This room has expired" | "Rooms close after 2 minutes if nobody joins." | Host your own |
| Match already started | "That match already started" | "Ask your friend to host a new game." | Host your own |
| Room ended | "This game has ended" | "Ask your friend for a new link." | Host your own |
| Host's own room expired | "Room expired" | "Nobody joined in time." | Create new room |
| Friend left | "{Name} left the game" | "You win by forfeit." (mid-match only) | Back to menu |
| Host ended the game | "{Name} ended the game" | "Ask for a new link to play again." | Back to menu |
| Server unreachable | "Can't reach the game server" | "Check your connection, or play Bot." | Retry |
| Update needed | "A new version is available" | "Refresh to keep playing." | Refresh |
| Free limit reached | "Online play is resting" | "It will be back soon. You can still play Bot." | Play vs Bot |
| Duplicate tab | "Game is open in another tab" | "Use the other tab, or play here instead." | Play here |

### 4.6 Flows

**Host**
1. S01: tap **Host a game** (name already set).
2. S02, then **S03 Host lobby**. The code is large and spaced. **Share invite** is the main button. On desktop it copies the link and shows "Link copied". The countdown "Room expires in 1:42" turns `bubble` red at 0:20 and offers **+2 min** once.
3. A friend joins, then **S04** shows "{Name} joined", the timer disappears and **Start game** is enabled. If nobody starts within 5 minutes, the room closes ("Room closed due to inactivity").
4. Tap **Start**. The server checks both players are still connected, then **S08** runs 3-2-1-Go and the match begins.
5. After the match: **S11**.

**Guest, by link**
1. Open `…/?room=KTQR`. "Checking room…" shows briefly.
2. Name saved: "Joining Girish's room…" (with Cancel), then **S07**. No name saved: **S06**, then **S07**.
3. The host starts, then S08 and S09.

**Guest, by code**
1. S01, then **Join with code** (S05). Type or paste the 4 letters, and the 4th submits.
2. "Joining…", then S07.

**Rematch and leave**
- **Rematch** shows the friend "{Name} wants a rematch" with Accept and Leave. Scores reset and sides stay. If there is no answer within 30 s, the request quietly clears.
- **Leave** from the result sends the friend to "Girish left" with Back to menu.
- **Browser Back** inside a lobby or match opens the Leave dialog.

### 4.7 In-match behavior (MP addition)

- **Serve cue:** on your serve the caption reads `Arrow keys to move · Space to serve` (keyboard) or `Drag to move · Tap to serve` (touch), exactly as today, and a ring shows the 10-second timer. When the friend serves, the caption reads "**{Name} to serve**" (as "Bot to serve" does today).
- **Caption results** (red, footer font, from `TT game project.md` §9.2), viewer-relative:
  - You missed: **Missed!**
  - The friend missed: **{Name} missed**
  - **Net!**, **Out!**, **Double bounce**, **Fault** are unchanged.
- **Character reactions** (face only, mapped to each viewer's own view of the table):

| Expression | When |
|---|---|
| Watching | Default during a rally |
| Shocked | When **you** return the ball |
| Dizzy | When **you** win a point |
| Happy | When the friend wins a point |
| Looking sideways | Follows the ball |

- **Speech bubbles:** auto reaction bubbles (`Hey!`, `Ha!`, `Oops!`) are **off in MP**, so a bubble always means "my friend said this". Pending Y-18.
- **Emotes:** a small tray of five phrases: `Nice!`, `Hey!`, `Ouch!`, `GG`, `Rematch?`. The friend sees the red bubble beside the character for 0.9 s. You see yours in the red pill beside your paddle (the one that normally reads **You**) for 0.9 s.
- **Score tint:** red when you score, blue when the friend scores, per viewer (as today).
- **Sounds:** the existing synthesized sounds, played from events, and "won" or "lost" jingles by viewer.
- **Screen shake:** on your own paddle hits only (and not with reduced motion), as today.
- **Hotkeys:** `M` mutes, `Esc` opens Leave, `Space` serves (only on your serve).
- **Result modal:** Space and tap-outside do nothing, so an accidental tap can't send a rematch.
- **Name label:** the scoreboard truncates long names to 10 characters with "…" (full name is shown in lobbies).

---

## 5. Game Rules in Multiplayer

Everything in `TT game project.md` §6 applies unchanged, except:

| Topic | In multiplayer |
|---|---|
| Opponent | A remote human. No Bot AI, no difficulty |
| Hit radius | **0.17 m for both humans** (player value). Bot's 0.09 m + bonus is only for the AI |
| Shot | The host resolves every hit with the existing ballistic solver (`solveShot`) and `playerShotSpeed` (5.0). The guest's hit is computed in host coordinates (mirrored) |
| Paddle limits | `z` between 0.3 m and 1.2 m **in each player's own half**, `x` within the table plus 0.25 m. The host clamps the guest's paddle the same way |
| Paddle easing | 0.07 s for both paddles |
| Serve rotation | Every 2 points, and every point from 10–10 |
| Point freeze | 1.6 s, with the ball continuing to fall and roll |
| Win rule | First to 11, win by 2, no cap |
| Rubber-band | **None** in MP (that is a Bot-only effect) |
| Game FSM | MENU, SERVE, RALLY, POINT, GAME_OVER as today, plus **COUNTDOWN** (before the first serve) and **PAUSED** (reconnect or someone away) |
| Hidden tab | vs-Bot pauses silently. In MP the player who hides the game **announces it first** and the match pauses for everyone (E-12, E-49) |

---

## 6. Technical Design

### 6.1 Architecture decision

A **WebSocket relay** (a small server that forwards messages inside a "room") with a **host-authoritative simulation**.

- The **host's browser runs the physics** and is the referee. Its ball and score are the truth.
- The **guest sends its paddle position** and draws the host's **snapshots**.
- The server never runs game logic. It manages rooms and forwards messages.

Why this and not WebRTC: the relay works on virtually every network. WebRTC is a direct line, which is faster, but some networks block it and then need a paid relay (TURN). The relay costs roughly 20–60 ms of extra delay, which is fine between friends. The transport is hidden behind a small interface (`Transport.send / onMessage / close`), so WebRTC can be added later without touching game code.

### 6.2 Hosting topology

```
Friend's browser ──┐                         ┌── Friend's browser
 (Vercel-hosted    │   wss://  Cloudflare    │   (same Vercel site)
  client)          ├─────────► Worker + ◄────┤
                   │   https   Durable Object│
Host's browser ────┘   (HTTP API + sockets)  │
```

| Part | Where | Notes |
|---|---|---|
| Game client | **Vercel** (as today) | Auto-deploys from GitHub. Reads the relay address from `VITE_RELAY_URL` |
| Relay | **Cloudflare Workers + Durable Objects** (free plan, SQLite-backed, WebSocket Hibernation API) | One Durable Object per room, named by its code |
| Repo | Same public repo | `server/` folder with its own `package.json`, `tsconfig.json` and `wrangler.toml` |

### 6.3 How the relay works (simple version)

A room is like a meeting room named by its code. The server keeps track of who is inside, when it expires and the last saved score, and passes each person's messages to the other. Because the server may be put to sleep between messages, **everything it needs to remember is saved to storage, never kept only in memory.**

### 6.4 Integrating with the existing game

F-0 surveyed the repo (October 2026). The four rules below stay the design. The names in parentheses are what the code actually has today. Nothing here changes rooms, the relay, or who is authoritative.

1. **One render state.** There is no `RenderState` type. `main.ts` `render()` draws from the live `Game` (`game.ball`, `game.player`, `game.aiPaddle`, `game.score`, `game.phase`, `game.now`) plus effects that live only in `main.ts` (`shake`, `netShimmer`, `Character`, `Bubble`, `Hud`). The draw functions take those objects one at a time. Keep it that way: the host simulation fills `Game`, the guest writes interpolated snapshots into the same fields, and the renderers stay unaware of which side filled them.
2. **Paddle controllers.** There is no `PaddleController` yet. Two separate paths exist, and they must not be merged onto one easing curve:
   - The near paddle: `Input` (`input.ts`) only produces `dragTarget`, `axis()`, `kind`, `hovering` and `grabbing`. `main.ts` copies `dragTarget` and `keyAxis` onto `Game` each frame. `Game.updatePlayerPaddle()` clamps and eases both axes with `paddleSmooth` (0.07 s). `LocalInput` wraps that path.
   - The far paddle: `AI.update()` (`ai.ts`) moves `game.aiPaddle` itself. It eases **x only** with a 0.06 s constant, caps speed, and leaves `z` at `CONFIG.aiPaddleZ` (2.62). `Game.step` calls `AI.onIncoming` first, then `AI.update`. `AIController` wraps that pair of calls in the same order.
   - `RemoteInput` is new. It fills the far paddle's target from network messages and eases with 0.07 s. It is not used in vs-Bot.
   - vs-Bot must behave exactly as today. The repo has **no** committed headless harness (`gaussian()` and serves call `Math.random()`; `rng()` in `sketch.ts` is only for ink wobble). F-1 adds a seeded `Math.random` driver and checks a golden trace taken before the refactor.
3. **Mirroring happens only at the network edge** (`mirror.ts`): for the guest, `x' = −x` and `z' = tableL − z` (`tableL` is 2.74), and the score is flipped so "You" is always the viewer. Sides in code are `"player" | "ai"`, and the score is `{ player, ai }`. The HUD prints `CONFIG.playerName` ("You") and `CONFIG.opponentName` ("Bot"); multiplayer overrides the far label per viewer. Renderers never see the host's coordinates. The bot's fixed `z = 2.62` is not the human far-half. A remote human's `z` is the mirrored player range `[tableL − 1.2, tableL − 0.3]` = `[1.54, 2.44]`.
4. **Session machine, separate from the game FSM.** None exists yet. Overlays are `#overlay-start` and `#overlay-over`, toggled with the `hidden` attribute. `#controls` (hidden until a match starts) holds `#btn-mode` / `#mode-label` and `#btn-mute`. `Input`'s `onEscape` is an empty callback. `Game.primary()` on `GAME_OVER` restarts the match, which is correct for vs-Bot and must not do that in multiplayer (E-53). Screens and room status live in a new session machine. The game FSM in `state.ts` stays `MENU | SERVE | RALLY | POINT | GAME_OVER`, plus `COUNTDOWN` and `PAUSED`.

**Loop (so later tasks hook the right place).** `requestAnimationFrame` in `main.ts`. Frame `dt` is capped at 0.1 s. `Game.update` accumulates a fixed step of 1/120 s. `Game.on` emits `serve`, `hit`, `bounce`, `net`, `point`, `gameover` and `phase`; `main.ts` turns those into sound, shake (your hits only, and not with reduced motion), character mood, speech bubbles, the score pop and the game-over overlay. A hidden tab sets `running = false`, which stops update and render together, then resumes with `last = now` so there is no time jump. In multiplayer that handler must announce the pause before the sim freezes (E-12, E-49). `window.__tt` exists only in dev.

### 6.5 Rooms (server side)

**Room states:** `WAITING` (host only, 2-minute alarm), `LOBBY_FULL`, `COUNTDOWN`, `PLAYING`, `PAUSED`, `ENDED`, `EXPIRED`.

**Code:** 4 letters from `ABCDEFGHJKMNPQRSTUVWXYZ` (23 letters), case-insensitive, regenerated on collision. 279,841 possible codes, with rooms living for minutes and lookups rate-limited, so guessing is impractical.

**Timers** (all server alarms):
- Join window: 2 minutes from creation. Stops when a friend joins and **restarts fresh** if that friend leaves before the match starts.
- Both players present but nobody pressing Start: closes after 5 minutes.
- Reconnect window: 15 seconds, or 30 seconds if both dropped.

### 6.6 HTTP API and WebSocket protocol

**HTTP** (called from the Vercel site, so the Worker returns CORS headers for an allowlist of origins):

| Call | Purpose | Responses |
|---|---|---|
| `POST /api/rooms` `{name, v}` | Create a room | `201 {code, playerId, token, expiresAt}` |
| `GET /api/rooms/:code` | Preview for the invite screen | `200 {status, hostName}` · `404` not found · `410` expired |
| `POST /api/rooms/:code/join` `{name, v}` | Join as guest | `200 {playerId, token, hostName}` · `404` · `409` full or started · `410` expired |
| `POST /api/rooms/:code/extend` (host token) | One-time +2 min | `200 {expiresAt}` · `409` already used |
| `GET /ws/:code?token=…` | Upgrade to WebSocket | Rejects an unknown token or a disallowed `Origin` |

Errors return `{error: "ROOM_NOT_FOUND" | "ROOM_FULL" | "ROOM_EXPIRED" | "VERSION_MISMATCH" | "RATE_LIMITED"}`.

**WebSocket messages** (JSON for v1, every message has `t` = type and `v` = protocol version; switch only the very frequent messages to a compact format later if needed):

| Message | Direction | Purpose |
|---|---|---|
| `hello {role, roomStatus, peer, checkpoint}` | server → client | Sent on connect and reconnect, so the client can restore its screen |
| `peer_joined {name}` / `peer_left {name, why}` | server → other | Lobby and presence |
| `room_closed {why}` | server → both | `expired`, `inactivity`, `host_cancelled`, `host_left` |
| `start_request` | host → server | Server checks both are connected, then confirms |
| `countdown {n}` | host → guest | 3, 2, 1, 0 |
| `pause {reason}` / `resume {in}` | host → guest | `host_hidden`, `reconnecting`, `guest_away` |
| `away` / `back` | guest → host | Guest hid or showed the game |
| `input {seq, ts, x, z}` | guest → host | Paddle target in host coordinates (tilt is derived locally) |
| `state {tick, phase, ball, hp, gp, score, server, serveMs}` | host → guest | Snapshot (about 30 per second) |
| `state_sync {...}` | host → guest | Full state after a reconnect |
| `event {kind, who, reason?}` | host → guest | `hit`, `bounce`, `net`, `point` (with `winner` and `reason`: missed, net, out, double, fault) |
| `checkpoint {score, server}` | host → server | Saved after every point (for E-14) |
| `match_over {score}` | host → server | Ends the room |
| `emote {id}` | both ways | Quick phrase |
| `rematch_request` / `rematch_accept` | both ways | Rematch |
| `leave` | client → server | Leaving on purpose |
| `ping` / `pong` | both ways | Heartbeat (auto-response, free of wake-up cost) |

### 6.7 Timing and smoothing

| What | Value |
|---|---|
| Host simulation | Fixed step 120 Hz (`dt = 1/120`, as today) |
| Snapshots | 30 per second |
| Inputs | Up to 60 per second, only while the paddle changes, plus a 10 Hz keep-alive |
| Heartbeat | Ping every 2 s, dead after 6 s (also gives the latency number) |
| Interpolation | The guest draws the host side about **100 ms in the past**, blending the two latest snapshots |
| Extrapolation | If a snapshot is late, continue the last motion for up to **100 ms**, then hold |
| Own paddle | Drawn instantly from local input (0.07 s easing), never waits for the host |
| Hit forgiveness | The host checks the guest's hit against the guest's paddle position rewound by `min(RTT/2, 80 ms)` |
| Ordering | Snapshots carry a `tick`. The guest ignores anything older than the newest |
| During POINT | Snapshots keep flowing so the falling, bouncing and rolling ball (§6.3 of `TT game project.md`) looks the same on both screens |

### 6.8 Recovery and security

**Recovery**
- Guest drop: the host pauses, the guest reconnects with its token and receives `state_sync`.
- Host page reload or crash: the server hands the host the last `checkpoint` (score and server), and the host starts a **fresh serve** from there (the rally in flight is lost).
- Tokens live in `sessionStorage` (`tt-session`: code, playerId, token, role), so a reload or a restored mobile tab can resume.
- Reconnect uses backoff of 1 s, 2 s, 4 s, then 5 s until the window ends.

**Security and privacy**
- `wss://` only. The Worker checks the `Origin` header against an allowlist from the `ALLOWED_ORIGINS` environment variable. It must include `https://tabel-tennis.vercel.app`, `https://table-tennis-alpha-jet.vercel.app`, the Vercel preview URLs for this repo, and `http://localhost:5173` for development.
- Max 2 players per room, 2 KB message cap, per-socket message rate limit, per-IP limits on creating rooms (about 5 a minute) and looking up codes (about 20 a minute).
- The host clamps all guest input to table bounds and a maximum speed.
- Names: trim, 1–16 characters, strip control characters, optional small blocklist (Y-13), shown with `textContent` only (never `innerHTML`).
- No accounts, no analytics, no personal data stored. **The repo is public, so no secrets are ever committed.** Ignore `.dev.vars` and `.wrangler/`. The only credential is your Cloudflare login, done through `wrangler login`.

### 6.9 Cost (free tier)

WebSockets themselves are free. Cloudflare's free plan (verified from its docs) allows **100,000 Durable Object requests a day**, where each 20 incoming WebSocket messages count as 1 request and outgoing messages are free. The free plan requires SQLite-backed Durable Objects, and the Hibernation API is recommended so idle connections cost nothing.

**Estimate (not an official figure):** a match sends at most about 90 incoming messages a second through the relay. That is roughly 2,700 requests per 10-minute match, or **about 35–40 ten-minute matches a day** in the worst case. That is plenty for you and your friends. If the daily limit is hit, operations fail until it resets at 00:00 UTC (5:30 AM IST), and the game shows "Online play is resting" while vs-Bot keeps working (E-44). If needed, lowering snapshots to 20 per second stretches the limit. Check Cloudflare's current limits before launch.

### 6.10 Configuration (`src/config.ts`, new `NET` block)

```ts
export const NET = {
  protocolVersion: 1,
  relayUrl: import.meta.env.VITE_RELAY_URL ?? "",   // empty => hide Host/Join

  roomCodeLength: 4,
  roomCodeAlphabet: "ABCDEFGHJKMNPQRSTUVWXYZ",       // 23 letters, no I, L, O

  joinWindowMs: 2 * 60 * 1000,
  extendMs: 2 * 60 * 1000,
  maxExtensions: 1,
  lobbyInactivityMs: 5 * 60 * 1000,
  reconnectWindowMs: 15_000,
  bothDroppedWindowMs: 30_000,
  rematchTimeoutMs: 30_000,

  serveTimerMs: 10_000,
  serveTimeoutsBeforePrompt: 2,

  snapshotHz: 30,
  inputHz: 60,
  inputKeepAliveHz: 10,
  heartbeatMs: 2000,
  timeoutMs: 6000,

  interpDelayMs: 100,
  maxExtrapolateMs: 100,
  maxHitForgivenessMs: 80,

  weakPingMs: 250,
  weakPingSeconds: 5,
  hostLowFps: 30,

  maxNameLength: 16,
  labelMaxChars: 10,
};
```

Values used by the server (timers, limits, alphabet, protocol version) also live in `shared/constants.ts`, so client and server can't drift apart.

### 6.11 New and changed files (matching your project tree)

```
./
├─ shared/
│  ├─ protocol.ts          # message types and validators (client + server)
│  └─ constants.ts         # timers, limits, alphabet, protocol version
├─ server/                 # Cloudflare Worker (own package.json, tsconfig, wrangler.toml)
│  ├─ src/index.ts         # HTTP API, WebSocket upgrade, CORS and origin checks, rate limits
│  ├─ src/room.ts          # Room Durable Object: state, alarms, tokens, forwarding, checkpoint
│  └─ test/
└─ src/
   ├─ strings.ts           # all MP text in one place (§4.5, §4.7)
   ├─ net/
   │  ├─ transport.ts      # Transport interface + WebSocket implementation
   │  ├─ api.ts            # HTTP calls (create, preview, join, extend)
   │  ├─ session.ts        # session state machine, roles, reconnect
   │  ├─ hostSim.ts        # authoritative sim loop + snapshot sender
   │  ├─ guestView.ts      # snapshot buffer, interpolation, extrapolation
   │  ├─ mirror.ts         # host ↔ guest coordinate and score mirroring
   │  ├─ clock.ts          # RTT and offset estimation
   │  └─ profile.ts        # saved name (safe localStorage), session token (sessionStorage)
   ├─ game/
   │  └─ controllers.ts    # PaddleController: LocalInput, AIController, RemoteInput
   └─ ui/
      ├─ screens/          # S01 additions to S14 (HTML overlays, like the existing ones)
      └─ mp.css            # styles for MP-only components
```

The server folder has its own tsconfig so your existing `npm run build` (type-check and build) and the Vercel build are not affected. Add a build step for the Worker separately, and only deploy it with `wrangler`.

---

## 7. Edge Cases and Solutions

IDs are used by the tests and the sweep in §8.5.

### 7.1 Room lifecycle

| ID | Situation | Solution |
|---|---|---|
| E-1 | Host leaves the app (e.g. to WhatsApp) and the socket drops while waiting | The room is **not** deleted. It waits until the join window ends. The host reconnects with the stored token on return. A guest who joined meanwhile sees "{Name} stepped away…" |
| E-2 | A friend joins at the exact moment the room expires | The server is the single clock. Whichever it processes first wins: a join first cancels the alarm, otherwise the join gets "Room expired" |
| E-3 | Guest joins, then leaves before Start | The slot frees, the lobby returns to "Waiting for a friend", and a **fresh 2-minute window** starts |
| E-4 | Host presses Start but the guest just dropped | The server rejects it and the host sees "{Name} isn't connected yet" |
| E-5 | Two people try to join at once | The first is accepted, the second gets "That match already started" |
| E-6 | Code collision on creation | The server regenerates the code and retries |
| E-7 | A host creates a second room while one is open | The old room is closed (one hosted room per browser) |
| E-8 | An old link is opened after the room ended | "This game has ended" with Host your own |
| E-9 | Both in the lobby, nobody starts | Closes after 5 minutes: "Room closed due to inactivity" |
| E-10 | Host cancels while the guest is mid-join | The guest gets "{Name} ended the game" |

### 7.2 Connection and recovery

| ID | Situation | Solution |
|---|---|---|
| E-11 | Guest drops mid-match | The host pauses and shows the overlay for 15 s. The guest reconnects with its token and gets `state_sync` |
| E-12 | Host hides the game or locks the phone (page still alive) | The host announces `pause {host_hidden}` first, then pauses. On return it resumes with a 2-second countdown |
| E-13 | Host drops completely mid-match | The guest sees the overlay. If the host returns within 15 s, play resumes, otherwise the guest wins by forfeit (pending Y-9) |
| E-14 | Host page **reloads or crashes** mid-match | The server holds the last `checkpoint`. On reconnect the host restores the score and starts a fresh serve |
| E-15 | Both players drop at once | The room is kept for 30 s. If either returns, normal recovery applies, otherwise it is destroyed |
| E-16 | Wi-Fi to mobile data switch | The socket drops and reconnect runs with backoff until the window ends |
| E-17 | Snapshots arrive late, duplicated or out of order | Every snapshot has a `tick`. Anything older than the newest is dropped |
| E-18 | A player idles on their serve | 10-second timer, then an automatic serve. After 2 timeouts in a row: "Still there?". After 3, treated as a disconnect |
| E-19 | Latency spike (300 ms to 1 s) | Extrapolate up to 100 ms, then hold. Above 1 s: "Waiting for {Name}…". After 6 s: pause with the overlay |
| E-20 | Chronically high ping (over 400 ms) | Warn both players once ("Slow connection"), never block play |
| E-21 | A proxy or carrier silently kills idle sockets | The 2-second heartbeat keeps sockets active and spots dead ones within 6 s |
| E-22 | The same player opens the game in two tabs | The newest tab wins. The older tab shows "Game is open in another tab" |
| E-23 | A slow host device (low frame rate) | If the host stays under 30 fps for 3 s, show "Your device is struggling. Close other tabs." The lobby hint already says "Host from the faster device" |

### 7.3 Gameplay

| ID | Situation | Solution |
|---|---|---|
| E-24 | Both press serve at once | Only the designated server's serve counts |
| E-25 | Score disagreement | Impossible by design. The guest only displays the host's score |
| E-26 | Net, bounce and paddle in the same tick | The host resolves events in a fixed order (bounce, net, paddle) and emits one `event` per outcome |
| E-27 | A modified client sends impossible paddle input | The host clamps position and speed |
| E-28 | A player leaves mid-match | The other sees "{Name} left the game. You win by forfeit" (pending Y-9) |
| E-29 | Deuce goes on forever | No cap, the match continues (win by 2) |

### 7.4 Device and browser

| ID | Situation | Solution |
|---|---|---|
| E-30 | Web Share API unavailable (desktop) | Share copies the link and shows "Link copied" |
| E-31 | Clipboard denied or page not secure | Show the link in a selectable field |
| E-32 | Opened in an in-app browser (chat or social apps) | Share, clipboard and Wake Lock may be missing, and every one has a fallback |
| E-33 | `localStorage` blocked (private mode) | Keep the name in memory for the session, never show an error |
| E-34 | Wake Lock unsupported | Ignore it. The reconnect flow covers sleeping screens |
| E-35 | The on-screen keyboard covers the code boxes | Use the visual viewport size so the boxes stay visible |
| E-36 | A second finger, a palm, or iOS edge-swipe-back during play | Track one pointer only, `touch-action: none` and `overscroll-behavior: none` on the game area (as today) |
| E-37 | Phone rotates mid-match | Re-layout without resetting any state (as today) |
| E-38 | Audio blocked until a gesture | The first tap (Host, Join or Start) unlocks audio |
| E-39 | A corporate or school network blocks WebSockets | "Can't reach the game server" with Retry and Play vs Bot |
| E-40 | Notch or home-indicator overlap | Respect safe-area insets everywhere, including the footer pill |

### 7.5 Abuse, limits and updates

| ID | Situation | Solution |
|---|---|---|
| E-41 | Guessing room codes | 279,841 codes, rooms live minutes, per-IP lookup limit (about 20 a minute) |
| E-42 | Spamming room creation | Per-IP limit (about 5 a minute) and a global cap on open rooms |
| E-43 | Message flooding or giant messages | Per-socket rate limit and 2 KB cap, then the socket is closed |
| E-44 | The free daily limit is reached | "Online play is resting". Resets at 00:00 UTC (5:30 AM IST). vs-Bot always works |
| E-45 | Player has an old cached version | The `v` field triggers "A new version is available" |
| E-46 | Offensive or empty names | Trim, 1–16 characters, strip control characters, optional blocklist. `textContent` only |
| E-47 | Two players with the same name | The guest becomes "Name (2)" |
| E-48 | Typing characters that aren't in codes | A gentle hint: "Codes use letters only (no I, L or O)" |

### 7.6 Added after reading your real project

| ID | Situation | Solution |
|---|---|---|
| E-49 | The **guest** hides the game or locks the phone mid-match (their loop pauses, but the host's wouldn't) | The guest sends `away` first. The host pauses everyone ("{Name} stepped away…") for up to 15 s. On `back` it resumes with a 2-second countdown. If they don't return, forfeit (pending Y-9) |
| E-50 | `VITE_RELAY_URL` isn't set (e.g. a preview deploy without the variable) | Host and Join are hidden on the start screen. vs-Bot is unaffected |
| E-51 | The link is opened on the other Vercel address (`table-tennis-alpha-jet`) | The invite link is built from the current site address, and both addresses are in the origin allowlist |
| E-52 | A friend's name is very long or very wide | Scoreboard labels truncate to 10 characters with "…". Lobbies show the full name |
| E-53 | An accidental tap or Space press on the result modal | Ignored in MP. Only the Rematch and Leave buttons act |
| E-54 | Unfinished multiplayer work reaches production | Work only on branch `multiplayer`. Merge to `main` only after §8.5 passes, because every push to `main` deploys live |

---

## 8. Build Plan

### 8.1 Branch and deploy strategy

- `main` auto-deploys to production, so **all work goes on branch `multiplayer`**. Vercel makes a preview URL for each push, so you can test there.
- Set `VITE_RELAY_URL` in Vercel for **Preview** and **Production** (⚠️ Y-3). Without it the MP buttons stay hidden (E-50).
- Merge to `main` only when the QA gate in §8.5 is green.

### 8.2 Prompt template for every Cursor chat

> Read `TT game project.md` and `TT multiplayer PRD.md`. Task: **{ID}**. Only change the files listed for this task. Don't change vs-Bot behavior. Keep `npm run build` passing and the bundle under 150 KB gzipped. When done, tell me which "Done when" items you verified and how.

Rules for every chat: one task per chat, commit after each task passes its "Done when", paste real errors and test output back instead of describing them, and for visual work attach a screenshot of the current screen next to the reference frames.

### 8.3 Progress tracker

| Track | Tasks | Status |
|---|---|---|
| Day 1 | F-0, B-1 to B-6, F-1 to F-7, T-1 to T-3 | ☐ |
| Day 2 | D2-1 to D2-7 | ☐ |
| Both | S-1 to S-3 | ☐ |

"Day" means a work block (roughly a full working day each), not a promise. Netcode debugging is the main uncertainty. **Day 2 needs Day 1's screens**, except D2-1, which can start in parallel.

> Grok writes the netcode. Netcode bugs are subtle, so judge it by the automated two-client test (T-1) and the edge-case sweep (§8.5), not by eye.

---

### DAY 1 — Frontend + Backend (Grok)

**Goal:** a fully working multiplayer mode: rooms, join by link or code, matches, reconnects. Screens use your **existing classes** (buttons, modal, chip, info badge, footer) wherever they exist, plain markup elsewhere, and `data-testid` on every control, so Day 2 can style without touching logic.

- [ ] **F-0 Code survey (no code changes).** Read the repo and report how the loop, world state, `input.ts`, `ai.ts`, `main.ts`, overlays and HTML are actually structured, mapping every proposal in §6.4 to the real code. Update §6.4 in this PRD if reality differs.
  - **Done when:** a short written map exists and any mismatch with this PRD is listed.

**Backend**

- [ ] **B-1 Scaffold the Worker.** `server/` with a Worker, a SQLite-backed `Room` Durable Object (Hibernation API), `wrangler.toml` and dev scripts. Add `.dev.vars` and `.wrangler/` to `.gitignore`.
  - **Done when:** `wrangler dev` runs and a test WebSocket connects and echoes.
- [ ] **B-2 Rooms API.** `POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:code/join`, `POST /api/rooms/:code/extend`, WebSocket upgrade, 4-letter code with collision retry, CORS and `Origin` allowlist (`ALLOWED_ORIGINS`).
  - **Done when:** create, preview and join work from a script, a third joiner is rejected (E-5), and a disallowed origin is refused.
- [ ] **B-3 Room state machine.** States and alarms from §6.5, host-away tolerance (E-1), restart of the window when a guest leaves (E-3), `checkpoint` storage (E-14), all state in Durable Object storage.
  - **Done when:** every row in §7.1 and §7.2 that involves the server behaves as written, using scripted clients.
- [ ] **B-4 Validation and limits.** `v` check (E-45), message size and rate limits (E-43), per-IP limits (E-41, E-42), name rules (E-46, E-47).
  - **Done when:** oversized, malformed, flooding and wrong-version clients are rejected without crashing a room.
- [ ] **B-5 Heartbeat and relay.** Use `setWebSocketAutoResponse` for ping and pong, forward gameplay messages unchanged, and detect dead sockets within 6 s (E-21).
  - **Done when:** a killed client is detected and the peer is told within 6 s.
- [ ] **B-6 Deploy** (needs Y-1). Deploy the Worker, set `VITE_RELAY_URL` and `ALLOWED_ORIGINS`, and use `wss://` only.
  - **Done when:** a preview deploy on Vercel can host and join a room across two networks.

**Frontend logic**

- [ ] **F-1 Paddle controllers.** `controllers.ts` with `LocalInput`, `AIController` and `RemoteInput`. vs-Bot must not change.
  - **Done when:** a **seeded headless simulation** gives identical results before and after (reuse your existing headless approach), and vs-Bot plays the same by hand.
- [ ] **F-2 Transport, API, session.** `transport.ts`, `api.ts`, `session.ts`, `profile.ts` (safe storage, E-33) and the session state machine for S01 to S14, including duplicate tabs (E-22) and `tt-session` in `sessionStorage`.
  - **Done when:** the session machine passes unit tests for every screen transition in §4.6.
- [ ] **F-3 Screens S01 to S14.** HTML overlays like the existing ones, microcopy only from `src/strings.ts`, history entries for Back, Share and clipboard fallbacks (E-30 to E-32), code-box behavior (E-48), the MP buttons on the start screen (§4.2) hidden when no relay is configured (E-50).
  - **Done when:** the whole flow in §4.6 can be clicked through without console errors, and the start screen is unchanged when `VITE_RELAY_URL` is empty.
- [ ] **F-4 Host simulation and guest view.** `hostSim.ts`, `guestView.ts`, `mirror.ts`, `clock.ts`. Human hit radius 0.17 m for both paddles, `solveShot` for both, and the guest's hit forgiveness (§6.7).
  - **Done when:** a full match plays between two windows and each player sees themselves at the near end with the red paddle and correct names and score.
- [ ] **F-5 Events and match behavior.** Events drive sounds, shake (own hits only), net shimmer, +1 and the point caption (viewer-relative, §4.7). Serve timer (E-18). Character expressions mapped by viewer. Auto bubbles off. Emote messages, forfeit and leave logic (E-28).
  - **Done when:** each behavior in §4.7 works in a two-window test.
- [ ] **F-6 Resilience.** Visibility handling for both players (E-12, E-49), wake lock (E-34), reconnect with backoff (E-16), `state_sync`, checkpoint restore (E-14), latency policy (E-19, E-20), low-fps warning (E-23).
  - **Done when:** every row in §7.2 passes its check.
- [ ] **F-7 Result, rematch, leave.** S11 to S13 logic, a 30-second rematch timeout, and E-53.
  - **Done when:** rematch keeps sides, leaving notifies the friend, and an accidental tap does nothing.

**Tests**

- [ ] **T-1 Two-client end-to-end** (Playwright, two browser contexts against `wrangler dev`): host, join by code, join by link, play to 11, rematch, leave.
- [ ] **T-2 Chaos script:** drop and restore one client, add latency, reload the host mid-match. Covers E-11 to E-19.
- [ ] **T-3 Unit tests:** mirror transform, interpolation, code generation, state machines, input clamping, and the seeded vs-Bot golden test from F-1.

**Day 1 exit:** T-1 to T-3 pass, and you have played one full match with a friend on a Vercel preview URL.

---

### DAY 2 — Design (Claude Sonnet)

**Goal:** every MP screen looks like it belongs in your game, using the **same font, type scale, palette and components**. Sonnet may edit CSS, markup and **visual-only** render code (`render/*`, `ui/*`). It **must not edit** `shared/`, `server/`, `src/net/`, or game physics and rules.

**Attach to every Day 2 chat:** `TT game project.md` (§8 art direction, §9 UI), this PRD (§4 UX and copy), the reference frames, and a fresh screenshot of the current screen.

- [ ] **D2-1 Tokens and MP components** *(can start early)*. Reuse existing tokens (palette in §8.1 of `TT game project.md`, type scale §8.2). Add only what's missing: a code card, four-box code input, countdown ring, connection bars icon, toast, name field. **No new colours.**
  - **Done when:** one page shows all new components next to the existing buttons and modal, at phone and desktop widths.
- [ ] **D2-2 Lobby screens (S01 additions to S07).** Extended start screen with the divider, the two MP buttons and the name line, host lobby (large spaced code card, Share invite as the hero, countdown that turns `bubble` red at 0:20, +2 min), friend-joined state, code entry, invite screen, guest lobby.
  - **Done when:** all look finished at 360 px, 768 px and 1280 px, portrait and landscape on phone, and the start screen still matches `TT game project.md` §9.3 for everything that existed.
- [ ] **D2-3 Match chrome (S08 to S13).** Countdown numerals, connection chip and bars, leave button (44 px), reconnect overlay, result and rematch screens, Leave dialog, emote tray, the red bubble for friend emotes and the red "You" pill for your own.
  - **Done when:** chrome never covers the table or paddle at any size, and every control is at least 44 px.
- [ ] **D2-4 Character reactions.** Verify each expression in §4.7 reads clearly and ties to the right viewer-relative trigger. Use the existing expressions. No new character.
  - **Done when:** each state is distinct, and auto bubbles stay off in MP.
- [ ] **D2-5 Message screens (S14).** All eleven rows in §4.5, each with one primary button and a quiet "Play vs Bot" link.
  - **Done when:** all render correctly at every breakpoint.
- [ ] **D2-6 Motion.** Screen transitions, countdown pop and fade, toasts, button feedback, in the same style as the existing score pop and bubble animations. `prefers-reduced-motion` turns them off.
  - **Done when:** nothing janky at 60 fps on a mid-range phone.
- [ ] **D2-7 Accessibility and visual QA.** Contrast 4.5:1 or better, visible focus, `aria-live` for expiry, "joined", reconnecting and result, labels on icon buttons, signal strength also stated as text. Optional link-preview image (Y-17).
  - **Done when:** the pass in §10 succeeds and screenshots match the reference style.

---

### 8.5 Shared QA and Ship

- [ ] **S-1 Real-device test** (needs Y-6): phone vs laptop, phone vs phone, iOS Safari and Android Chrome, Wi-Fi and mobile data.
- [ ] **S-2 Edge-case sweep:** tick every group below.
- [ ] **S-3 Ship:** merge `multiplayer` to `main`, confirm the production deploy, play one last match, and simulate the free-limit error to see the "resting" screen.

| Group | IDs | ☐ |
|---|---|---|
| Room lifecycle | E-1 to E-10 | ☐ |
| Connection and recovery | E-11 to E-23 | ☐ |
| Gameplay | E-24 to E-29 | ☐ |
| Device and browser | E-30 to E-40 | ☐ |
| Abuse, limits, updates | E-41 to E-48 | ☐ |
| Added after reading the real project | E-49 to E-54 | ☐ |

### 8.6 Cursor setup (`.cursor/rules`)

```
- Work only on branch `multiplayer`. Never push to main.
- TypeScript strict, no UI framework, no new client dependencies (native WebSocket only).
- Keep `npm run build` passing and the bundle under 150 KB gzipped.
- All tunable constants live in src/config.ts; values shared with the server live in shared/constants.ts.
- Message types live only in shared/protocol.ts.
- All MP user-facing text lives in src/strings.ts.
- Font is SF Cartoonist Hand. Use existing CSS variables and components. No new colours.
- Room state on the server lives in Durable Object storage, never only in memory.
- Render names with textContent only. Never use innerHTML with user data.
- Never commit secrets (the repo is public). Ignore .dev.vars and .wrangler/.
- vs-Bot behavior must not change. Verify with the seeded headless simulation.
- After each change run: type-check, unit tests, and the two-client test if net/ or server/ changed.
- Day 2 work must not edit shared/, server/, src/net/ or game physics.
```

---

## 9. Dependencies From You (⚠️)

Each shows when it blocks work and **what I'll assume if you don't answer**.

### 9.1 Already resolved by your real project

| Item | Resolution |
|---|---|
| Game name | **Table Tennis** (start screen title) |
| Footer links | Instagram, X and LinkedIn already in place |
| Static hosting | Vercel (existing) |
| Domain | `tabel-tennis.vercel.app` (existing) |
| GitHub repo | Existing public repo `Girish-shedge/table-tennis` |
| Character | One character (Bot's), representing the friend |

### 9.2 Accounts and setup

| ID | What you need to do | Needed by | If you don't |
|---|---|---|---|
| ⚠️ Y-1 | Create a **free Cloudflare account** and run `wrangler login` in your terminal (never paste tokens into Cursor chat) | B-6 | You can build and test locally, but friends can't join over the internet |
| ⚠️ Y-2 | Create the git branch `multiplayer` and confirm Vercel makes preview deployments for it | Start of Day 1 | Cursor works on a local branch, with no real-device tests |
| ⚠️ Y-3 | In Vercel, set `VITE_RELAY_URL` (for **Preview** and **Production**) once the Worker URL exists, and keep `ALLOWED_ORIGINS` in the Worker settings in sync | B-6 | The MP buttons stay hidden (by design, E-50) |
| ⚠️ Y-5 | Confirm that **Grok** and **Sonnet** both appear in your Cursor model picker and your plan covers a day of heavy use | Before each day | Use the strongest available model for netcode, and Sonnet for design |
| ⚠️ Y-6 | Have **a second device and a friend** (or a second browser profile) ready | S-1 | Testing is limited to two windows on one computer |

### 9.3 Decisions and clarifications

| ID | Question | Needed by | My default |
|---|---|---|---|
| ⚠️ Y-9 | If a player leaves or doesn't come back in time, does the other **win by forfeit**? | B-3, F-6 | Yes |
| ⚠️ Y-10 | A one-time **"+2 min"** button on the host lobby? (A host sharing the link in WhatsApp can burn much of a 2-minute window) | F-3, D2-2 | Include it |
| ⚠️ Y-11 | **Host presses Start**, with no ready toggles | F-3 | Host presses Start |
| ⚠️ Y-13 | A small **name blocklist** for offensive names? | B-4 | A very small blocklist |
| ⚠️ Y-14 | Minimum browsers as listed in §3.2 | S-1 | As listed |
| ⚠️ Y-16 | No analytics or tracking | B-4 | None |
| ⚠️ Y-17 | A link-preview image for shared invites (optional) | D2-7 | Skipped |
| ⚠️ Y-18 | **Auto speech bubbles off in MP**, so a bubble always means a friend's emote (the face still reacts) | F-5, D2-4 | Off in MP |
| ⚠️ Y-19 | **Letters-only codes** (23 letters, 279,841 combinations) instead of letters plus digits, because of the hand-drawn font | B-2 | Letters only |
| ⚠️ Y-20 | **Start screen layout:** the two MP buttons sit **under** Easy, Medium and Hard, after a quiet "or play a friend" divider | F-3, D2-2 | As described in §4.2 |

---

## 10. Acceptance Criteria and Tests

### 10.1 Acceptance

Everything in `TT game project.md` §13 still holds (first frame matches the reference, depth scaling, tilt, no scroll, no external image assets), and in addition:

- [ ] A friend can host, and another friend can join by link or code, and finish an 11-point match, with no sign-up.
- [ ] Each player sees themselves at the near end with the red paddle, and the friend's name on the scoreboard.
- [ ] Rules and feel match vs-Bot: serve rotation (every 2 points, every point from 10–10), 1.6 s point freeze, 0.17 m hit radius.
- [ ] At 100 ms RTT the guest's paddle feels instant and the ball motion looks smooth.
- [ ] A 10-second connection drop during a rally recovers without losing the score.
- [ ] A host who switches apps to share the link does not lose the room.
- [ ] A room that nobody joins expires after 2 minutes with a clear screen.
- [ ] vs-Bot is unchanged (seeded simulation matches) and still works if the relay is unreachable.
- [ ] The bundle is under 150 KB gzipped, with no new client dependencies.
- [ ] Rooms and their data are gone shortly after both players leave.

### 10.2 Test plan

**Network conditions** (Chrome DevTools throttling plus real devices)
- [ ] 50 ms, 150 ms and 300 ms latency: playable up to about 150 ms.
- [ ] 2–5% packet loss: no freezes longer than 200 ms.
- [ ] Offline for 5 s: pause then resume. Offline for 20 s: the match ends cleanly.
- [ ] Wi-Fi to mobile data mid-match recovers.

**Devices:** phone (portrait and landscape) vs laptop, phone vs phone, iOS Safari vs Android Chrome, backgrounding and screen lock on both.

**Security:** malformed and oversized messages dropped, a third join rejected, impossible paddle values clamped, a disallowed origin refused.

**Accessibility pass**
- [ ] Keyboard-only through the start screen, lobbies and result, with a visible focus ring.
- [ ] A screen reader announces "Room expires in…", "{Name} joined", "Reconnecting…" and the result.
- [ ] Reduced motion on: no shake, streak or large movement.
- [ ] Zoom to 200%: nothing is cut off.

---

## 11. Risks

| Risk | What reduces it |
|---|---|
| Netcode feels laggy or desyncs | Throttled-latency tests early (T-2) and the automated tests |
| A mobile browser suspends a player mid-match | Announce-then-pause (E-12, E-49), checkpoint recovery (E-14), tests on real phones |
| Free daily limit reached on a busy day | The "resting" screen (E-44), 20 Hz fallback, vs-Bot always available |
| Refactoring breaks vs-Bot | Seeded headless golden test (F-1, T-3) |
| Design edits break logic | Day 2 may not edit `shared/`, `server/`, `src/net/` or physics, and tests re-run after Day 2 |
| Half-built multiplayer reaches production | Branch `multiplayer`, merge only after §8.5 (E-54) |

---

## 12. Open Items

Everything marked ⚠️ in §9 has a default, so building can start now. Answer the ⚠️ items whenever you can, and tell me if you want any default changed.

---

## Appendix A. Edits to `TT game project.md` (so the two files don't clash)

A patched copy, `TT_game_project_updated.md`, accompanies this PRD. These are the only changes, and none alter any single-player behavior:

1. **§0 Status table:** add a row, "Next release: v2.0 online multiplayer, specified in `TT multiplayer PRD.md`".
2. **§2 Non-goals:** change "Online multiplayer, accounts, leaderboards" to "Accounts and leaderboards" with a note that online multiplayer is now specified in the PRD for v2.0.
3. **§12 Build History:** add a "v2.0 — Online multiplayer (planned)" entry for Cursor to update as it ships.
4. **§16 Ideas for Later:** change "Two-player mode (local or online)" to "Local two-player on one device", pointing to the PRD for online play.
5. **New §17 "Multiplayer (v2.0)":** a short note that the PRD owns everything online and which file wins where (the table in §0.1 of this PRD).

When v2.0 ships, Cursor should also add the new files from §6.11 to the §4 project structure, the `NET` block to §14, and the new decisions to §15.
