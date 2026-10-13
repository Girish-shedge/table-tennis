import "./ui/styles.css";
import "./ui/footer.css";

import { Audio } from "./audio";
import { COLORS, CONFIG, type Difficulty } from "./config";
import { Input } from "./game/input";
import { Game, type GameEvent, type PointReason } from "./game/state";
import { drawBall, drawBallShadow } from "./render/ball";
import { Bubble, drawGrabTooltip } from "./render/bubble";
import { Character } from "./render/character";
import { Hud } from "./render/hud";
import { AI_STYLE, PLAYER_STYLE, drawPaddle, drawPaddleShadow, paddleScreen } from "./render/paddle";
import { Projection, computeLayout, type Layout } from "./render/projection";
import { drawNet, drawTable } from "./render/table";

// ---- DOM ------------------------------------------------------------------

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const overlayStart = $<HTMLDivElement>("overlay-start");
const overlayOver = $<HTMLDivElement>("overlay-over");
const controls = $<HTMLDivElement>("controls");
const btnMode = $<HTMLButtonElement>("btn-mode");
const btnMute = $<HTMLButtonElement>("btn-mute");
const modeLabel = $<HTMLSpanElement>("mode-label");
const overTitle = $<HTMLHeadingElement>("over-title");
const overScore = $<HTMLParagraphElement>("over-score");

$("start-opponent").textContent = CONFIG.opponentName;
$("start-score").textContent = String(CONFIG.winScore);
$<HTMLAnchorElement>("footer-instagram").href = CONFIG.footer.instagram;
$<HTMLAnchorElement>("footer-x").href = CONFIG.footer.x;
$<HTMLAnchorElement>("footer-linkedin").href = CONFIG.footer.linkedin;

// ---- Systems --------------------------------------------------------------

const game = new Game();
const audio = new Audio();
const hud = new Hud();
const bubble = new Bubble();
const character = new Character();
const P = new Projection();
let layout: Layout = computeLayout(window.innerWidth, window.innerHeight);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let shake = 0;
let netShimmer = 0;

const input = new Input(canvas, {
  toWorld: (sx, sy) => P.unprojectToPlane(sx, sy, CONFIG.paddleHover),
  hitPaddle: (sx, sy) => {
    if (game.phase === "MENU") return false;
    const ps = paddleScreen(P, game.player, PLAYER_STYLE);
    const dx = sx - ps.x;
    const dy = sy - ps.y;
    const r = Math.max(ps.r * 1.35, 30);
    const onFace = dx * dx + dy * dy < r * r;
    const onHandle = Math.abs(dx) < ps.r * 0.6 && dy > 0 && dy < ps.r * 2.3;
    return onFace || onHandle;
  },
  paddleTarget: () => ({ ...game.player.target }),
  onPrimary: () => {
    audio.unlock();
    game.primary();
  },
  onMute: () => setMuted(!audio.muted),
  onEscape: () => {
    if (game.phase !== "MENU") showMenu();
  },
});

// ---- Resize ---------------------------------------------------------------

function resize() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(W, H);
  P.update(layout);
  const a = headAnchor();
  character.snap(a.x, a.y);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 50));
resize();

// ---- Game events ----------------------------------------------------------

const PLAYER_SCORE_LINES = ["Hey!", "Ouch!", "Nice!"];
const AI_SCORE_LINES = ["Ha!", "Gotcha!"];
const RETURN_LINES = ["Hey!", "Whoa!"];
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function reasonText(winner: "player" | "ai", reason: PointReason): string {
  switch (reason) {
    case "out":
      return "Out!";
    case "net":
      return "Net!";
    case "double":
      return "Double bounce";
    case "fault":
      return "Fault";
    case "missed":
      return winner === "player" ? `${CONFIG.opponentName} missed` : "Missed!";
  }
}

game.on((e: GameEvent) => {
  switch (e.type) {
    case "serve":
      audio.hit(0.6);
      break;
    case "hit":
      audio.hit(e.by === "player" ? 1 : 0.7);
      if (e.by === "player") {
        if (!reducedMotion) shake = 1;
        character.setMood("shock", 380, game.now);
        if (Math.random() < 0.3) bubble.show(pick(RETURN_LINES), game.now);
      }
      break;
    case "bounce":
      audio.bounce();
      break;
    case "net":
      audio.net();
      netShimmer = 1;
      break;
    case "point": {
      hud.onScore(e.winner, game.now);
      hud.flash(reasonText(e.winner, e.reason), game.now);
      const aiOwnFault = e.winner === "player" && (e.reason === "out" || e.reason === "net" || e.reason === "fault");
      if (e.winner === "player") {
        audio.pointWon();
        character.setMood("dizzy", 1300, game.now);
        bubble.show(aiOwnFault ? "Oops!" : pick(PLAYER_SCORE_LINES), game.now);
      } else {
        audio.pointLost();
        character.setMood("happy", 1300, game.now);
        bubble.show(pick(AI_SCORE_LINES), game.now);
      }
      break;
    }
    case "gameover": {
      const youWon = e.winner === "player";
      overTitle.textContent = youWon ? "You win!" : `${CONFIG.opponentName} wins`;
      overScore.textContent = `${e.score.player} · ${e.score.ai}`;
      overlayOver.hidden = false;
      if (youWon) audio.win();
      else audio.lose();
      break;
    }
    case "phase":
      if (e.phase === "SERVE" || e.phase === "RALLY") overlayOver.hidden = true;
      break;
  }
});

// ---- Overlays & controls --------------------------------------------------

function showMenu() {
  game.openMenu();
  overlayOver.hidden = true;
  overlayStart.hidden = false;
}

function startMatch(d: Difficulty) {
  audio.unlock();
  game.startMatch(d);
  modeLabel.textContent = CONFIG.difficulty[d].label;
  overlayStart.hidden = true;
  overlayOver.hidden = true;
  controls.hidden = false;
  localStorage.setItem("tt-difficulty", d);
  (document.activeElement as HTMLElement | null)?.blur?.();
}

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>(".mode"))) {
  btn.addEventListener("click", () => startMatch(btn.dataset.mode as Difficulty));
}
$("btn-again").addEventListener("click", () => startMatch(game.difficulty));
$("btn-change").addEventListener("click", showMenu);
overlayOver.addEventListener("click", (e) => {
  // Tap anywhere outside the buttons to play again.
  if (!(e.target instanceof HTMLElement && e.target.closest("button"))) startMatch(game.difficulty);
});
btnMode.addEventListener("click", showMenu);
btnMute.addEventListener("click", () => {
  audio.unlock();
  setMuted(!audio.muted);
});

function setMuted(m: boolean) {
  audio.setMuted(m);
  btnMute.setAttribute("aria-pressed", String(m));
  btnMute.title = m ? "Unmute (M)" : "Mute (M)";
}
setMuted(audio.muted);

$("start-hint").textContent =
  input.kind === "touch" ? "Drag to move · Tap to serve" : "Arrow keys or drag to move · Space to serve";
$("over-hint").textContent = input.kind === "touch" ? "Tap to play again" : "Space or tap to play again";

const savedMode = localStorage.getItem("tt-difficulty") as Difficulty | null;
if (savedMode && CONFIG.difficulty[savedMode]) modeLabel.textContent = CONFIG.difficulty[savedMode].label;

drawCardArt();

const dev = { paused: false };
if (import.meta.env.DEV) {
  (window as unknown as { __tt: unknown }).__tt = { game, input, startMatch, Game, dev };
}

// ---- Render ---------------------------------------------------------------

function headAnchor() {
  const p = P.project(game.aiPaddle.pos.x * 0.85, CONFIG.headHeight, CONFIG.tableL);
  return { x: p.x, y: p.y };
}

function captionText(): string {
  const touch = input.kind === "touch";
  if (game.phase === "SERVE" && game.server === "ai") return `${CONFIG.opponentName} to serve`;
  if (game.phase === "SERVE") return touch ? "Drag to move · Tap to serve" : "Arrow keys to move · Space to serve";
  if (game.phase === "GAME_OVER") return "";
  return touch ? "Drag to move" : "Arrow keys to move · Space to serve";
}

function render() {
  const s = layout.box.s;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, layout.W, layout.H);

  ctx.save();
  if (shake > 0) {
    const amp = 3 * shake;
    ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
  }

  // 1. Scoreboard.
  hud.drawScore(ctx, layout, game.score, game.now);

  if (game.phase !== "MENU") {
    const ball = game.ball;
    const ballScreen = ball.visible ? P.project(ball.pos.x, ball.pos.y, ball.pos.z) : null;

    // 2. Character and bubble.
    character.draw(ctx, P, ballScreen);
    const ba = character.bubbleAnchor(P);
    bubble.draw(ctx, game.now, ba.x, ba.y, s);

    // 3. Opponent paddle.
    drawPaddleShadow(ctx, P, game.aiPaddle, AI_STYLE);
    drawPaddle(ctx, P, game.aiPaddle, AI_STYLE);
  }

  // 4. Table.
  drawTable(ctx, P, s);

  if (game.phase !== "MENU") {
    const ball = game.ball;
    // 5. Ball shadow and far-side ball.
    drawBallShadow(ctx, P, ball);
    if (ball.pos.z > CONFIG.netZ) drawBall(ctx, P, ball, reducedMotion);
  }

  // 6. Net.
  drawNet(ctx, P, s, netShimmer);

  if (game.phase !== "MENU") {
    const ball = game.ball;
    // 7. Near-side ball (behind the paddle unless it is closer to the camera).
    const nearBall = ball.pos.z <= CONFIG.netZ;
    const ballInFront = ball.pos.z < game.player.pos.z;
    if (nearBall && !ballInFront) drawBall(ctx, P, ball, reducedMotion);

    // 8. Player paddle.
    drawPaddleShadow(ctx, P, game.player, PLAYER_STYLE);
    drawPaddle(ctx, P, game.player, PLAYER_STYLE);
    if (nearBall && ballInFront) drawBall(ctx, P, ball, reducedMotion);

    // 9. Grab tooltip (mouse only).
    if (input.kind === "mouse" && (input.hovering || input.grabbing)) {
      const ps = paddleScreen(P, game.player, PLAYER_STYLE);
      drawGrabTooltip(ctx, ps.x + ps.r * 0.55, ps.y + ps.r * 0.75, s);
    }
  }
  ctx.restore();

  // 10. Caption.
  if (game.phase !== "MENU") hud.drawCaption(ctx, layout, captionText(), game.now);
}

// ---- Loop -----------------------------------------------------------------

let last = performance.now();
let running = true;

function frame(now: number) {
  if (!running) return;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  game.keyAxis = input.axis();
  game.dragTarget = input.dragTarget;
  if (!dev.paused) game.update(dt);

  // Cursor feedback.
  canvas.style.cursor = input.grabbing ? "grabbing" : input.hovering ? "grab" : "default";

  const a = headAnchor();
  character.update(dt, game.now, a.x, a.y);
  shake = Math.max(0, shake - dt * 7);
  netShimmer = Math.max(0, netShimmer - dt * 3);

  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    running = false;
  } else if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
});

// ---- Start-screen art -----------------------------------------------------

function drawCardArt() {
  const c = document.getElementById("card-art") as HTMLCanvasElement | null;
  if (!c) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = 140;
  const h = 110;
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // A flat stand-in projection so the paddle renderer can be reused.
  const S = 150;
  const flat = Object.create(Projection.prototype) as Projection;
  flat.scaleAt = () => S;
  flat.project = (x: number, y: number, _z: number) => ({ x: 62 + x * S, y: 40 - y * S, scale: S });

  const paddle = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, tilt: -0.4, squash: 0 };
  drawPaddle(g, flat, paddle, PLAYER_STYLE);

  // Ball.
  g.fillStyle = COLORS.white;
  g.strokeStyle = COLORS.ink;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(108, 22, 7, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}
