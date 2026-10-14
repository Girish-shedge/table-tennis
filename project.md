# Table Tennis (TT) — Project Spec

A single-screen, hand-drawn-style, pseudo-3D table tennis game that plays in the browser on desktop (keyboard and mouse) and mobile (touch). You play the red paddle at the near end against **Bot**, a hand-drawn character with a blue paddle at the far end.

This is the single source of truth for the project. It started as the build brief, reverse-engineered from the 10 reference frames (`frame_001.png` to `frame_010.png`), and now records what was actually built, the decisions taken along the way, and every update since the first release.

- **Part 1 (§0–§16):** the game itself: visuals, rules, physics, Bot, controls, art direction, UI and history.
- **Part 2 (§17–§29):** online multiplayer: requirements, UX and copy, relay design, edge cases (E-1 to E-54), build plan, tests, and the current state and known gaps (§29).

---

# Part 1 — The Game

## 0. Status and Links

| | |
|---|---|
| **Status** | v2.2 live (15 Oct 2026): rally power holds until your hit, Play with a friend dialog, signal strength on the home page and 12-character names, on top of v2.1 (shot power, serve preview, steadier Bot, §30.4) and v2.0 online multiplayer (Part 2). Real-device test (S-1) and edge-case sweep (S-2) still to do |
| **Live game** | [tabel-tennis.vercel.app](https://tabel-tennis.vercel.app) |
| **Other live URLs** | [table-tennis-alpha-jet.vercel.app](https://table-tennis-alpha-jet.vercel.app) (original Vercel address, still works) |
| **Source code** | [github.com/Girish-shedge/table-tennis](https://github.com/Girish-shedge/table-tennis) (public, branch `main`) |
| **Hosting** | Vercel, connected to GitHub. Every push to `main` deploys to production automatically. |
| **Multiplayer relay** | Cloudflare Worker `tt-relay` at `https://tt-relay.girish-tt.workers.dev` (code in `server/`, deployed with `wrangler`). The client uses `wss://tt-relay.girish-tt.workers.dev`, set as `VITE_RELAY_URL` in Vercel (Production only) |
| **Branches** | Work happens on `multiplayer` and is fast-forward merged into `main` to ship (14 Oct 2026 for v2.0, 15 Oct 2026 for v2.1 and v2.2). Start new work on a branch |
| **Models used** | Day 1 multiplayer (frontend + backend): Grok. Day 2 (design): Claude Sonnet |
| **Bundle size** | About 21 KB of gzipped JavaScript, 5.8 KB of CSS and 3.1 KB of HTML in v2.2 (target is under 150 KB). vs-Bot alone was 12.7 KB |

Note: `table-tennis.vercel.app` is owned by another Vercel account, so the custom address uses the spelling `tabel-tennis`.

### Run it locally

```bash
npm install
npm run dev      # dev server with hot reload
npm run build    # type-check and build to dist/
npm run preview  # serve the production build
npm test         # unit tests, including the seeded vs-Bot golden test
```

Multiplayer needs the relay as well. See §29 for the local relay, the end-to-end test and the QA scripts.

---

## 1. Visual Analysis of the Reference Frames

### 1.1 Scene layout (top to bottom, centered, white page)

| Layer | What the frames show | What was built |
|---|---|---|
| Scoreboard | Two large serif numerals (`3 · 4`) with a small grey dot between them and tiny grey labels underneath | Big, bold numerals in SF Cartoonist Hand, sitting slightly higher than in the reference. Labels read **You** and **Bot**. |
| Opponent character | A hand-drawn blob "head" with no body, floating above the far end and following the ball | An original blob character, **Bot**, with its own expressions |
| Speech bubble | A small red rounded rectangle with white text (`Hey!`) that pops in and fades out | Same, with reaction lines (see §8.5) |
| Opponent paddle | A small blue paddle floating above the far edge that tilts as it moves | Same |
| Ball | A tiny white ball with a black outline and a soft shadow, scaled by depth | Same, plus a motion streak and a ground bounce and roll (see §8.4) |
| Table | A blue trapezoid in perspective with a white border, a white center line and a darker front edge | Same |
| Net | A translucent light-blue band with two black posts and a black top cord | Redesigned to match the reference more closely (see §8.6) |
| Player paddle | A red paddle with a thick outline, a white highlight, a white handle and a hand icon. A dark-blue shadow sits beneath it. | Same, drawn at 80% opacity so the ball stays visible through it |
| Cursor tooltip | A red pill that reads `Grab` when hovering or dragging | A red pill that reads **`You`** |
| Hint caption | Small grey text under the table | Same, with different text for keyboard and touch. Point results show here in red (see §9). |
| Footer pill | A floating white pill: `email │ Instagram │ X` | `Instagram │ X │ LinkedIn` with Girish's own links. No email. |

### 1.2 Character expressions

| State | Look | When it appears |
|---|---|---|
| **Watching** | Wide eyes with pupils, open oval mouth | Default during a rally |
| **Shocked** | Brief surprised reaction | When the player returns the ball |
| **Dizzy** | Spiral or "X" eyes and a `Hey!`-style bubble | When the player wins a point |
| **Happy** | Pleased face with a `Ha!`-style bubble | When Bot wins a point |
| **Looking sideways** | Pupils follow the ball, and the head slides and tilts | Throughout the rally |

### 1.3 Paddle behavior

- The player paddle moves left, right, toward the net and away from it, and scales with depth.
- It tilts in the direction of movement.
- Its shadow follows it on the table plane.
- Arrow keys, pointer drag and touch drag all control it.

### 1.4 Reference proportions (measured on a 1136 × 718 frame)

| Element | Approx. position (px) | As a ratio of the frame |
|---|---|---|
| Table far edge | y ≈ 293, x from 420 to 705 | y 0.41, x 0.37–0.62 |
| Table near edge | y ≈ 590, x from 265 to 860 | y 0.82, x 0.23–0.76 |
| Net band | y ≈ 352–390, x from 345 to 780 | y 0.49–0.54 |
| Scoreboard | center x ≈ 560, y ≈ 80 | y 0.11 (built slightly higher) |
| Opponent head | y ≈ 130–215 | y 0.18–0.30 |
| Hint caption | y ≈ 622 | y 0.87 |
| Footer pill | y ≈ 670 | y 0.93 |

---

## 2. Goals and Non-Goals

**Goals**
- Instant play with no sign-in.
- Works on desktop (keyboard and mouse) and on phones and tablets (touch), portrait and landscape.
- Charming hand-drawn look with smooth 60 fps animation.
- A fair, beatable AI with three difficulty modes: Easy, Medium and Hard.

**Non-goals**
- Accounts and leaderboards. (Online multiplayer was added in v2.0 and is specified in Part 2 of this document.)
- A real 3D engine. The game uses 2D canvas with a perspective projection.

---

## 3. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Safer physics and state code |
| Build | Vite 5 | Fast dev server, simple static deploy |
| Rendering | HTML5 Canvas 2D | Full control of the hand-drawn look, and it performs well on mobile |
| Input | Pointer Events and Keyboard Events | One code path for mouse, touch and pen |
| Audio | Web Audio API (synthesized blips) | No asset files. Unlocked on the first gesture. |
| State | Plain finite state machine | Small game, no framework needed |
| Font | **SF Cartoonist Hand** (regular, bold, italic), self-hosted from `public/fonts/` | Matches the hand-drawn art. Falls back to Comic Sans MS, then Chalkboard SE. |
| Hosting | Vercel with GitHub integration | Auto-deploy on every push |

No React. The game loop and canvas live outside any UI framework.

---

## 4. Project Structure

The project lives in the workspace root.

```
./
├─ index.html              # canvas, start and game-over overlays, controls, footer, MP containers
├─ project.md              # this document (game spec, multiplayer spec, status and history)
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ .gitignore              # excludes node_modules, dist, .vercel, frame_*.png, .dev.vars, .wrangler, test output
├─ TrueType/               # source copies of the SF Cartoonist font family
├─ public/
│  └─ fonts/               # SFCartoonistHand.ttf, -Bold.ttf, -Italic.ttf (served to the browser)
├─ shared/                 # protocol and constants shared by client and relay (multiplayer)
├─ server/                 # Cloudflare Worker relay (multiplayer)
├─ tests/                  # unit tests, vs-Bot golden test, two-client e2e test
├─ scripts/                # screenshot and accessibility QA scripts
└─ src/
   ├─ main.ts              # bootstrap, resize, events, overlays, draw order, loop
   ├─ config.ts            # all tunable constants, difficulty presets, colors, fonts, footer links
   ├─ strings.ts           # multiplayer copy
   ├─ audio.ts             # synthesized sounds and mute (saved in localStorage)
   ├─ net/                 # multiplayer: transport, API, session, host sim, guest view, mirror, clock
   ├─ game/
   │  ├─ state.ts          # FSM: MENU, SERVE, RALLY, POINT, GAME_OVER
   │  ├─ physics.ts        # ball integration, table, net and floor bounces, shot solver
   │  ├─ ai.ts             # opponent controller
   │  ├─ controllers.ts    # paddle controllers: local input, AI, remote input
   │  ├─ score.ts          # win rule and server rotation
   │  ├─ input.ts          # keyboard, pointer drag, touch drag, power pull
   │  └─ shot.ts           # shot power curve, aim and serve preview path
   ├─ render/
   │  ├─ projection.ts     # world → screen transform and back
   │  ├─ table.ts          # table, lines, net
   │  ├─ paddle.ts         # player and opponent paddles (with transparency support)
   │  ├─ ball.ts           # ball, shadow, motion streak
   │  ├─ character.ts      # Bot's head and expressions
   │  ├─ bubble.ts         # speech bubble and "You" tooltip
   │  ├─ hud.ts            # scoreboard, +1 animation, caption
   │  ├─ preview.ts        # dotted serve path and landing ring
   │  └─ sketch.ts         # wobbly stroke helpers
   └─ ui/
      ├─ styles.css        # font faces, type scale, overlays, buttons, info badge
      ├─ footer.css        # footer pill
      ├─ mp.css            # multiplayer components and screens
      ├─ screens/index.ts  # multiplayer screens
      ├─ conn.ts, toast.ts # connection chip and toasts
      └─ design.ts         # dev-only component sheet (design.html)
```

The full multiplayer file list is in §22.11.

The reference frames are kept locally but not pushed to GitHub.

---

## 5. Coordinate System and Projection

### 5.1 World space (meters, table centered)

- `x` runs left (−) to right (+). The table is **1.525 m** wide, so x ∈ [−0.7625, 0.7625].
- `z` is depth. The player's end is at `z = 0`, the opponent's end at `z = 2.74`, and the net at `z = 1.37`.
- `y` is height above the table surface. The net is 0.1525 m high and the floor is at `y = −0.76`.

### 5.2 Perspective to screen

A pinhole projection for a camera behind and above the player's end, tuned so the far edge is **0.48×** the width of the near edge, as in the reference. `Projection.project(x, y, z)` maps world to screen, and `unprojectToPlane` maps a pointer position back onto a world plane for drag control. Paddles, the ball and shadows scale with depth.

### 5.3 Responsive scaling

- Landscape design size is **1136 × 718**, with a separate portrait layout for phones.
- The canvas renders at `devicePixelRatio` for sharpness.
- On resize or orientation change, the layout is recomputed and the game state is kept.
- The footer pill respects `env(safe-area-inset-bottom)`.

---

## 6. Game Mechanics

### 6.1 State machine

```
MENU (start screen: pick Easy, Medium or Hard)
  └─ choose a mode  →  SERVE
SERVE (ball held above the server's paddle)
  └─ Space / tap (player) or a timer (Bot)  →  RALLY
RALLY (physics live)
  └─ ball dies  →  POINT
POINT (1.6 s freeze: the ball keeps falling and rolling, reactions play, the score updates)
  └─ if someone has won  →  GAME_OVER  else  →  SERVE
GAME_OVER (result modal: "Play again" or "Change difficulty")
```

The difficulty is **locked for the whole match**. It can only be changed from the game-over modal.

### 6.2 Rules

- First to **11**, win by **2**.
- Serve switches every 2 points, and every point at deuce (10–10 and beyond).
- A valid return must bounce once on the receiver's half. A missed ball, a net, an out, a double bounce or a fault ends the point.

### 6.3 Ball physics

Fixed step `dt = 1/120 s`, accumulated from `requestAnimationFrame`.

- Gravity is 9.8 m/s², integrated with semi-implicit Euler.
- **Table bounce**: `vy = −vy × 0.85`.
- **Net**: collisions only count while the point is live.
- **Floor**: once a point is over, the ball keeps going. It drops to the floor, bounces with half its speed, loses 20% of its horizontal speed per bounce, then rolls to a stop with friction. If it lands behind the far end of the table, the table hides it.

### 6.4 Paddle hit

- The hit test happens in world space: the player's hit radius is 0.17 m, and Bot's is 0.09 m plus a per-difficulty bonus.
- Return shots come from a ballistic solver (`solveShot`) that always clears the net.
- Where the ball meets the paddle face, and how the paddle is moving, both steer the aim.
- Each hit plays a "tok" sound. A player hit also gives a small screen shake.

### 6.5 Player paddle

- `x` is clamped to the table width plus a 0.25 m margin.
- `z` is clamped between 0.3 m and 1.2 m (the player's half).
- The paddle follows its target with exponential easing (0.07 s).
- It tilts with velocity, and its shadow sits on the table beneath it.
- It's drawn at **80% opacity**, and the ball is always drawn in front of it.

### 6.6 AI opponent (Bot)

Bot tracks the predicted ball position with:
- a **reaction delay** after the player hits,
- a **lateral speed cap**,
- a **tracking error** that grows with the distance it has to travel (0.10 m extra per meter),
- **aim spread** and a **corner bias** that decide how wide it hits,
- a gentle rubber-band effect that keeps games close.

Bot never misses on purpose (no random net or out faults). It only loses a point when it can't reach the ball in time.

| Mode | Reaction | Tracking error (σ) | Speed cap | Return speed | Serve speed | Aim spread | Corner bias | Hit bonus |
|---|---|---|---|---|---|---|---|---|
| Easy | 230 ms | 0.08 m | 1.4 m/s | 3.6 m/s | 3.6 m/s | 0.35 | 15% | 0 |
| Medium | 160 ms | 0.07 m | 1.7 m/s | 4.3 m/s | 4.1 m/s | 0.50 | 40% | 0.02 m |
| Hard | 100 ms | 0.065 m | 2.0 m/s | 5.2 m/s | 4.7 m/s | 0.62 | 70% | 0.03 m |

All three modes are beatable. `tests/rally.test.ts` checks this with a seeded headless rally against a scripted player. Bot returns about 86% (Easy), 95% (Medium) and 98% (Hard) of balls, and the player still wins points in every mode.

### 6.7 Shot power

- **Charge:** hold the paddle and pull it back toward you (mouse or finger). Power is the longest drag down from the highest point of the current hold, divided by 20% of the screen height (96 to 200 px). On a keyboard, holding ↓ or S fills the bar in 0.7 s.
- **Keep or reset:** power only grows until it's spent. Moving forward to reach the ball (finger up, or ↑ / W) and letting go both keep it. It resets after your own hit or serve, and at every point. In a rally one finger sets both the paddle depth and the power, so an earlier version that lowered power on forward moves drained the bar exactly when players stepped in to hit (15 Oct 2026).
- **Effect** (`src/game/shot.ts`):
  - 0% lands just past the net.
  - Depth and speed grow with power.
  - 60 to 80% is the **sweet spot**: least spread and a small speed bonus.
  - From 85%, the chance of the ball going long rises to certain at 100%.
- **Serve preview:** while you serve, a dotted path and a landing ring show where the serve will land at the current power. The ring turns red when the shot may go out. The serve has no hidden random aim, so the preview is honest. Only the depth noise and the out-risk roll apply at contact.
- **Online:** the guest sends its power as `p` (0 to 1) in every `input` message, and the host applies it to the guest's shots. The relay passes it through unchanged.

---

## 7. Controls

### 7.1 Desktop

| Input | Action |
|---|---|
| ← → ↑ ↓ (or A D W S) | Move the paddle left, right, toward the net and back |
| Space | Serve, or play again after the game ends |
| Mouse drag on the paddle | Move the paddle freely (cursor shows `grab` / `grabbing` and the red **You** label). Pulling back charges power |
| Hold ↓ (or S) | Charge power (full in 0.7 s). Power stays until your next hit |
| M | Mute or unmute |
| Esc | Does nothing. The mode can't be changed mid-match. |

### 7.2 Mobile

| Input | Action |
|---|---|
| Touch and drag on the paddle | Moves the paddle directly. Pulling back charges power |
| Touch and drag anywhere else | Moves the paddle relative to the finger (depth uses 0.6× gain) |
| Tap | Serve, or play again |

Implementation notes:
- Pointer Events with `touch-action: none`, tracking a single active `pointerId`.
- The drag is released on `pointercancel`, on `lostpointercapture`, and on a mouse move with no buttons pressed, so a grab never gets stuck.
- The hint text changes with the input type. Keyboard shows `Hold Down for power · Space to serve` (serve) and `Arrow keys to move · Hold Down for power` (rally). Touch shows `Pull back for power · Tap to serve` and `Drag to move · Pull back for power`.
- Taps never select text: the page sets `user-select: none` (inputs excepted), the canvas cancels `touchstart` and `dblclick`, and `selectstart` is blocked outside inputs.
- Audio unlocks on the first gesture (needed on iOS).

---

## 8. Rendering and Art Direction

### 8.1 Palette

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FFFFFF` | Page background |
| `table` | `#0A8CFF` | Table surface |
| `tableEdge` | `#0070D6` | Table front thickness |
| `net` | `rgba(140, 203, 255, 0.6)` | Net band |
| `ink` | `#111111` | Outlines, net posts, numerals |
| `paddleRed` | `#D23B3B` | Player paddle, and the score tint when You score |
| `paddleBlue` | `#3F78BE` | Bot's paddle, and the score tint when Bot scores |
| `bubble` | `#F23B3B` | Speech bubble, the "You" label, and point messages |
| `shadow` | `rgba(10, 79, 153, 0.45)` | Shadows on the table |
| floor shadow | `#6b7280` | Ball shadow on the ground |
| `muted` | `#8A8A8A` | Labels, caption, score dot |

### 8.2 Typography

Everything uses **SF Cartoonist Hand**. A type scale in CSS gives clear hierarchy:

| Variable | Size | Used for |
|---|---|---|
| `--t-title` | 56 px | Modal titles ("Table Tennis", "You win!") |
| `--t-heading` | 28 px | Final score, headings |
| `--t-body` | 21 px | Subtitles, buttons |
| `--t-label` | 17 px | Footer links, chips |
| `--t-caption` | 15 px | Hints and the info badge |

The canvas text (scoreboard, bubble, caption) uses the same family.

### 8.3 Draw order (back to front)

1. Background and scoreboard
2. Bot and its speech bubble
3. Bot's paddle and shadow
4. Ball, if it has dropped behind the far end of the table (so the table hides it)
5. Table surface, lines and front edge
6. Ball shadow, then the ball if it's on the far side of the net
7. Net
8. Player paddle shadow, then the player paddle at 80% opacity
9. Ball if it's on the near side of the net, always in front of the player paddle
10. The red **You** tooltip (mouse only)
11. Caption, then the HTML footer pill

### 8.4 Animations

| Element | Animation |
|---|---|
| Score numeral | When a point is scored, the number scales in with a pop, is briefly tinted **red (You)** or **blue (Bot)** so it's clear who scored, then fades back to black |
| "+1" | A white "+1" with a dark outline slides up from the scorer's number and fades out |
| Speech bubble | Pops in with overshoot, holds about 0.9 s, fades out over 0.3 s |
| Bot's head | Slides toward the ball, bobs gently, and swaps expressions |
| Paddles | Tilt with velocity |
| Ball | A tapered motion-blur streak behind it when it moves fast. After a point, it falls, bounces on the ground and rolls to a stop. |
| Net | Shimmers briefly when the ball hits it |
| Screen | A small shake when the player hits (off with reduced motion) |

### 8.5 Speech bubble lines

- Player returns the ball (sometimes): `Hey!`, `Whoa!`
- Player scores: `Hey!`, `Ouch!`, `Nice!`
- Bot faults (out, net, fault): `Oops!`
- Bot scores: `Ha!`, `Gotcha!`

### 8.6 Net design

Redesigned to match the reference: a translucent light-blue band with a thick black top cord, a thinner bottom line, and slim black posts that rise slightly above the cord and extend down below the table edge. There's no mesh pattern.

---

## 9. HUD, Overlays, Copy and Footer

### 9.1 Scoreboard
- `[You] · [Bot]`, big and bold: numerals are 124 px (portrait) and 112 px (landscape) on the design frame.
- Portrait puts each name under its numeral with a clear 16 px+ gap. Landscape has no height to spare above Bot's head, so names sit outside the numerals on the same line: `You 0 · 0 Bot`.
- The numbers are positioned from their measured widths so they stay centered around the dot.

### 9.2 Caption and point messages
- Under the table, a grey hint shows serve and move instructions, or "Bot to serve".
- When a point ends, the result shows in **red, in the footer font**: `Bot missed`, `Missed!`, `Net!`, `Out!`, `Double bounce` or `Fault`.

### 9.3 Start screen
- A **crossed red and blue bats** icon at the top (no ball).
- Title: **Table Tennis**. Subtitle: *You vs Bot · first to 11, win by 2*.
- Three buttons: **Easy**, **Medium**, **Hard** (names only, no subheadings).
- A blue **info badge** with an info icon and the controls hint.

### 9.4 In-game controls (top corner)
- A static chip shows the current mode. It isn't clickable, because the mode is locked for the match.
- A mute button. The mute setting is saved in `localStorage` under `tt-muted`.

### 9.5 Game-over modal
- Title (`You win!` or `Bot wins`) and the final score.
- Two full-width buttons, stacked: **Play again** (same mode, primary) above **Change difficulty** (back to the start screen).
- Tapping outside the buttons, or pressing Space, also plays again.

### 9.6 Footer pill
`Instagram │ X │ LinkedIn`, linking to:
- Instagram: https://www.instagram.com/girishedge_/
- X: https://x.com/_girishedge_?s=11
- LinkedIn: https://www.linkedin.com/in/girish-shedge-9337571b8/

> **Originality note:** The character, its name (Bot) and the branding are original. The frames were only a reference for layout, motion and feel.

---

## 10. Audio

Synthesized sounds through one `AudioContext` with a master gain. **Sound is on by default.** Press `M` or the speaker button to mute.

| Event | Sound |
|---|---|
| Serve and paddle hit | A short, bright "tok" |
| Table bounce | A softer "tick" |
| Net touch | A dull thud |
| Point won | A rising two-note chime |
| Point lost | A falling two-note tone |
| Match won or lost | A longer win or lose jingle |

The context starts only after the first user gesture.

---

## 11. Responsive and Accessibility Checklist

- [x] Canvas scales to fit any viewport, and the page never scrolls.
- [x] Portrait and landscape layouts.
- [x] Single-pointer touch handling with a relative drag mode.
- [x] The footer pill respects the safe-area inset.
- [x] Orientation change keeps the game state and recomputes the layout.
- [x] `devicePixelRatio` scaling on resize.
- [x] The loop pauses when the tab is hidden and resumes without a time jump.
- [x] `prefers-reduced-motion` turns off screen shake and the ball's motion streak.

---

## 12. Build History and Updates

### v1.0 — First release (commit `fd19fdd`)
Built from the spec and the reference frames, with these choices:
- Vite and TypeScript in the workspace root.
- A difficulty selector on the start screen (Easy, Medium, Hard).
- First to 11, win by 2.
- One original opponent character, **Bot**.
- Full 2D touch drag on mobile (left, right and depth).
- Sound on by default.
- The old `project.md` was deleted.

Footer and score update:
- Removed the placeholder email from the footer.
- Added Girish's Instagram, X and LinkedIn links.
- Made the score big and bold, and moved it slightly up.

Published:
- Pushed to GitHub as the public repo `table-tennis`, without the reference frames.
- Hosted on Vercel.

### v1.1 — Font and type hierarchy (commit `3f0800a`)
- Switched every piece of text to **SF Cartoonist Hand**, self-hosted from `public/fonts/`.
- Added a CSS type scale (title, heading, body, label, caption) for a clear text hierarchy.

### v1.2 — UI and gameplay polish (commit `c0c32c6`)
1. The game-over buttons **Play again** and **Change difficulty** are now the same width.
2. Start screen changes:
   - removed the subheadings under Easy, Medium and Hard;
   - the icon is now a red and a blue bat crossed in an X, without the ball;
   - the controls hint is an info badge with an info icon.
3. Hovering over your paddle shows **You** instead of "Grab".
4. Point messages (`Bot missed`, `Missed!`, `Net!`, etc.) are red and use the footer font.
5. The difficulty can't be changed once a match has started.
6. After a point, the ball falls to the ground, bounces and rolls to a stop.
7. A motion-blur streak trails the ball when it moves fast.
8. The ball is always drawn in front of your paddle, and your paddle is slightly transparent.
9. The net was redesigned to match the reference.
10. When someone scores:
    - a white **+1** slides up and fades out;
    - the score scales in and briefly turns **red (You)** or **blue (Bot)**.

### Domain update
- Added the custom address **[tabel-tennis.vercel.app](https://tabel-tennis.vercel.app)**. `table-tennis.vercel.app` was already taken by another Vercel account.

### v2.0 — Online multiplayer (commit `2a5efb0`, 14 Oct 2026)
Built on branch `multiplayer` and merged into `main`. Full spec, task list and known gaps live in Part 2 of this document.
- Host a room and share a link or a 4-letter code; a friend joins on desktop or phone with no sign-up.
- The host's browser runs the match; a Cloudflare Worker relay (`server/`) forwards messages between the two players.
- Each player sees themselves at the near end with the red paddle and the friend's name on the scoreboard.
- Reconnect, rematch, leave, emotes and message screens for every failure case.
- Start screen gains an "or play a friend" divider, **Host a game** and **Join with code** buttons, and an editable name line. They are hidden when no relay is configured, so vs-Bot looks exactly as before.
- The paddle code was refactored into controllers. A seeded vs-Bot simulation (golden test) proves vs-Bot plays exactly as before.
- Design pass: all MP screens use the existing font, type scale, palette and components. Keyboard focus ring, screen-reader announcements and reduced motion were checked.

### v2.1 — Power, Bot and polish (15 Oct 2026)
Built on `multiplayer` and fast-forward merged into `main`. Details in §30.4.
- **Shot power:** pull the paddle back (or hold Down) to charge. A gradient power bar replaces the profile bar in every match, and from 85% the ball may go out.
- **Serve preview:** a dotted path and landing ring show where your serve will land.
- **Bot keeps rallies going:** no deliberate misses, retuned tracking, and a new rally simulation test.
- **UI:** bigger scoreboard; 48 px buttons with 18 px text and a press-and-spring tap effect; stacked two-button modals; Host lobby laid out like Join; Back home replaces Play vs Bot; Leave is a secondary button; 8 px spacing grid.
- **Fixes:** text selection on phone taps, the frozen loader ball with Reduce Motion, the palm on the red paddle, and "null left the game".

### v2.2 — Friend dialog, signal strength, rally power fix (15 Oct 2026)
Built on `multiplayer` and fast-forward merged into `main`. Details in §6.7, §20.2 and §30.4.
- **Rally power holds:** charged power stays until your hit, so moving forward to the ball no longer drains it; ↑ no longer empties the bar.
- **Home page:** You vs Bot, then "or", then **Play with a friend**, which opens a dialog with Host a game (paddle with a + badge) and Join with code (key). Below it, **Signal strength: Good / Okay / Weak / Offline** (text only), timed against the relay.
- **Names:** 1 to 12 characters with a live counter; longer saved names are shortened on load.

---

## 13. Acceptance Criteria

- [x] The first frame resembles the reference: white page, blue perspective table, translucent net, red and blue paddles, a floating character, scoreboard, caption and footer pill.
- [x] A full game to 11 can be played start to finish on desktop and on a phone.
- [x] Ball size, paddle size and shadows scale with depth.
- [x] The paddle tilts with movement, and the character reacts with expressions and speech bubbles.
- [x] No page scroll or zoom during play.
- [x] No external image assets: everything is drawn in code. The bundle is about 12.7 KB gzipped.

---

## 14. Tunable Constants (`src/config.ts`)

Key values (see the file for the full list):

```ts
export const CONFIG = {
  winScore: 11,
  winBy: 2,
  opponentName: "Bot",
  playerName: "You",

  gravity: 9.8,
  restitution: 0.85,
  tableW: 1.525,
  tableL: 2.74,
  netHeight: 0.1525,
  floorY: -0.76,

  paddleSmooth: 0.07,      // seconds
  paddleZMin: 0.3,
  paddleZMax: 1.2,
  playerShotSpeed: 5.0,

  aiPaddleHitR: 0.09,      // plus the difficulty's hitBonus
  aiDistanceError: 0.1,    // extra tracking error per meter traveled

  bubbleHoldMs: 900,
  pointFreezeMs: 1600,

  footer: {
    instagram: "https://www.instagram.com/girishedge_/",
    x: "https://x.com/_girishedge_?s=11",
    linkedin: "https://www.linkedin.com/in/girish-shedge-9337571b8/",
  },

  difficulty: { easy: { ... }, medium: { ... }, hard: { ... } }, // see §6.6
};
```

---

## 15. Decisions (formerly Open Questions)

| Question | Decision |
|---|---|
| Target score | First to 11, win by 2 |
| Should the paddle move in depth on mobile? | Yes. Full 2D drag. |
| Difficulty selector or adaptive mode? | A selector on the start screen (Easy, Medium, Hard), locked for the match, with a light rubber-band effect inside each mode |
| Own character or several opponents? | One original character, Bot |
| Sound on or muted by default? | On by default, and the mute choice is remembered |

## 16. Ideas for Later

- Local two-player on one device. (Online play shipped in v2.0, see Part 2.)
- More opponents with different personalities and play styles.
- Match statistics (longest rally, points won on serve).
- A share card with the final score.

---

# Part 2 — Online Multiplayer

Host a game and share a link or a 4-letter code. A friend joins on desktop or phone. You play the same hand-drawn table tennis game, head to head.

Part 1 describes the game and vs-Bot mode. Part 2 covers everything online: rooms, lobby, join flows, network, the relay server and multiplayer-only behavior. Where the two overlap (start screen, top-corner controls, game states, hotkeys), Part 2 lists the **"MP addition"** items: in multiplayer they apply, and in vs-Bot Part 1 is unchanged. Whenever code changes behavior, update the matching section here.

Part 2 started as a separate PRD written before the source code was seen, so a few internal names were proposals. Task F-0 surveyed the real code and §22.4 records how it maps.

---

## 17. Summary

### 17.1 Problem and goal

Before v2.0 the game was single-player only. Playing against a real friend was the most natural next step.

**Goal:** a friend can be playing within about 20 seconds of you tapping Host: no accounts, no installs, any device combination.

### 17.2 Non-goals (v2.0)

- Matchmaking with strangers, accounts, rankings or persistent stats.
- More than two players, or spectators.
- Voice or text chat (quick emotes only).
- A paid server. The goal is to run on free tiers.

### 17.3 Success looks like

- A host-and-join match can be completed end to end on two phones over mobile data.
- The game feels responsive up to about 150 ms round-trip latency.
- Single-player is untouched, and still works if the online service is down.

---

## 18. Reconciliation: What Changed From My Earlier Drafts

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
| 19 | Bubbles for reactions | In MP the character's face still reacts, but **auto speech bubbles are off**. The speech bubble is reserved for the friend's emotes (see §20.7) |
| 20 | Small extras were free | The bundle budget is unchanged: stay **under 150 KB gzipped** (now about 12.7 KB). No new client libraries. Native `WebSocket` only |

---

## 19. Product Requirements

### 19.1 Functional requirements

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
- **FR-21** Every failure has a friendly screen with a next step (see §20.5).
- **FR-22** **vs-Bot mode is unaffected**, and works even if the relay is down or not configured.

### 19.2 Non-functional requirements

| | |
|---|---|
| **Responsiveness** | Playable up to about 150 ms round trip. Your own paddle feels instant at any latency |
| **Frame rate** | 60 fps on a mid-range phone |
| **Bundle** | Under 150 KB gzipped, no new client libraries |
| **Privacy** | No accounts, no analytics, no personal data stored. Rooms are deleted when finished (Y-16) |
| **Cost** | Free tiers only (see §22.9) |
| **Browsers** | iOS Safari 15+, Android Chrome (last 2 versions), desktop Chrome, Edge, Firefox, Safari (latest) (Y-14) |
| **Accessibility** | Matches the existing checklist in §11, plus the additions in §26 |

---

## 20. UX

### 20.1 Principles

1. **One obvious next step on every screen.**
2. **Reuse the look you already have:** the existing button, modal, chip, info badge and footer pill styles. Add new components only where nothing exists.
3. **Never lose a room or a score to something harmless**, like switching apps to paste a link.
4. **Say what happened and what to do next**, in plain words.

### 20.2 Start screen changes (MP addition)

Keep everything that exists: the crossed-bats icon, the title **Table Tennis**, the subtitle, the **Easy / Medium / Hard** buttons and the info badge. Add under the difficulty buttons:

- A quiet divider: "or play a friend".
- Two buttons: **Host a game** and **Join with code**.
- A small line: "Playing as **Girish** ✎" (tap to edit). First launch shows a friendly default name like "Player 482". Saving uses `localStorage` and never errors if storage is blocked (E-33).
- If the relay isn't configured or reachable, the two MP buttons are hidden (E-50). vs-Bot is untouched.

*Current layout (15 Oct 2026):* **You vs Bot** (primary), a divider reading "or", then one white **Play with a friend** button. It opens a **Play with a friend** dialog with two option cards, **Host a game** (red paddle with a blue + badge) and **Join with code** (blue key), plus Cancel. Choosing one closes the dialog and starts the usual host or join flow (S02 or S05). Esc, Cancel or a tap outside closes it. The whole friend entry is still hidden without a relay (E-50). The name now lives in the **My player** button (§30.2).

Under Play with a friend, a small line reads **Signal strength: Good / Okay / Weak, online play may lag / Offline**, as text only: the word is green for Good and red for Weak or Offline (`src/ui/netStatus.ts`). It times a `GET /` to the relay: the Worker answers that itself, with no room and no rate limit. The first request after loading (DNS and TLS) is thrown away, then the median of the last three samples is used, with the chip's bands: under 200 ms Good, up to 450 ms Okay, above that Weak. No answer within 3 s, or the browser being offline, shows Offline. It only measures while the home page is on screen: once on load, then one request every 30 s, and again when the tab or the home page comes back. Hovering the line shows the time in ms.

### 20.3 Top-corner controls in a match (MP addition)

Single-player shows a static mode chip and a mute button. In multiplayer:

| Control | Behavior |
|---|---|
| Mode chip | **Hidden** (there is no difficulty) |
| **Connection chip** | A small bars icon plus ping text on tap or hover. 3 bars under 120 ms, 2 bars up to 250 ms, 1 bar above that, in `ink`. Above 250 ms for 5 s it turns `bubble` red and a toast says "Weak connection" |
| Mute button | Unchanged (the choice is saved as `tt-muted`) |
| **Leave button (×)** | New. 44 px target. Opens the Leave dialog (S13) |

### 20.4 Screen inventory

| ID | Screen | Notes |
|---|---|---|
| S01 | **Start screen** | Extended as in §20.2 (this is the existing `MENU` state) |
| S01b | **Play with a friend** | Dialog from the home page: Host a game / Join with code option cards, Cancel |
| S02 | **Creating room** | A spinner. After 5 s: "Taking longer than usual…" with Retry |
| S03 | **Host lobby** | Laid out like Join: heading "Host a game", the expiry countdown as the subheading, the four code tiles, then **Share invite** (primary) and Cancel |
| S04 | **Host lobby, friend joined** | "Ravi joined", **Start game** (primary), Leave room |
| S05 | **Join with code** | Four boxes, auto-uppercase, auto-advance, paste fills all four, submits on the 4th letter |
| S06 | **Invite screen** | "Girish invited you to play", name field (prefilled), **Join game**. Shown only if no name is saved |
| S07 | **Guest lobby** | "Joined. Waiting for Girish to start…", Leave |
| S08 | **Countdown** | 3, 2, 1, Go (large type in the existing title size, with tok-style beeps) |
| S09 | **Match** | The game, plus the top-corner controls in §20.3 and an emote button |
| S10 | **Reconnect overlay** | "Ravi lost connection. Waiting 12 s…", and for the dropped player "Reconnecting…" |
| S11 | **Result modal** | Same modal as game-over: "You win!" or "Ravi wins", final score, **Rematch** and **Leave** |
| S12 | **Rematch pending** | "Waiting for Ravi…" or "Girish wants a rematch" with Accept and Leave |
| S13 | **Leave dialog** | "Leave match? Your friend will win." **Keep playing** (primary, top) / Leave (white secondary, below) |
| S14 | **Message screens** | See §20.5 |

### 20.5 Message screens (copy)

Each has one primary button, plus a white **Back home** button below it (left out when the primary is already Back home). Back home closes the session and returns to the home page.

| Situation | Title | Body | Primary |
|---|---|---|---|
| Room not found | "We can't find that room" | "Check the code, or ask your friend for a new link." | Try another code |
| Room expired | "This room has expired" | "Rooms close after 2 minutes if nobody joins." | Host your own |
| Match already started | "That match already started" | "Ask your friend to host a new game." | Host your own |
| Room ended | "This game has ended" | "Ask your friend for a new link." | Host your own |
| Host's own room expired | "Room expired" | "Nobody joined in time." | Create new room |
| Friend left | "{Name} left the game" | "You win by forfeit." (mid-match only) | Back home |
| Host ended the game | "{Name} ended the game" | "Ask for a new link to play again." | Back home |
| Server unreachable | "Can't reach the game server" | "Check your connection, or play Bot." | Retry |
| Update needed | "A new version is available" | "Refresh to keep playing." | Refresh |
| Free limit reached | "Online play is resting" | "It will be back soon. You can still play Bot." | Back home |
| Duplicate tab | "Game is open in another tab" | "Use the other tab, or play here instead." | Play here |

### 20.6 Flows

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

### 20.7 In-match behavior (MP addition)

- **Serve cue:** on your serve the caption reads `Arrow keys to move · Space to serve` (keyboard) or `Drag to move · Tap to serve` (touch), exactly as today, and a ring shows the 10-second timer. When the friend serves, the caption reads "**{Name} to serve**" (as "Bot to serve" does today).
- **Caption results** (red, footer font, from §9.2), viewer-relative:
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

## 21. Game Rules in Multiplayer

Everything in §6 applies unchanged, except:

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

## 22. Technical Design

### 22.1 Architecture decision

A **WebSocket relay** (a small server that forwards messages inside a "room") with a **host-authoritative simulation**.

- The **host's browser runs the physics** and is the referee. Its ball and score are the truth.
- The **guest sends its paddle position** and draws the host's **snapshots**.
- The server never runs game logic. It manages rooms and forwards messages.

Why this and not WebRTC: the relay works on virtually every network. WebRTC is a direct line, which is faster, but some networks block it and then need a paid relay (TURN). The relay costs roughly 20–60 ms of extra delay, which is fine between friends. The transport is hidden behind a small interface (`Transport.send / onMessage / close`), so WebRTC can be added later without touching game code.

### 22.2 Hosting topology

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

### 22.3 How the relay works (simple version)

A room is like a meeting room named by its code. The server keeps track of who is inside, when it expires and the last saved score, and passes each person's messages to the other. Because the server may be put to sleep between messages, **everything it needs to remember is saved to storage, never kept only in memory.**

### 22.4 Integrating with the existing game

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

### 22.5 Rooms (server side)

**Room states:** `WAITING` (host only, 2-minute alarm), `LOBBY_FULL`, `COUNTDOWN`, `PLAYING`, `PAUSED`, `ENDED`, `EXPIRED`.

**Code:** 4 letters from `ABCDEFGHJKMNPQRSTUVWXYZ` (23 letters), case-insensitive, regenerated on collision. 279,841 possible codes, with rooms living for minutes and lookups rate-limited, so guessing is impractical.

**Timers** (all server alarms):
- Join window: 2 minutes from creation. Stops when a friend joins and **restarts fresh** if that friend leaves before the match starts.
- Both players present but nobody pressing Start: closes after 5 minutes.
- Reconnect window: 15 seconds, or 30 seconds if both dropped.

### 22.6 HTTP API and WebSocket protocol

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
| `input {seq, ts, x, z, p}` | guest → host | Paddle target in host coordinates (tilt is derived locally), plus shot power `p` (0 to 1, clamped by the host) |
| `state {tick, phase, ball, hp, gp, score, server, serveMs}` | host → guest | Snapshot (about 30 per second) |
| `state_sync {...}` | host → guest | Full state after a reconnect |
| `event {kind, who, reason?}` | host → guest | `hit`, `bounce`, `net`, `point` (with `winner` and `reason`: missed, net, out, double, fault) |
| `checkpoint {score, server}` | host → server | Saved after every point (for E-14) |
| `match_over {score}` | host → server | Ends the room |
| `emote {id}` | both ways | Quick phrase |
| `rematch_request` / `rematch_accept` | both ways | Rematch |
| `leave` | client → server | Leaving on purpose |
| `ping` / `pong` | both ways | Heartbeat (auto-response, free of wake-up cost) |

### 22.7 Timing and smoothing

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
| During POINT | Snapshots keep flowing so the falling, bouncing and rolling ball (§6.3) looks the same on both screens |

### 22.8 Recovery and security

**Recovery**
- Guest drop: the host pauses, the guest reconnects with its token and receives `state_sync`.
- Host page reload or crash: the server hands the host the last `checkpoint` (score and server), and the host starts a **fresh serve** from there (the rally in flight is lost).
- Tokens live in `sessionStorage` (`tt-session`: code, playerId, token, role), so a reload or a restored mobile tab can resume.
- Reconnect uses backoff of 1 s, 2 s, 4 s, then 5 s until the window ends.

**Security and privacy**
- `wss://` only. The Worker checks the `Origin` header against an allowlist from the `ALLOWED_ORIGINS` environment variable. It must include `https://tabel-tennis.vercel.app`, `https://table-tennis-alpha-jet.vercel.app`, the Vercel preview URLs for this repo, and `http://localhost:5173` for development.
- Max 2 players per room, 2 KB message cap, per-socket message rate limit, per-IP limits on creating rooms (about 5 a minute) and looking up codes (about 20 a minute).
- The host clamps all guest input to table bounds and a maximum speed.
- Names: trim, 1–12 characters (16 before 15 Oct 2026), strip control characters, optional small blocklist (Y-13), shown with `textContent` only (never `innerHTML`).
- No accounts, no analytics, no personal data stored. **The repo is public, so no secrets are ever committed.** Ignore `.dev.vars` and `.wrangler/`. The only credential is your Cloudflare login, done through `wrangler login`.

### 22.9 Cost (free tier)

WebSockets themselves are free. Cloudflare's free plan (verified from its docs) allows **100,000 Durable Object requests a day**, where each 20 incoming WebSocket messages count as 1 request and outgoing messages are free. The free plan requires SQLite-backed Durable Objects, and the Hibernation API is recommended so idle connections cost nothing.

**Estimate (not an official figure):** a match sends at most about 90 incoming messages a second through the relay. That is roughly 2,700 requests per 10-minute match, or **about 35–40 ten-minute matches a day** in the worst case. That is plenty for you and your friends. If the daily limit is hit, operations fail until it resets at 00:00 UTC (5:30 AM IST), and the game shows "Online play is resting" while vs-Bot keeps working (E-44). If needed, lowering snapshots to 20 per second stretches the limit. Check Cloudflare's current limits before launch.

### 22.10 Configuration (`src/config.ts`, new `NET` block)

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

  maxNameLength: 12,
  labelMaxChars: 10,
};
```

Values used by the server (timers, limits, alphabet, protocol version) also live in `shared/constants.ts`, so client and server can't drift apart.

### 22.11 New and changed files (matching your project tree)

```
./
├─ design.html             # dev-only component sheet (/design.html), not in the production build
├─ playwright.config.ts    # two-client end-to-end test setup (expects Vite on :5173 and the relay on :8787)
├─ .env.development        # VITE_RELAY_URL=http://127.0.0.1:8787 for local dev
├─ scripts/
│  ├─ design-shots.mjs     # npm run qa:shots -- <tag>: every MP screen at 360, 768, 1280 and phone landscape
│  └─ a11y-check.mjs       # npm run qa:a11y: touch targets, focus ring, reduced motion, aria-live
├─ tests/
│  ├─ session.test.ts      # session state machine
│  ├─ net.test.ts          # mirror, interpolation, codes, clamping
│  ├─ bot-golden.test.ts   # seeded vs-Bot simulation must match a fixed hash
│  ├─ bot-sim.ts           # headless sim used by the golden test
│  └─ e2e/match.spec.ts    # two browser contexts: host, join, play to 11, rematch, leave, invite link
├─ shared/
│  ├─ protocol.ts          # message types and validators (client + server)
│  ├─ constants.ts         # timers, limits, alphabet, protocol version
│  └─ names.ts             # name sanitizing and the small blocklist
├─ server/                 # Cloudflare Worker (own package.json, tsconfig, wrangler.toml)
│  ├─ src/index.ts         # routing, WebSocket upgrade
│  ├─ src/http.ts          # CORS, origin allowlist, JSON helpers
│  ├─ src/env.ts           # Worker bindings and vars
│  ├─ src/room.ts          # Room Durable Object: state, alarms, tokens, forwarding, checkpoint
│  ├─ src/gate.ts          # Gate Durable Object: per-IP rate limits
│  └─ test/                # scripted clients: echo, rooms, lifecycle, limits, relay, chaos
└─ src/
   ├─ strings.ts           # all MP text in one place (§20.5, §20.7)
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
      ├─ screens/index.ts  # S01 additions to S14 (HTML overlays, like the existing ones)
      ├─ mp.css            # styles for MP-only components
      ├─ conn.ts           # connection chip: bars, rounded ping, weak warning, aria-label
      ├─ toast.ts          # toast messages
      └─ design.ts         # dev-only component sheet script (design.html)
```

The server folder has its own tsconfig so your existing `npm run build` (type-check and build) and the Vercel build are not affected. Add a build step for the Worker separately, and only deploy it with `wrangler`.

---

## 23. Edge Cases and Solutions

IDs are used by the tests and the sweep in §24.5.

### 23.1 Room lifecycle

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

### 23.2 Connection and recovery

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

### 23.3 Gameplay

| ID | Situation | Solution |
|---|---|---|
| E-24 | Both press serve at once | Only the designated server's serve counts |
| E-25 | Score disagreement | Impossible by design. The guest only displays the host's score |
| E-26 | Net, bounce and paddle in the same tick | The host resolves events in a fixed order (bounce, net, paddle) and emits one `event` per outcome |
| E-27 | A modified client sends impossible paddle input | The host clamps position and speed |
| E-28 | A player leaves mid-match | The other sees "{Name} left the game. You win by forfeit" (pending Y-9) |
| E-29 | Deuce goes on forever | No cap, the match continues (win by 2) |

### 23.4 Device and browser

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

### 23.5 Abuse, limits and updates

| ID | Situation | Solution |
|---|---|---|
| E-41 | Guessing room codes | 279,841 codes, rooms live minutes, per-IP lookup limit (about 20 a minute) |
| E-42 | Spamming room creation | Per-IP limit (about 5 a minute) and a global cap on open rooms |
| E-43 | Message flooding or giant messages | Per-socket rate limit and 2 KB cap, then the socket is closed |
| E-44 | The free daily limit is reached | "Online play is resting". Resets at 00:00 UTC (5:30 AM IST). vs-Bot always works |
| E-45 | Player has an old cached version | The `v` field triggers "A new version is available" |
| E-46 | Offensive or empty names | Trim, 1–12 characters, strip control characters, optional blocklist. `textContent` only |
| E-47 | Two players with the same name | The guest becomes "Name (2)" |
| E-48 | Typing characters that aren't in codes | A gentle hint: "Codes use letters only (no I, L or O)" |

### 23.6 Added after reading your real project

| ID | Situation | Solution |
|---|---|---|
| E-49 | The **guest** hides the game or locks the phone mid-match (their loop pauses, but the host's wouldn't) | The guest sends `away` first. The host pauses everyone ("{Name} stepped away…") for up to 15 s. On `back` it resumes with a 2-second countdown. If they don't return, forfeit (pending Y-9) |
| E-50 | `VITE_RELAY_URL` isn't set (e.g. a preview deploy without the variable) | Host and Join are hidden on the start screen. vs-Bot is unaffected |
| E-51 | The link is opened on the other Vercel address (`table-tennis-alpha-jet`) | The invite link is built from the current site address, and both addresses are in the origin allowlist |
| E-52 | A friend's name is very long or very wide | Scoreboard labels truncate to 10 characters with "…". Lobbies show the full name |
| E-53 | An accidental tap or Space press on the result modal | Ignored in MP. Only the Rematch and Leave buttons act |
| E-54 | Unfinished multiplayer work reaches production | Work only on branch `multiplayer`. Merge to `main` only after §24.5 passes, because every push to `main` deploys live |

---

## 24. Build Plan

### 24.1 Branch and deploy strategy

- `main` auto-deploys to production, so **all work goes on branch `multiplayer`**. Vercel makes a preview URL for each push, so you can test there.
- Set `VITE_RELAY_URL` in Vercel for **Preview** and **Production** (⚠️ Y-3). Without it the MP buttons stay hidden (E-50).
- Merge to `main` only when the QA gate in §24.5 is green.
- *Update 14 Oct 2026:* `multiplayer` was merged into `main` at Girish's request before S-1 and S-2, so the device test happens on production. `VITE_RELAY_URL` is currently set for **Production** only. For new work, branch from `main` again and add the preview variable if you want MP on preview URLs. Preview URLs are also not in the Worker's `ALLOWED_ORIGINS`, so add them there (in `server/wrangler.toml`, then redeploy) to test MP on a preview.
- *Update 15 Oct 2026:* v2.1 was shipped the same way: committed on `multiplayer`, then `main` was fast-forwarded to it and pushed. The relay did not change, so no `wrangler deploy` was needed. v2.2 shipped the same way. Its shared name limit (12) only reaches the relay at its next `wrangler deploy`; until then the relay accepts up to 16, which is harmless.

### 24.2 Prompt template for every Cursor chat

> Read `project.md`. Task: **{ID}**. Only change the files listed for this task. Don't change vs-Bot behavior. Keep `npm run build` passing and the bundle under 150 KB gzipped. When done, tell me which "Done when" items you verified and how.

Rules for every chat: one task per chat, commit after each task passes its "Done when", paste real errors and test output back instead of describing them, and for visual work attach a screenshot of the current screen next to the reference frames.

### 24.3 Progress tracker

| Track | Tasks | Status |
|---|---|---|
| Day 1 | F-0, B-1 to B-6, F-1 to F-7, T-1 to T-3 | ☑ Done (B-6 deployed by Girish) |
| Day 2 | D2-1 to D2-7 | ☑ Done |
| Both | S-1 to S-3 | ◐ Merged and deployed; device test and edge-case sweep open |

"Day" means a work block (roughly a full working day each), not a promise. Netcode debugging is the main uncertainty. **Day 2 needs Day 1's screens**, except D2-1, which can start in parallel.

> Grok writes the netcode. Netcode bugs are subtle, so judge it by the automated two-client test (T-1) and the edge-case sweep (§24.5), not by eye.

---

### DAY 1 — Frontend + Backend (Grok)

**Goal:** a fully working multiplayer mode: rooms, join by link or code, matches, reconnects. Screens use your **existing classes** (buttons, modal, chip, info badge, footer) wherever they exist, plain markup elsewhere, and `data-testid` on every control, so Day 2 can style without touching logic.

- [x] **F-0 Code survey (no code changes).** Read the repo and report how the loop, world state, `input.ts`, `ai.ts`, `main.ts`, overlays and HTML are actually structured, mapping every proposal in §22.4 to the real code. Update §22.4 in this document if reality differs.
  - **Done when:** a short written map exists and any mismatch with this document is listed.

**Backend**

- [x] **B-1 Scaffold the Worker.** `server/` with a Worker, a SQLite-backed `Room` Durable Object (Hibernation API), `wrangler.toml` and dev scripts. Add `.dev.vars` and `.wrangler/` to `.gitignore`.
  - **Done when:** `wrangler dev` runs and a test WebSocket connects and echoes.
- [x] **B-2 Rooms API.** `POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:code/join`, `POST /api/rooms/:code/extend`, WebSocket upgrade, 4-letter code with collision retry, CORS and `Origin` allowlist (`ALLOWED_ORIGINS`).
  - **Done when:** create, preview and join work from a script, a third joiner is rejected (E-5), and a disallowed origin is refused.
- [x] **B-3 Room state machine.** States and alarms from §22.5, host-away tolerance (E-1), restart of the window when a guest leaves (E-3), `checkpoint` storage (E-14), all state in Durable Object storage.
  - **Done when:** every row in §23.1 and §23.2 that involves the server behaves as written, using scripted clients.
- [x] **B-4 Validation and limits.** `v` check (E-45), message size and rate limits (E-43), per-IP limits (E-41, E-42), name rules (E-46, E-47).
  - **Done when:** oversized, malformed, flooding and wrong-version clients are rejected without crashing a room.
- [x] **B-5 Heartbeat and relay.** Use `setWebSocketAutoResponse` for ping and pong, forward gameplay messages unchanged, and detect dead sockets within 6 s (E-21).
  - **Done when:** a killed client is detected and the peer is told within 6 s.
- [x] **B-6 Deploy** (needs Y-1). Deploy the Worker, set `VITE_RELAY_URL` and `ALLOWED_ORIGINS`, and use `wss://` only.
  - **Done when:** a preview deploy on Vercel can host and join a room across two networks.

**Frontend logic**

- [x] **F-1 Paddle controllers.** `controllers.ts` with `LocalInput`, `AIController` and `RemoteInput`. vs-Bot must not change.
  - **Done when:** a **seeded headless simulation** gives identical results before and after (reuse your existing headless approach), and vs-Bot plays the same by hand.
- [x] **F-2 Transport, API, session.** `transport.ts`, `api.ts`, `session.ts`, `profile.ts` (safe storage, E-33) and the session state machine for S01 to S14, including duplicate tabs (E-22) and `tt-session` in `sessionStorage`.
  - **Done when:** the session machine passes unit tests for every screen transition in §20.6.
- [x] **F-3 Screens S01 to S14.** HTML overlays like the existing ones, microcopy only from `src/strings.ts`, history entries for Back, Share and clipboard fallbacks (E-30 to E-32), code-box behavior (E-48), the MP buttons on the start screen (§20.2) hidden when no relay is configured (E-50).
  - **Done when:** the whole flow in §20.6 can be clicked through without console errors, and the start screen is unchanged when `VITE_RELAY_URL` is empty.
- [x] **F-4 Host simulation and guest view.** `hostSim.ts`, `guestView.ts`, `mirror.ts`, `clock.ts`. Human hit radius 0.17 m for both paddles, `solveShot` for both, and the guest's hit forgiveness (§22.7).
  - **Done when:** a full match plays between two windows and each player sees themselves at the near end with the red paddle and correct names and score.
- [x] **F-5 Events and match behavior.** Events drive sounds, shake (own hits only), net shimmer, +1 and the point caption (viewer-relative, §20.7). Serve timer (E-18). Character expressions mapped by viewer. Auto bubbles off. Emote messages, forfeit and leave logic (E-28).
  - **Done when:** each behavior in §20.7 works in a two-window test.
- [x] **F-6 Resilience.** Visibility handling for both players (E-12, E-49), wake lock (E-34), reconnect with backoff (E-16), `state_sync`, checkpoint restore (E-14), latency policy (E-19, E-20), low-fps warning (E-23).
  - **Done when:** every row in §23.2 passes its check.
- [x] **F-7 Result, rematch, leave.** S11 to S13 logic, a 30-second rematch timeout, and E-53.
  - **Done when:** rematch keeps sides, leaving notifies the friend, and an accidental tap does nothing.

**Tests**

- [x] **T-1 Two-client end-to-end** (Playwright, two browser contexts against `wrangler dev`): host, join by code, join by link, play to 11, rematch, leave.
- [x] **T-2 Chaos script:** drop and restore one client, add latency, reload the host mid-match. Covers E-11 to E-19.
- [x] **T-3 Unit tests:** mirror transform, interpolation, code generation, state machines, input clamping, and the seeded vs-Bot golden test from F-1.

**Day 1 exit:** T-1 to T-3 pass, and you have played one full match with a friend on a Vercel preview URL.

---

### DAY 2 — Design (Claude Sonnet)

**Goal:** every MP screen looks like it belongs in your game, using the **same font, type scale, palette and components**. Sonnet may edit CSS, markup and **visual-only** render code (`render/*`, `ui/*`). It **must not edit** `shared/`, `server/`, `src/net/`, or game physics and rules.

**Attach to every Day 2 chat:** Part 1 (§8 art direction, §9 UI), this document (§20 UX and copy), the reference frames, and a fresh screenshot of the current screen.

- [x] **D2-1 Tokens and MP components** *(can start early)*. Reuse existing tokens (palette in §8.1, type scale §8.2). Add only what's missing: a code card, four-box code input, countdown ring, connection bars icon, toast, name field. **No new colours.**
  - **Done when:** one page shows all new components next to the existing buttons and modal, at phone and desktop widths.
- [x] **D2-2 Lobby screens (S01 additions to S07).** Extended start screen with the divider, the two MP buttons and the name line, host lobby (large spaced code card, Share invite as the hero, countdown that turns `bubble` red at 0:20, +2 min), friend-joined state, code entry, invite screen, guest lobby.
  - **Done when:** all look finished at 360 px, 768 px and 1280 px, portrait and landscape on phone, and the start screen still matches §9.3 for everything that existed.
- [x] **D2-3 Match chrome (S08 to S13).** Countdown numerals, connection chip and bars, leave button (44 px), reconnect overlay, result and rematch screens, Leave dialog, emote tray, the red bubble for friend emotes and the red "You" pill for your own.
  - **Done when:** chrome never covers the table or paddle at any size, and every control is at least 44 px.
- [x] **D2-4 Character reactions.** Verify each expression in §20.7 reads clearly and ties to the right viewer-relative trigger. Use the existing expressions. No new character.
  - **Done when:** each state is distinct, and auto bubbles stay off in MP.
- [x] **D2-5 Message screens (S14).** All eleven rows in §20.5, each with one primary button and a quiet "Play vs Bot" link.
  - **Done when:** all render correctly at every breakpoint.
- [x] **D2-6 Motion.** Screen transitions, countdown pop and fade, toasts, button feedback, in the same style as the existing score pop and bubble animations. `prefers-reduced-motion` turns them off.
  - **Done when:** nothing janky at 60 fps on a mid-range phone.
- [x] **D2-7 Accessibility and visual QA.** Contrast 4.5:1 or better, visible focus, `aria-live` for expiry, "joined", reconnecting and result, labels on icon buttons, signal strength also stated as text. Optional link-preview image (Y-17).
  - **Done when:** the pass in §26 succeeds and screenshots match the reference style.

---

### 24.5 Shared QA and Ship

- [ ] **S-1 Real-device test** (needs Y-6): phone vs laptop, phone vs phone, iOS Safari and Android Chrome, Wi-Fi and mobile data. *Next step: Girish is testing on two phones.*
- [ ] **S-2 Edge-case sweep:** tick every group below. *Server-side rows are covered by the scripted tests in `server/test/` and the chaos script, but the full sweep on real devices hasn't been done.*
- [ ] **S-3 Ship:** merge `multiplayer` to `main`, confirm the production deploy, play one last match, and simulate the free-limit error to see the "resting" screen. *Merged and deployed on 14 Oct 2026 (production deploy ready, relay CORS checked for `tabel-tennis.vercel.app`). Last match on devices and the "resting" check are still open.*

| Group | IDs | ☐ |
|---|---|---|
| Room lifecycle | E-1 to E-10 | ☐ |
| Connection and recovery | E-11 to E-23 | ☐ |
| Gameplay | E-24 to E-29 | ☐ |
| Device and browser | E-30 to E-40 | ☐ |
| Abuse, limits, updates | E-41 to E-48 | ☐ |
| Added after reading the real project | E-49 to E-54 | ☐ |

### 24.6 Cursor setup (`.cursor/rules`)

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

## 25. Dependencies From You (⚠️)

Each shows when it blocks work and **what I'll assume if you don't answer**.

### 25.1 Already resolved by your real project

| Item | Resolution |
|---|---|
| Game name | **Table Tennis** (start screen title) |
| Footer links | Instagram, X and LinkedIn already in place |
| Static hosting | Vercel (existing) |
| Domain | `tabel-tennis.vercel.app` (existing) |
| GitHub repo | Existing public repo `Girish-shedge/table-tennis` |
| Character | One character (Bot's), representing the friend |

### 25.2 Accounts and setup

| ID | What you need to do | Needed by | If you don't |
|---|---|---|---|
| ⚠️ Y-1 | Create a **free Cloudflare account** and run `wrangler login` in your terminal (never paste tokens into Cursor chat) | B-6 | You can build and test locally, but friends can't join over the internet |
| ⚠️ Y-2 | Create the git branch `multiplayer` and confirm Vercel makes preview deployments for it | Start of Day 1 | Cursor works on a local branch, with no real-device tests |
| ⚠️ Y-3 | In Vercel, set `VITE_RELAY_URL` (for **Preview** and **Production**) once the Worker URL exists, and keep `ALLOWED_ORIGINS` in the Worker settings in sync | B-6 | The MP buttons stay hidden (by design, E-50) |
| ⚠️ Y-5 | Confirm that **Grok** and **Sonnet** both appear in your Cursor model picker and your plan covers a day of heavy use | Before each day | Use the strongest available model for netcode, and Sonnet for design |
| ⚠️ Y-6 | Have **a second device and a friend** (or a second browser profile) ready | S-1 | Testing is limited to two windows on one computer |

### 25.3 Decisions and clarifications

| ID | Question | Needed by | My default |
|---|---|---|---|
| ⚠️ Y-9 | If a player leaves or doesn't come back in time, does the other **win by forfeit**? | B-3, F-6 | Yes |
| ⚠️ Y-10 | A one-time **"+2 min"** button on the host lobby? (A host sharing the link in WhatsApp can burn much of a 2-minute window) | F-3, D2-2 | Include it |
| ⚠️ Y-11 | **Host presses Start**, with no ready toggles | F-3 | Host presses Start |
| ⚠️ Y-13 | A small **name blocklist** for offensive names? | B-4 | A very small blocklist |
| ⚠️ Y-14 | Minimum browsers as listed in §19.2 | S-1 | As listed |
| ⚠️ Y-16 | No analytics or tracking | B-4 | None |
| ⚠️ Y-17 | A link-preview image for shared invites (optional) | D2-7 | Skipped |
| ⚠️ Y-18 | **Auto speech bubbles off in MP**, so a bubble always means a friend's emote (the face still reacts) | F-5, D2-4 | Off in MP |
| ⚠️ Y-19 | **Letters-only codes** (23 letters, 279,841 combinations) instead of letters plus digits, because of the hand-drawn font | B-2 | Letters only |
| ⚠️ Y-20 | **Start screen layout:** the two MP buttons sit **under** Easy, Medium and Hard, after a quiet "or play a friend" divider | F-3, D2-2 | As described in §20.2 |

---

## 26. Acceptance Criteria and Tests

### 26.1 Acceptance

Everything in §13 still holds (first frame matches the reference, depth scaling, tilt, no scroll, no external image assets), and in addition:

- [x] A friend can host, and another friend can join by link or code, and finish an 11-point match, with no sign-up. *(T-1, two browser contexts; real devices pending S-1)*
- [x] Each player sees themselves at the near end with the red paddle, and the friend's name on the scoreboard.
- [ ] Rules and feel match vs-Bot: serve rotation (every 2 points, every point from 10–10), 1.6 s point freeze, 0.17 m hit radius.
- [ ] At 100 ms RTT the guest's paddle feels instant and the ball motion looks smooth.
- [ ] A 10-second connection drop during a rally recovers without losing the score.
- [ ] A host who switches apps to share the link does not lose the room.
- [ ] A room that nobody joins expires after 2 minutes with a clear screen.
- [x] vs-Bot is unchanged (seeded simulation matches) and still works if the relay is unreachable.
- [x] The bundle is under 150 KB gzipped, with no new client dependencies. *(About 27 KB JS and 4.7 KB CSS gzipped)*
- [ ] Rooms and their data are gone shortly after both players leave.

### 26.2 Test plan

**Network conditions** (Chrome DevTools throttling plus real devices)
- [ ] 50 ms, 150 ms and 300 ms latency: playable up to about 150 ms.
- [ ] 2–5% packet loss: no freezes longer than 200 ms.
- [ ] Offline for 5 s: pause then resume. Offline for 20 s: the match ends cleanly.
- [ ] Wi-Fi to mobile data mid-match recovers.

**Devices:** phone (portrait and landscape) vs laptop, phone vs phone, iOS Safari vs Android Chrome, backgrounding and screen lock on both.

**Security:** malformed and oversized messages dropped, a third join rejected, impossible paddle values clamped, a disallowed origin refused.

**Accessibility pass** (run with `npm run qa:a11y`, results from 14 Oct 2026)
- [x] Keyboard-only through the start screen, lobbies and result, with a visible focus ring. *Every control shows a 3 px blue ring. Result and rematch buttons were not driven by keyboard in the script.*
- [x] A screen reader announces "Room expires in…", "{Name} joined", "Reconnecting…" and the result. *All go through the polite live region `#mp-live`; only the expiry announcement was checked by script.*
- [x] Reduced motion on: no shake, streak or large movement. *No running animations with `reducedMotion: 'reduce'`.*
- [ ] Zoom to 200%: nothing is cut off. *Not run in a browser. Layouts fit at 360 px wide, which is close to a 640 px window at 200%.*

---

## 27. Risks

| Risk | What reduces it |
|---|---|
| Netcode feels laggy or desyncs | Throttled-latency tests early (T-2) and the automated tests |
| A mobile browser suspends a player mid-match | Announce-then-pause (E-12, E-49), checkpoint recovery (E-14), tests on real phones |
| Free daily limit reached on a busy day | The "resting" screen (E-44), 20 Hz fallback, vs-Bot always available |
| Refactoring breaks vs-Bot | Seeded headless golden test (F-1, T-3) |
| Design edits break logic | Day 2 may not edit `shared/`, `server/`, `src/net/` or physics, and tests re-run after Day 2 |
| Half-built multiplayer reaches production | Branch `multiplayer`, merge only after §24.5 (E-54) |

---

## 28. Open Items

Everything marked ⚠️ in §25 has a default, so building can start now. Answer the ⚠️ items whenever you can, and tell me if you want any default changed.

---

## 29. Current State and Known Gaps (14 Oct 2026)

### 29.1 Running and testing

| Command | What it does |
|---|---|
| `npm run dev` | Vite on :5173. Uses `.env.development`, which points at a local relay on :8787 |
| `cd server; npm run dev` | Local relay with `wrangler dev` on :8787 |
| `npm run build` | Type-check and build. Without `VITE_RELAY_URL` the MP buttons are hidden |
| `npm test` | Unit tests: session machine, net helpers, vs-Bot golden hash |
| `npm run test:e2e` | Two-client Playwright test. Needs `npm run dev` and the local relay already running |
| `npm run test:chaos` | Drop, latency and host-reload script against a running relay |
| `npm run qa:shots -- <tag>` | Screenshots of every MP screen into `design-shots/<tag>/` (gitignored). Set `ONLY=360,land` to limit sizes |
| `npm run qa:a11y` | Touch-target, focus-ring, reduced-motion and live-region checks |
| `cd server; npx wrangler deploy` | Deploy the relay (Girish runs this; needs `wrangler login`) |

Dev-only helpers: `/design.html` (component sheet) and `window.__mp` (forces session screens for screenshots). Neither ships in the production build.

### 29.2 Known gaps that need a logic change

These were found during the Day 2 design pass, which wasn't allowed to change logic. The UI works around the first two.

| Gap | Where | Effect today |
|---|---|---|
| Space is swallowed in text inputs | `src/game/input.ts` | The UI stops key events from inputs, so typing works, but this should be fixed at the source |
| Ping text is a raw float | `src/main.ts` (`setConn`) | `src/ui/conn.ts` rewrites it to "85 ms" and derives the bars |
| Message primaries "Try another code", "Host your own", "Create new room", "Retry" only go back to the menu | `src/ui/screens/index.ts` / session | One extra tap for the player |
| Reconnect overlay can't show "Waiting 12 s" | session has no seconds left | Shows "Reconnecting…" and "Your score is safe." only |
| Serve-timer ring isn't drawn | no timer value in render state | The serve timer still works, it just isn't visible |
| Space on a focused button may also fire the game's primary action | `src/game/input.ts` | Desktop keyboard only; result screen doesn't autofocus Rematch to avoid accidental rematches |
| `SERVE_TIMEOUTS_BEFORE_PROMPT` is defined but no prompt is shown | `shared/constants.ts` | Two serve timeouts don't trigger a prompt |


---

## 30. UI Refresh (14 Oct 2026)

- **Home page:** the start overlay is now a full white page: logo (`public/icon.png`, also the favicon), title, **Pick your player** row, difficulty buttons, Host / Join, name, hint, and the Instagram / X / LinkedIn footer. The footer appears on the home page only.
- **Avatars:** six looks (Wow, Cap, Cool, Fierce, Dizzy, Wink) in `src/ui/avatars.ts`, drawn as the Bot blob head with the nose bump. The pick is saved in `localStorage` (`tt-avatar`). During a match, a small profile bar near the bottom shows your avatar and name and your opponent's (Bot's face vs Bot). Online, avatars are exchanged inside the relay's existing `emote` message (`id: -1`, `avatar: "<id>"`), so no relay change was needed. An unknown peer avatar falls back to Bot's face.
- **Colour roles:** primary = court blue `#0A8CFF` (main buttons, selected avatar, focus lift; hover `#0070D6`); secondary = white with an ink outline (all other buttons and chips); ink for text and outlines; danger red `#F23B3B` only for warnings, errors and the "you" accents. Muted text is `#666`.
- **Type scale:** desktop 56 / 32 / 24 / 20 / 16 / 14, phones (width up to 600 px, or short landscape) 40 / 28 / 20 / 18 / 16 / 14 as `--t-title`, `--t-heading`, `--t-subtitle`, `--t-body`, `--t-label`, `--t-caption`. Canvas text uses `fontPx()` with the same limits (never under 14 px).
- **Spacing:** every padding, margin, gap and size is a multiple of 4 (tightened to an 8 px grid in §30.4).
- **Top bar:** connection (and difficulty label) on the left, volume and close on the right. Toasts appear at the top. No focus outline ring anywhere. The "+2 min" room button is removed.
- **Opponent paddle:** drawn after the table, and the guest's view uses `aiPaddleHover`, so the far paddle is no longer cut off by the table edge.
### 30.1 Follow-up (14 Oct 2026)

- **Avatars redrawn** larger and more expressive (shaded head, cheeks, highlights, bolder props).
- **Difficulty is a choice, not three actions.** Easy / Medium / Hard are white options (the last pick is saved as `tt-level`, default Medium); the single solid-blue primary is **Play vs Bot**. Host and Join stay white.
- **Player picker moved** to a **My player** button at the top right of the home page. It opens a dialog with the six avatars and a Done button.
- **Leaving a Bot match:** the close button is now shown in Bot games too (Esc does the same). It asks "Leave match?" and pauses the game while the question is open.
### 30.2 Home page v3 (14 Oct 2026)

- **Primary CTA is You vs Bot.** It opens a **Game mode** dialog (Easy / Medium / Hard, each with a one-line description); choosing one starts the match. The always-visible mode buttons and the hint badge are gone.
- **Top of the home page:** **How to play** (left) opens the full instructions (moving, serving, scoring, winning, extras); **My player** (right) shows your avatar and name and opens one dialog to edit both. The bottom Playing-as row is removed. The name is saved with the same storage key and is passed to the multiplayer session through `setName`.
- **Subheading:** Quick hand-drawn rallies. Beat Bot, or challenge a friend.

### 30.3 Network, friend faces, colour (14 Oct 2026)

- **Mobile data.** The guest now places each snapshot on the host's own clock (`ts` in every state message) and keeps a jitter buffer (100 to 260 ms, grows with measured jitter), so bursts and late packets no longer make the ball stutter. A snapshot counter that restarts (host reload) is accepted. Snapshots and paddle positions are sent "lossy": skipped while the socket still has more than 8 KB queued, so a slow link never builds a backlog of stale data. Values are rounded to 1 mm, input rate is 30 Hz, hit forgiveness up to 120 ms, extrapolation up to 160 ms. Ping every second, smoothed round trip. "Weak connection" now needs 450 ms or more for 6 seconds (mobile data often sits at 200 to 400 ms and plays fine); "waiting for friend" needs 2.5 s of silence. No relay change.
- **Bouncing ball lag.** The overlay's backdrop blur is removed (it re-blurred the repainting canvas every frame), the ball animates with `transform` on the GPU, and the canvas redraws only twice a second while on the home page or lobby screens.
- **Scoreboard gap.** The distance of each score from the middle dot grows with the longer player name, so names never touch.
- **Footer** is one line: "No one to play with? Text Girish Shedge" (dotted underline), opening WhatsApp to +91 9373869224 with "Let's play tennis together" filled in.
- **Friend avatars everywhere.** Avatars are exchanged when a friend joins (new `src/net/peer.ts`), so the lobby ("You're in!" with both faces, green tick, room code), the host's "joined" badge and the result and rematch cards show them. In the match the far-end head is the friend's avatar with the same four moods as Bot (watch, shock, happy, dizzy); every look has all four. Against a friend the bottom bar is one line, "You are playing with <Name>".
- **Colour.** Green (`--success`) for success: joined, you're in, you win, link or code copied, strong connection. Red (`--danger`) for alerts and for the destructive Leave button, weak connection, warnings. Quiet text buttons became normal white buttons. Every tappable control has the hard ink shadow; toasts, the connection light and the mode label do not.

### 30.4 Power, Bot and polish (15 Oct 2026)

- **Shot power** (§6.6, §6.7). Pull back to charge, keyboard hold as a fallback. Default power drops the ball just past the net, the 60 to 80% sweet spot is the most accurate, and from 85% the ball may go out.
  - **Power bar:** replaces the profile bar at the bottom of every match (vs Bot and vs friend). It has a gradient fill (blue, then green, then red), a dashed sweet-spot box, a hatched risk zone, and a state word: Soft, Building, Sweet spot or Too hard!
  - **Short landscape:** the bar moves to the bottom-left corner.
  - **Emotes:** they sit above the bar.
- **Serve preview:** a dotted path and a landing ring while you serve. The ring turns red when the serve may go out.
- **Bot keeps the rally going.**
  - The deliberate faults are gone: Bot used to send about 11% of Easy returns, 6.5% of Medium and 3% of Hard into the net or out.
  - Reaction, tracking and speed are retuned as in §6.6.
  - New tests: `tests/rally-sim.ts` and `tests/rally.test.ts`.
  - The `bot-golden` hash was re-captured on purpose.
- **Text selection on phones** is blocked during play (§7.2).
- **Buttons:**
  - Every `.btn` and `.chip` is 48 px tall with 18 px text (`--btn-h`, `--btn-font`).
  - **Press effect:** the button sinks into its shadow on press, then springs back with an overshoot (`--press-in`, `--press-out`). There is no hover lift.
  - `src/ui/press.ts` holds the pressed state for at least 110 ms, so quick taps still show it.
  - Status chips (mode label, connection) don't move.
- **Two-button modals are always stacked**, primary on top, on every screen size.
  - **Leave match** (Bot and friend): **Keep playing** (blue) above **Leave** (white with an ink outline). There is no red button any more.
- **Host lobby** matches Join: heading, then the expiry countdown, the code tiles, **Share invite** and Cancel. Copy link and Copy code are gone. The link field still appears when the browser can't share or copy.
- **Back home** replaces every "Play vs Bot" action on message screens (§20.5). It closes the session and returns to the home page.
- **Scoreboard:** bigger numerals and a clear gap to the names (§9.1).
- **Removed:** the palm on the red paddle and the profile bar in matches.
- **Loader ball:** the bouncing ball in the Host and Reconnecting screens was frozen on phones with Reduce Motion turned on. It now always plays a gentle hop.
- **Spacing** is on an 8 px grid. 4 px is used only as a half step inside small parts (badges, gaps between label lines).
- **Home page friend entry:** You vs Bot, then "or", then **Play with a friend**, which opens a dialog with Host a game and Join with code (§20.2). The host and join flows are unchanged.
- **Signal strength on the home page:** "Signal strength: Good / Okay / Weak / Offline", as text only, under Play with a friend (§20.2).
- **Play with a friend dialog icons:** Host a game is a red paddle with a blue "+" badge; Join with code is a blue key.
- **Names are 1 to 12 characters** (`MAX_NAME_LENGTH` in `shared/constants.ts`, was 16). The My player field stops at 12 and shows a live "8/12" counter. A longer name saved earlier is shortened to 12 on load instead of being reset. The deployed relay still accepts up to 16 until it's next redeployed; that's harmless because clients now send at most 12.
- **Rally power fix (v2.1.1):** charged power now holds until your hit. Moving forward to the ball no longer drains it, and ↑ no longer empties the bar (§6.7).
