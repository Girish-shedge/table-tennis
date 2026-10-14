# Table Tennis (TT) — Project Spec

A single-screen, hand-drawn-style, pseudo-3D table tennis game that plays in the browser on desktop (keyboard and mouse) and mobile (touch). You play the red paddle at the near end against **Bot**, a hand-drawn character with a blue paddle at the far end.

This document started as the build brief, reverse-engineered from the 10 reference frames (`frame_001.png` to `frame_010.png`). It now also records what was actually built, the decisions taken along the way, and every update since the first release.

---

## 0. Status and Links

| | |
|---|---|
| **Status** | v2.0 live: vs-Bot plus online multiplayer (specified in `TT multiplayer PRD.md`). Real-device multiplayer test in progress |
| **Live game** | [tabel-tennis.vercel.app](https://tabel-tennis.vercel.app) |
| **Other live URLs** | [table-tennis-alpha-jet.vercel.app](https://table-tennis-alpha-jet.vercel.app) (original Vercel address, still works) |
| **Source code** | [github.com/Girish-shedge/table-tennis](https://github.com/Girish-shedge/table-tennis) (public, branch `main`) |
| **Hosting** | Vercel, connected to GitHub. Every push to `main` deploys to production automatically. |
| **Multiplayer relay** | Cloudflare Worker `tt-relay` at `https://tt-relay.girish-tt.workers.dev` (code in `server/`, deployed with `wrangler`) |
| **Bundle size** | About 27 KB of gzipped JavaScript and 4.7 KB of CSS with multiplayer (target is under 150 KB). vs-Bot alone was 12.7 KB |

Note: `table-tennis.vercel.app` is owned by another Vercel account, so the custom address uses the spelling `tabel-tennis`.

### Run it locally

```bash
npm install
npm run dev      # dev server with hot reload
npm run build    # type-check and build to dist/
npm run preview  # serve the production build
npm test         # unit tests, including the seeded vs-Bot golden test
```

Multiplayer needs the relay as well. See `TT multiplayer PRD.md` §13 for the local relay, the end-to-end test and the QA scripts.

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
- Accounts and leaderboards. (Online multiplayer was added in v2.0 and is specified in `TT multiplayer PRD.md`.)
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
├─ TT game project.md      # this document
├─ TT multiplayer PRD.md   # online multiplayer spec and status
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
   │  └─ input.ts          # keyboard, pointer drag, touch drag
   ├─ render/
   │  ├─ projection.ts     # world → screen transform and back
   │  ├─ table.ts          # table, lines, net
   │  ├─ paddle.ts         # player and opponent paddles (with transparency support)
   │  ├─ ball.ts           # ball, shadow, motion streak
   │  ├─ character.ts      # Bot's head and expressions
   │  ├─ bubble.ts         # speech bubble and "You" tooltip
   │  ├─ hud.ts            # scoreboard, +1 animation, caption
   │  └─ sketch.ts         # wobbly stroke helpers
   └─ ui/
      ├─ styles.css        # font faces, type scale, overlays, buttons, info badge
      ├─ footer.css        # footer pill
      ├─ mp.css            # multiplayer components and screens
      ├─ screens/index.ts  # multiplayer screens
      ├─ conn.ts, toast.ts # connection chip and toasts
      └─ design.ts         # dev-only component sheet (design.html)
```

The full multiplayer file list is in `TT multiplayer PRD.md` §6.11.

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
- a **tracking error** that grows with the distance it has to travel (0.14 m extra per meter),
- **aim spread** and a **corner bias** that decide how wide it hits,
- a gentle rubber-band effect that keeps games close.

| Mode | Reaction | Tracking error (σ) | Speed cap | Return speed | Serve speed | Aim spread | Corner bias | Hit bonus |
|---|---|---|---|---|---|---|---|---|
| Easy | 260 ms | 0.09 m | 1.0 m/s | 3.6 m/s | 3.6 m/s | 0.35 | 15% | 0 |
| Medium | 170 ms | 0.075 m | 1.4 m/s | 4.3 m/s | 4.1 m/s | 0.50 | 40% | 0.02 m |
| Hard | 100 ms | 0.04 m | 1.9 m/s | 5.2 m/s | 4.7 m/s | 0.62 | 70% | 0.04 m |

All three modes are beatable. This was checked with headless simulations, and Bot does miss on Hard.

---

## 7. Controls

### 7.1 Desktop

| Input | Action |
|---|---|
| ← → ↑ ↓ (or A D W S) | Move the paddle left, right, toward the net and back |
| Space | Serve, or play again after the game ends |
| Mouse drag on the paddle | Move the paddle freely (cursor shows `grab` / `grabbing` and the red **You** label) |
| M | Mute or unmute |
| Esc | Does nothing. The mode can't be changed mid-match. |

### 7.2 Mobile

| Input | Action |
|---|---|
| Touch and drag on the paddle | Moves the paddle directly |
| Touch and drag anywhere else | Moves the paddle relative to the finger (depth uses 0.6× gain) |
| Tap | Serve, or play again |

Implementation notes:
- Pointer Events with `touch-action: none`, tracking a single active `pointerId`.
- The drag is released on `pointercancel`, on `lostpointercapture`, and on a mouse move with no buttons pressed, so a grab never gets stuck.
- The hint text changes with the input type: keyboard shows `Arrow keys to move · Space to serve`, and touch shows `Drag to move · Tap to serve`.
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
- `[You] · [Bot]`, big and bold, placed slightly higher than in the reference.
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
- Two **equal-width** buttons: **Play again** (same mode) and **Change difficulty** (back to the start screen).
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
Built on branch `multiplayer` and merged into `main`. Full spec, task list and known gaps live in `TT multiplayer PRD.md`.
- Host a room and share a link or a 4-letter code; a friend joins on desktop or phone with no sign-up.
- The host's browser runs the match; a Cloudflare Worker relay (`server/`) forwards messages between the two players.
- Each player sees themselves at the near end with the red paddle and the friend's name on the scoreboard.
- Reconnect, rematch, leave, emotes and message screens for every failure case.
- Start screen gains an "or play a friend" divider, **Host a game** and **Join with code** buttons, and an editable name line. They are hidden when no relay is configured, so vs-Bot looks exactly as before.
- The paddle code was refactored into controllers. A seeded vs-Bot simulation (golden test) proves vs-Bot plays exactly as before.
- Design pass: all MP screens use the existing font, type scale, palette and components. Keyboard focus ring, screen-reader announcements and reduced motion were checked.

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
  aiDistanceError: 0.14,   // extra tracking error per meter traveled

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

- Local two-player on one device. (Online play is in v2.0, see `TT multiplayer PRD.md`.)
- More opponents with different personalities and play styles.
- Match statistics (longest rally, points won on serve).
- A share card with the final score.

---

## 17. Multiplayer (v2.0)

`TT multiplayer PRD.md` owns everything online: rooms, lobby, join flows, network, the relay server and multiplayer-only behavior. This file owns rules, physics, constants, rendering, art direction, Bot's AI, and the vs-Bot screens and controls.

Where the two overlap (start screen, top-corner controls, game states, hotkeys), this file describes vs-Bot mode and the PRD lists the "MP addition" items. In multiplayer the PRD wins; in vs-Bot this file wins. Whenever code changes behavior, update the file that owns it.
