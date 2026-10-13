# Table Tennis (TT) — Project Spec

A single-screen, hand-drawn-style, pseudo-3D table tennis game that plays in the browser on desktop (keyboard + mouse) and mobile (touch). You play the red paddle at the near end against a character with a blue paddle at the far end.

This document is the build brief, reverse-engineered from the 10 reference frames. Where a frame doesn't answer a question, it is marked **[Assumption]**, so you can change it.

---

## 1. Visual Analysis of the Reference Frames

### 1.1 Scene layout (top to bottom, centered, white page)

| Layer | What the frames show |
|---|---|
| Scoreboard | Two large serif numerals, e.g. `3 · 4`. A small grey dot separates them. Tiny grey labels sit under each number: **You** (left) and **Ahmed** (right). |
| Opponent character | A hand-drawn blob "head" with a thick black outline and white fill, floating above the far end of the table. It has no body. It moves left and right, roughly following the ball or its own paddle. |
| Speech bubble | A small red rounded rectangle with white serif text (`Hey!`) at the head's upper right. It pops in and fades out (frame 2 shows it half transparent). |
| Opponent paddle | A small blue paddle with a dark outline, floating just above the far edge of the table. It tilts as it moves. |
| Ball | A tiny white ball with a black outline and a small soft shadow on the table. It looks smaller at the far end and larger near the player (perspective). |
| Table | A blue trapezoid in perspective with a white border line, a white center line, and a darker blue front-edge thickness. |
| Net | A translucent light-blue band across the table, with two black posts and a black top cord. |
| Player paddle | A red paddle with a thick black outline, a white curved highlight, and a white handle. A small white hand/grip icon sits on the face. A dark-blue ellipse shadow sits on the table beneath it. |
| Cursor tooltip | A red pill label reading `Grab` appears beside the paddle while the pointer hovers over or drags it. |
| Hint caption | Small grey text centered under the table: `Arrow keys to move · Space to serve`. |
| Footer pill | A floating white rounded pill with a soft shadow: `ahmed@emanata.com │ Instagram │ X`. |

### 1.2 Character expressions (from frames)

| State | Look | When it appears |
|---|---|---|
| **Surprised / watching** | Wide eyes with pupils, open oval mouth | Default while the rally is live |
| **Dizzy / hit** | Eyes become spiral or "X" marks, a swirl or bow sits on the head, the mouth is a small "o", and the `Hey!` bubble shows | When the player returns or hits the ball back, or the player scores a point |
| **Looking sideways** | Pupils shift toward the ball direction, and the head tilts and slides | During the rally |

### 1.3 Paddle behavior (from frames)

- The player paddle moves left and right **and forward and back** (toward the net and away). Frames 6, 7, 9 and 10 show it raised toward the net, and the other frames show it near the front edge. The paddle scales with depth: smaller near the net, larger near the player.
- The paddle **tilts (rotates)** in the direction of movement. Frames 3 and 8 show about 15–25° of lean while it moves sideways.
- The shadow ellipse follows the paddle on the table plane, and the shadow's gap from the paddle suggests height.
- A grab/drag cursor with the `Grab` label implies **pointer-drag control**. Arrow keys are the alternative.

### 1.4 Scoreboard progression

The frames show the "You" score as 3 → 2 → 1 against Ahmed's 4 (the capture appears to be in reverse time order, or the demo resets). Treat it as a normal points race.

**[Assumption]** First to **11**, win by 2. Make this a config constant.

### 1.5 Reference proportions (measured on a 1136 × 718 frame)

Use these as ratios of the game's design size:

| Element | Approx. position (px) | As a ratio of the frame |
|---|---|---|
| Table far edge | y ≈ 293, x from 420 to 705 | y 0.41, x 0.37–0.62 |
| Table near edge | y ≈ 590, x from 265 to 860 | y 0.82, x 0.23–0.76 |
| Net band | y ≈ 352–390, x from 345 to 780 | y 0.49–0.54 |
| Scoreboard | center x ≈ 560, y ≈ 80 | y 0.11 |
| Opponent head | y ≈ 130–215 | y 0.18–0.30 |
| Hint caption | y ≈ 622 | y 0.87 |
| Footer pill | y ≈ 670 | y 0.93 |

---

## 2. Goals and Non-Goals

**Goals**
- Instant play with no sign-in. The first interaction starts a serve.
- Works on desktop (keyboard and mouse) and on phones and tablets (touch), portrait and landscape.
- Charming hand-drawn look with smooth 60 fps animation.
- Fair, beatable AI with difficulty that ramps up.

**Non-goals (v1)**
- Online multiplayer, accounts, leaderboards.
- Real 3D engine. We use 2D canvas with a perspective projection.

---

## 3. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Safer physics and state code |
| Build | Vite | Fast dev server, simple static deploy |
| Rendering | HTML5 Canvas 2D | Full control of the hand-drawn look, and it performs well on mobile |
| Input | Pointer Events + Keyboard Events | One code path for mouse, touch and pen |
| Audio | Web Audio API (small synthesized blips) | No asset files needed. Unlock on first gesture |
| State | Plain finite state machine | Small game, no framework needed |
| Fonts | A serif display face (e.g. Newsreader or Source Serif 4) for numerals, bubble and footer, and a clean sans for tiny labels | Matches the serif numerals in the frames |
| Hosting | Any static host (Netlify, Vercel, GitHub Pages) | |

**[Assumption]** No React. If you prefer React, keep the game loop and canvas outside React state.

---

## 4. Project Structure

```
tt-game/
├─ index.html
├─ project.md
├─ package.json
├─ vite.config.ts
├─ src/
│  ├─ main.ts              # bootstrap, resize, start loop
│  ├─ config.ts            # all tunable constants
│  ├─ game/
│  │  ├─ state.ts          # FSM: idle, serving, rally, point, gameover
│  │  ├─ physics.ts        # ball integration, bounce, net, paddle hit
│  │  ├─ ai.ts             # opponent controller
│  │  ├─ score.ts          # scoring and win rules
│  │  └─ input.ts          # keyboard, pointer drag, touch
│  ├─ render/
│  │  ├─ projection.ts     # world → screen transform
│  │  ├─ table.ts          # table, lines, net
│  │  ├─ paddle.ts         # player and opponent paddles
│  │  ├─ ball.ts           # ball and shadow
│  │  ├─ character.ts      # opponent head and expressions
│  │  ├─ bubble.ts         # speech bubble and Grab tooltip
│  │  ├─ hud.ts            # scoreboard, caption
│  │  └─ sketch.ts         # wobbly stroke helpers
│  ├─ audio.ts
│  └─ ui/
│     ├─ footer.css        # footer pill
│     └─ styles.css
└─ public/
```

---

## 5. Coordinate System and Projection

### 5.1 World space (meters, table centered)

- `x`: left (−) to right (+). Table width **1.525 m**, so x ∈ [−0.7625, 0.7625].
- `z`: depth. Player's end at `z = 0`, opponent's end at `z = 2.74` (table length). The net is at `z = 1.37`.
- `y`: height above the table surface. The net is 0.1525 m high.

### 5.2 Perspective to screen

Use a simple pinhole projection for a camera behind and above the player's end:

```
scale(z)  = f / (z + d)            // d = camera distance behind z=0
screenX   = cx + x * scale(z) * PX_PER_M
screenY   = horizonY + (camH - y) * scale(z) * PX_PER_M ... (tune so z=0 → y≈0.82H and z=2.74 → y≈0.41H)
```

Tune `f`, `d` and `camH` until the table's trapezoid matches the ratios in §1.5. The near edge should be about 595 px wide and the far edge about 285 px wide on a 1136 px frame, so the far/near width ratio is about **0.48**.

Sprite sizes (paddles, ball, shadows) multiply by `scale(z)`. This produces the "bigger near you, smaller far away" effect seen in the frames.

### 5.3 Design resolution and responsive scaling

- Design at **1136 × 718** (about 1.58 : 1) for landscape, and a **portrait layout** of about **720 × 1100** for phones.
- Render at `devicePixelRatio` (cap at 2 or 3) for sharpness.
- On resize, recompute the canvas CSS size to fit the viewport while preserving the aspect ratio, and re-center it.
- In portrait, the table fills about 92% of the viewport width, the scoreboard stays on top, and the footer pill pins to the bottom with `env(safe-area-inset-bottom)`.

---

## 6. Game Mechanics

### 6.1 State machine

```
IDLE (first load, hint visible)
  └─ Space / tap  →  SERVE
SERVE (ball held above the server's paddle)
  └─ Space / tap (player) or timer (AI)  →  RALLY
RALLY (physics live)
  └─ ball dies  →  POINT
POINT (1.2 s freeze, reaction animation, score updates)
  └─ if win  →  GAME_OVER  else  →  SERVE (alternate server every 2 points)
GAME_OVER (winner banner, "Play again" via Space or tap)
```

### 6.2 Ball physics

Per fixed step (`dt = 1/120 s`, accumulate from `requestAnimationFrame`):

- Gravity `g = 9.8 m/s²` on `y` (you can exaggerate to 12 for a snappier feel).
- Integrate position with semi-implicit Euler.
- **Table bounce**: when `y ≤ 0` and the ball is within the table bounds, set `vy = −vy * 0.85`, set `y = 0`, play a tick, and register which half it bounced on.
- **Net**: if the ball crosses `z = 1.37` with `y < 0.1525 + ballRadius`, reverse and damp `vz` and register a "let" or a fault.
- **Out**: if the ball hits the floor (`y < −0.76`) or passes the end without a valid bounce, the point ends.
- **Rule check (simplified)**: a valid return needs the ball to bounce once on the receiver's half before being hit. A hit with no bounce, or a bounce on the hitter's own half after hitting, loses the point.

### 6.3 Paddle hit

- Hit test in world space: ball within the paddle's radius (about 0.09 m) at the paddle's `z`, with a tolerance window of about ±0.15 m in `y`.
- The return velocity is built from:
  - Base forward speed (about 3.5–5 m/s).
  - **Sideways aim** from where on the paddle face the ball hit: `vx += (ball.x − paddle.x) * k`.
  - **Paddle velocity transfer**: `v += paddleVelocity * 0.6`. Moving the paddle as you hit adds power and angle.
  - **Paddle depth**: moving the paddle forward at contact adds speed.
- Trigger the **hit animation** (paddle squash, small screen shake of 2–3 px, "tok" sound).

### 6.4 Player paddle

- `x` is clamped to the table width plus a 0.25 m margin.
- `z` is clamped to the player's half, from `z = 0.1` to `z = 1.2`.
- Smoothly follow the target with critically damped easing (about 0.12 s).
- **Tilt**: `rotation = clamp(vx * 0.35, −0.45, 0.45)` radians, eased.
- **Shadow**: an ellipse on the table plane under the paddle, with opacity falling as height rises.

### 6.5 AI opponent (Ahmed)

- Tracks the predicted landing `x` of the ball with a **reaction delay** (80–250 ms) and a **speed cap**.
- Adds aim error that shrinks with difficulty: `error ~ N(0, σ)`.
- Plays defensively: returns about 85% of fair balls at the start, rising toward about 95%.
- **Difficulty ramp**: each point the player wins reduces `σ` and the delay slightly. Each point the AI wins loosens them (rubber-band so games stay close).
- The opponent paddle uses the same tilt and hit animation as the player's.

---

## 7. Controls

### 7.1 Desktop

| Input | Action |
|---|---|
| ← → ↑ ↓ (or A D W S) | Move the paddle left, right, toward the net, back |
| Space | Serve, or restart after game over |
| Mouse drag on paddle (Grab cursor) | Move the paddle freely |
| Mouse move (optional toggle) | Paddle follows the pointer |

The cursor over the paddle shows `grab`, and `grabbing` while pressed. Draw the red `Grab` pill label next to the paddle on hover or drag.

### 7.2 Mobile

| Input | Action |
|---|---|
| Touch and drag anywhere on the lower half | Moves the paddle (with a small offset above the finger so it stays visible) |
| Tap | Serve, or restart |
| Optional: drag up quickly | Swing for extra power |

Implementation notes:
- Use Pointer Events with `touch-action: none` on the canvas to stop page scroll and pinch.
- Handle `pointercancel` and multi-touch by tracking a single active `pointerId`.
- Show the hint caption by input type: desktop shows `Arrow keys to move · Space to serve`, and touch shows `Drag to move · Tap to serve`.
- Add a first-gesture handler to unlock audio on iOS.
- Use `viewport-fit=cover`, and lock to the safe area for the footer pill.

---

## 8. Rendering and Art Direction

### 8.1 Palette (sampled from the frames)

| Token | Hex (approx.) | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | Page background |
| `--table` | `#0A8CFF` | Table surface |
| `--table-edge` | `#0070D6` | Table front thickness |
| `--net` | `#8CCBFF` at 60% | Net band |
| `--ink` | `#111111` | Outlines, net posts, numerals |
| `--paddle-red` | `#D23B3B` | Player paddle |
| `--paddle-blue` | `#3F78BE` | Opponent paddle |
| `--bubble` | `#F23B3B` | Speech bubble and Grab label |
| `--shadow` | `#0A4F99` at 45% | Paddle and ball shadow on the table |
| `--muted` | `#8A8A8A` | Labels, caption, score dot |

### 8.2 Hand-drawn look

- All outlines use a thick (about 4–6 px at design size), round-cap, round-join black stroke.
- `sketch.ts` provides `wobblyPath(points, jitter)`, which applies a small, **seeded** per-vertex offset (about 1–1.5 px) so shapes feel hand-inked but don't shimmer every frame. Re-seed only on state changes.
- The character head is a blobby closed path (about 10 control points, Catmull-Rom smoothed). Eyes are two small circles with pupils, and the mouth is an oval.
- Paddle: rounded face, a white highlight arc at the upper left, a white handle with a black outline, and a small hand icon on the face as the grip affordance.

### 8.3 Draw order (back to front)

1. Background and scoreboard
2. Opponent character and speech bubble
3. Opponent paddle (and its shadow)
4. Table surface, lines and front edge
5. Ball shadow, then the ball if `z > net` (far side)
6. Net band, posts and cord
7. Ball if `z ≤ net` (near side)
8. Player paddle shadow, then the player paddle
9. `Grab` tooltip
10. Caption (HTML or canvas) and footer pill (HTML)

### 8.4 Animations

| Element | Animation |
|---|---|
| Score numeral | On change: a quick scale pop (1 → 1.2 → 1 over 250 ms) |
| Speech bubble | Pop in with a small scale and overshoot, hold about 0.9 s, fade out over 0.3 s |
| Opponent head | Slide in x toward the ball (easing), a gentle bob with a sine of about 2–3 px, and an expression swap with a 1-frame squash |
| Paddles | Tilt with velocity, squash on hit |
| Ball | Squash on bounce, and a faint motion trail (3 ghost frames at 20%, 12%, 6% alpha) at high speed |
| Net | A small shimmer when the ball touches it |

### 8.5 Speech bubble lines

**[Assumption]** Short, reaction-based lines. Keep to one or two words.

- Player scores: `Hey!`, `Ouch!`, `Nice!`
- AI scores: `Ha!`, `Gotcha!`
- Net or fault: `Oops!`

---

## 9. HUD, Copy and Footer

- Scoreboard: `[You] · [Opponent]` in a large serif (about 56 px on desktop, scaling down to about 40 px on small phones), with labels in 11–12 px grey.
- Caption under the table (see §7.2 for the touch variant).
- **Footer pill**: a rounded pill with a soft shadow, holding three items separated by thin vertical dividers: an email (serif), `Instagram`, and `X`. **Replace these with your own details and links.** The reference shows another creator's contact info, so don't ship it as is.
- The opponent name (`Ahmed` in the frames) should be a config value. **Use your own name or character name.**

> **Originality note:** Build your own character art and name. The frames are a reference for layout, motion and feel, so don't copy the original character drawing or the creator's branding.

---

## 10. Audio

Short synthesized sounds, all through one `AudioContext` with a master gain and a mute toggle (`M` key, and a small speaker icon on mobile):

| Event | Sound |
|---|---|
| Paddle hit | A short, bright "tok" (a 600–900 Hz blip, 40 ms) |
| Table bounce | A softer "tick" (400 Hz, 25 ms) |
| Net touch | A dull thud |
| Point won | A rising two-note chime |
| Point lost | A falling two-note tone |

Start the context only after the first user gesture.

---

## 11. Responsive Behavior Checklist

- [ ] Canvas scales to fit any viewport without scroll, and the page never scrolls.
- [ ] Table and paddles are fully visible in portrait at 360 × 640 up to 1440 × 900 and beyond.
- [ ] The paddle touch target is at least 44 px, and the drag point sits above the finger.
- [ ] The footer pill wraps cleanly (smaller font) below 380 px and respects the safe-area inset.
- [ ] Orientation change keeps the game state and recomputes the layout.
- [ ] `devicePixelRatio` scaling is handled on resize and on moving between monitors.
- [ ] The loop pauses on `visibilitychange` (tab hidden), and resumes without a time jump.
- [ ] `prefers-reduced-motion` turns off screen shake and ball trails.

---

## 12. Build Plan (Milestones)

1. **Scaffold**: Vite and TypeScript, canvas, resize and DPR handling, the fixed-timestep loop.
2. **Static scene**: projection, table, net, scoreboard, caption and footer pill matching the frames.
3. **Player paddle**: keyboard and pointer-drag movement, tilt, shadow and `Grab` tooltip.
4. **Ball physics**: serve, gravity, table bounce, net, and the paddle hit.
5. **Opponent AI**: tracking, return logic, and difficulty ramp.
6. **Scoring and rules**: points, server rotation, win condition, game over and restart.
7. **Character and polish**: expressions, speech bubbles, wobbly strokes, squash and stretch.
8. **Mobile**: touch control tuning, portrait layout, safe areas, audio unlock.
9. **Audio and settings**: sounds, mute, optional difficulty select.
10. **QA and deploy**: device testing, performance pass, static deploy.

---

## 13. Acceptance Criteria

- The first frame resembles the reference: white page, a blue perspective table with a translucent net, red player paddle, blue opponent paddle, a floating character, serif scoreboard, caption and footer pill.
- A full game to 11 can be played start to finish on both desktop (keys and mouse) and a phone (touch) with no layout breakage.
- Ball size, paddle size and shadows visibly scale with depth.
- The paddle tilts with movement, and the character changes expression with a `Hey!` bubble when the player returns or scores.
- The game holds **60 fps** on a mid-range phone and has no page scroll or zoom during play.
- No external image assets are required (everything is drawn in code), and the total bundle is under about 150 KB gzipped.

---

## 14. Tunable Constants (`config.ts`)

```ts
export const CONFIG = {
  winScore: 11,
  winBy: 2,
  opponentName: "Opponent",     // change me
  gravity: 9.8,
  restitution: 0.85,
  netHeight: 0.1525,
  tableW: 1.525,
  tableL: 2.74,
  paddleSmooth: 0.12,           // seconds
  aiReactionMs: [80, 250],
  aiErrorSigma: [0.02, 0.12],   // meters, hard → easy
  bubbleHoldMs: 900,
  pointFreezeMs: 1200,
  footer: { email: "you@example.com", instagram: "#", x: "#" },
};
```

---

## 15. Open Questions

1. Target score: is 11 (win by 2) right, or something shorter like 5 or 7?
2. Should the paddle move in depth (toward the net) on mobile, or only left and right for simplicity?
3. Do you want a difficulty selector, or a single adaptive mode?
4. Do you want your own character, or a few selectable opponents?
5. Is sound on by default, or muted until the user turns it on?
