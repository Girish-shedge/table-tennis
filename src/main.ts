import "./ui/styles.css";
import "./ui/footer.css";
import "./ui/mp.css";

import { Audio } from "./audio";
import { COLORS, CONFIG, NET, type Difficulty } from "./config";
import { Input } from "./game/input";
import { Game, type GameEvent, type PointReason } from "./game/state";
import { drawBall, drawBallShadow, hiddenByTable } from "./render/ball";
import { Bubble, drawGrabTooltip } from "./render/bubble";
import { Character } from "./render/character";
import { Hud } from "./render/hud";
import { AI_STYLE, PLAYER_STYLE, drawPaddle, drawPaddleShadow, paddleScreen } from "./render/paddle";
import { Projection, computeLayout, type Layout } from "./render/projection";
import { drawNet, drawTable } from "./render/table";
import { drawServePreview } from "./render/preview";
import { inSweetSpot, outRisk } from "./game/shot";
import { net } from "./net/client";
import { OnlineMatch } from "./net/hostSim";
import { COPY, truncateName } from "./strings";
import { mountMultiplayer } from "./ui/screens";
import { mountIcons } from "./ui/icons";
import { mountPress } from "./ui/press";
import { loadName, saveName } from "./net/profile";
import { sanitizeName } from "../shared/names";
import { AVATARS, avatarSvg } from "./ui/avatars";
import { peer } from "./net/peer";

// ---- DOM ------------------------------------------------------------------

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const overlayStart = $<HTMLDivElement>("overlay-start");
const overlayOver = $<HTMLDivElement>("overlay-over");
const controls = $<HTMLDivElement>("controls");
const btnMute = $<HTMLButtonElement>("btn-mute");
const modeLabel = $<HTMLSpanElement>("mode-label");
const overTitle = $<HTMLHeadingElement>("over-title");
const overScore = $<HTMLParagraphElement>("over-score");

$<HTMLAnchorElement>("footer-contact").href = CONFIG.contact.href;

// ---- Systems --------------------------------------------------------------

const game = new Game();
const audio = new Audio();
const hud = new Hud();
const bubble = new Bubble();
const character = new Character();
const P = new Projection();
let layout: Layout = computeLayout(window.innerWidth, window.innerHeight);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Dev-only: the host returns everything and the guest misses, so a match can finish. */
const driveMiss = import.meta.env.DEV && new URLSearchParams(location.search).get("drive") === "miss";
let drovePoint = -1;

let shake = 0;
let netShimmer = 0;

let mpEscape = () => {};
let online: OnlineMatch | null = null;
let mpYou = "";
let mpThem = "";
let selfEmote = "";
let selfEmoteAt = -1e9;

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
    if (online) online.primary();
    else game.primary();
  },
  onMute: () => setMuted(!audio.muted),
  onEscape: () => {
    if (!overlayLeave.hidden) closeLeaveBot();
    else if (online) mpEscape();
    else askLeaveBot();
  },
});

// Make sure the canvas fonts are ready (canvas redraws every frame, so it picks them up).
void Promise.all([
  document.fonts.load('700 40px "SF Cartoonist Hand"'),
  document.fonts.load('400 16px "SF Cartoonist Hand"'),
  document.fonts.load('italic 400 16px "SF Cartoonist Hand"'),
]);

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

function themName() {
  return mpThem ? truncateName(mpThem) : CONFIG.opponentName;
}

function reasonText(winner: "player" | "ai", reason: PointReason): string {
  switch (reason) {
    case "out":
      return COPY.out;
    case "net":
      return COPY.net;
    case "double":
      return COPY.double;
    case "fault":
      return COPY.fault;
    case "missed":
      return winner === "player" ? `${themName()} ${COPY.missedThem}` : COPY.missedYou;
  }
}

game.on((e: GameEvent) => {
  // Power is spent on every shot you play, and starts from zero each point.
  if (((e.type === "serve" || e.type === "hit") && e.by === "player") || e.type === "point") input.resetPull();
  switch (e.type) {
    case "serve":
      audio.hit(0.6);
      break;
    case "hit":
      audio.hit(e.by === "player" ? 1 : 0.7);
      if (e.by === "player") {
        if (!reducedMotion) shake = 1;
        character.setMood("shock", 380, game.now);
        if (!game.externalSim && Math.random() < 0.3) bubble.show(pick(RETURN_LINES), game.now);
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
        if (!game.externalSim) bubble.show(aiOwnFault ? "Oops!" : pick(PLAYER_SCORE_LINES), game.now);
      } else {
        audio.pointLost();
        character.setMood("happy", 1300, game.now);
        if (!game.externalSim) bubble.show(pick(AI_SCORE_LINES), game.now);
      }
      break;
    }
    case "gameover": {
      if (game.externalSim) {
        overlayOver.hidden = true;
        break;
      }
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
  input.resetPull();
  mpYou = "";
  mpThem = "";
  peer.reset();
  modeLabel.textContent = CONFIG.difficulty[d].label;
  overlayStart.hidden = true;
  overlayOver.hidden = true;
  controls.hidden = false;
  $<HTMLButtonElement>("btn-conn").hidden = true;
  $<HTMLButtonElement>("btn-leave").hidden = false;
  $<HTMLElement>("btn-mode").hidden = false;
  (document.activeElement as HTMLElement | null)?.blur?.();
}

/** Shared behaviour for the home-page dialogs: backdrop click and Esc close, keys never reach the game. */
function wireDialog(el: HTMLElement, close: () => void) {
  el.addEventListener("click", (e) => {
    if (e.target === el) close();
  });
  el.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") close();
  });
}

// "You vs Bot" opens the Game mode dialog; choosing a mode starts the match.
const modeDialog = $<HTMLDivElement>("mode-dialog");
const vsBotBtn = $<HTMLButtonElement>("btn-vsbot");
function closeMode() {
  modeDialog.hidden = true;
  vsBotBtn.focus();
}
vsBotBtn.addEventListener("click", () => {
  modeDialog.hidden = false;
  modeDialog.querySelector<HTMLButtonElement>('.option[data-mode="medium"]')?.focus();
});
for (const btn of Array.from(modeDialog.querySelectorAll<HTMLButtonElement>(".option"))) {
  btn.addEventListener("click", () => {
    modeDialog.hidden = true;
    startMatch(btn.dataset.mode as Difficulty);
  });
}
$("mode-cancel").addEventListener("click", closeMode);
wireDialog(modeDialog, closeMode);

// How to play.
const helpDialog = $<HTMLDivElement>("help-dialog");
const helpBtn = $<HTMLButtonElement>("btn-help");
function closeHelp() {
  helpDialog.hidden = true;
  helpBtn.focus();
}
helpBtn.addEventListener("click", () => {
  helpDialog.hidden = false;
  $("help-done").focus();
});
$("help-done").addEventListener("click", closeHelp);
wireDialog(helpDialog, closeHelp);

// Leaving a match against Bot: the close button (or Esc) asks first, and the game waits meanwhile.
const overlayLeave = $<HTMLDivElement>("overlay-leave");
function askLeaveBot() {
  if (online || game.phase === "MENU" || !overlayStart.hidden || !overlayLeave.hidden) return;
  dev.paused = true;
  overlayLeave.hidden = false;
  $("btn-stay").focus();
}
function closeLeaveBot() {
  overlayLeave.hidden = true;
  dev.paused = false;
}
$("btn-stay").addEventListener("click", closeLeaveBot);
$("btn-quit").addEventListener("click", () => {
  closeLeaveBot();
  controls.hidden = true;
  showMenu();
});
$("btn-leave").addEventListener("click", askLeaveBot);
$("btn-again").addEventListener("click", () => startMatch(game.difficulty));
$("btn-change").addEventListener("click", showMenu); // only reachable once a match has ended
overlayOver.addEventListener("click", (e) => {
  if (game.externalSim) return;
  // Tap anywhere outside the buttons to play again.
  if (!(e.target instanceof HTMLElement && e.target.closest("button"))) startMatch(game.difficulty);
});
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

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("#emotes button"))) {
  const id = Number(btn.dataset.emote);
  btn.textContent = COPY.emotes[id] ?? "";
  btn.addEventListener("click", () => {
    if (!online) return;
    const text = COPY.emotes[id];
    if (!text) return;
    net.send({ t: "emote", id });
    selfEmote = text;
    selfEmoteAt = game.now;
  });
}

$("over-hint").textContent = input.kind === "touch" ? "Tap to play again" : "Space or tap to play again";

mountIcons();
mountPress();

// ---- Power bar ------------------------------------------------------------

const powerBar = $<HTMLDivElement>("power");
const powerState = $<HTMLSpanElement>("power-state");
let shownPower = -1;

/** Writes only when the rounded value changes, so the bar costs nothing while it is still. */
function paintPower(p: number) {
  const pct = Math.round(p * 100);
  if (pct === shownPower) return;
  shownPower = pct;
  const sweet = inSweetSpot(p);
  const risky = outRisk(p) > 0;
  powerBar.style.setProperty("--power", String(pct / 100));
  powerBar.classList.toggle("sweet", sweet);
  powerBar.classList.toggle("risky", risky);
  const state = risky ? COPY.powerRisky : sweet ? COPY.powerSweet : pct === 0 ? COPY.powerSoft : COPY.powerCharging;
  powerState.textContent = state;
  powerBar.setAttribute("aria-valuenow", String(pct));
  powerBar.setAttribute("aria-valuetext", `${pct}%, ${state}`);
}
paintPower(0);

// ---- Player avatars -------------------------------------------------------

peer.onChange(() => syncCharacter());

/** The far-end head is Bot's, or the friend's chosen avatar once we know it. */
let shownAvatar: string | null = null;
function syncCharacter() {
  const want = mpThem && peer.theirs ? peer.theirs : null;
  if (want === shownAvatar) return;
  shownAvatar = want;
  character.setAvatar(want);
}

const picker = $<HTMLDivElement>("avatar-picker");
const avatarDialog = $<HTMLDivElement>("avatar-dialog");
const profileBtn = $<HTMLButtonElement>("btn-profile");
function paintPicker() {
  for (const node of Array.from(picker.querySelectorAll<HTMLButtonElement>(".avatar"))) {
    node.setAttribute("aria-checked", String(node.dataset.id === peer.mine));
  }
  $("profile-btn-face").innerHTML = avatarSvg(peer.mine);
}
for (const a of AVATARS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "avatar";
  btn.dataset.id = a.id;
  btn.setAttribute("role", "radio");
  btn.setAttribute("aria-label", a.label);
  btn.innerHTML = `${a.svg}<span class="avatar-name">${a.label}</span>`;
  btn.addEventListener("click", () => {
    peer.setMine(a.id);
    paintPicker();
  });
  picker.append(btn);
}
paintPicker();
// My player: name and avatar in one dialog, opened from the chip at the top of the home page.
const nameField = $<HTMLInputElement>("profile-name-field");
const nameError = $<HTMLParagraphElement>("profile-name-error");
let myName = loadName().name;
$("profile-btn-name").textContent = myName;
function closeAvatars() {
  avatarDialog.hidden = true;
  profileBtn.focus();
}
function saveProfile() {
  const clean = sanitizeName(nameField.value);
  if (!clean) {
    nameError.textContent = COPY.nameError;
    nameField.setAttribute("aria-invalid", "true");
    nameField.focus();
    return;
  }
  myName = clean;
  saveName(clean);
  $("profile-btn-name").textContent = clean;
  mp?.setName(clean);
  closeAvatars();
}
profileBtn.addEventListener("click", () => {
  nameField.value = myName;
  nameError.textContent = "";
  nameField.removeAttribute("aria-invalid");
  avatarDialog.hidden = false;
  nameField.focus();
  nameField.select();
});
$("avatar-done").addEventListener("click", saveProfile);
nameField.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveProfile();
});
wireDialog(avatarDialog, closeAvatars);

// The power bar follows the top bar: visible during a match, hidden on the home page.
new MutationObserver(() => {
  powerBar.hidden = controls.hidden;
}).observe(controls, { attributes: true, attributeFilter: ["hidden"] });

const mp = mountMultiplayer({
  unlock: () => audio.unlock(),
  onMatch: (session) => {
    overlayStart.hidden = true;
    overlayOver.hidden = true;
    controls.hidden = false;
    mpYou = session.myName;
    mpThem = session.peerName || "Friend";
    input.resetPull();
    online?.stop();
    $("emotes").hidden = false;
    void lockWake();
    online = new OnlineMatch(game, net, session.role === "guest" ? "guest" : "host", (youWon, you, them) => {
      if (online) online.paused = true;
      mp?.noteResult(youWon, you, them);
    }, {
      onGuestEvent: (e) => game.emitMp(e),
      onFriendEmote: (id) => {
        const text = COPY.emotes[id];
        if (text) bubble.show(text, game.now);
      },
    });
  },
  onLeave: () => {
    online?.stop();
    online = null;
    mpYou = "";
    mpThem = "";
    peer.reset();
    controls.hidden = true;
    $("emotes").hidden = true;
    unlockWake();
    showMenu();
  },
  setEscape: (fn) => {
    mpEscape = fn;
  },
});

// The multiplayer screens may already have set the name (they own the default "Player NNN").
myName = $("profile-btn-name").textContent || myName;

const dev = { paused: false };
if (import.meta.env.DEV) {
  (window as unknown as { __tt: unknown }).__tt = {
    game,
    input,
    startMatch,
    Game,
    dev,
    character,
    hud,
    // Visual QA only: pretend a friend with this name and avatar is the opponent.
    fakeFriend: (name: string, avatar: string) => {
      startMatch("medium");
      mpYou = "Girish";
      mpThem = name;
      peer.devSetTheirs(avatar);
    },
  };
}

// ---- Render ---------------------------------------------------------------

function headAnchor() {
  const p = P.project(game.aiPaddle.pos.x * 0.85, CONFIG.headHeight, CONFIG.tableL);
  return { x: p.x, y: p.y };
}

function captionText(): string {
  const touch = input.kind === "touch";
  const them = themName();
  if (online && online.strikes >= 2 && game.phase === "SERVE") return COPY.stillThere;
  if (game.phase === "SERVE" && game.server === "ai") return `${them} ${COPY.toServe}`;
  if (game.phase === "SERVE" && online) {
    const left = Math.ceil(online.serveLeftMs / 1000);
    const base = touch ? COPY.serveYouTouch : COPY.serveYouKeys;
    return `${base} · ${left}`;
  }
  if (game.phase === "SERVE") return touch ? COPY.serveYouTouch : COPY.serveYouKeys;
  if (game.phase === "GAME_OVER") return "";
  return touch ? COPY.rallyTouch : COPY.rallyKeys;
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
  hud.drawScore(
    ctx,
    layout,
    game.score,
    game.now,
    mpYou ? truncateName(mpYou) : CONFIG.playerName,
    mpThem ? truncateName(mpThem) : CONFIG.opponentName,
  );

  if (game.phase !== "MENU") {
    const ball = game.ball;
    const ballScreen = ball.visible ? P.project(ball.pos.x, ball.pos.y, ball.pos.z) : null;

    // 2. Character and bubble.
    character.draw(ctx, P, ballScreen);
    const ba = character.bubbleAnchor(P);
    bubble.draw(ctx, game.now, ba.x, ba.y, s);
  }

  // A ball that has dropped below the table behind its far end is hidden by the table.
  const behindTable = game.phase !== "MENU" && game.ball.pos.y < 0 && game.ball.pos.z > CONFIG.tableL;
  if (behindTable) {
    drawBallShadow(ctx, P, game.ball);
    drawBall(ctx, P, game.ball, reducedMotion);
  }

  // 4. Table.
  drawTable(ctx, P, s);

  // 4b. Opponent paddle, drawn on top of the table so its shadow and handle are never cut off by the far edge.
  if (game.phase !== "MENU") {
    drawPaddleShadow(ctx, P, game.aiPaddle, AI_STYLE);
    drawPaddle(ctx, P, game.aiPaddle, AI_STYLE);
  }

  if (game.phase !== "MENU" && !behindTable) {
    const ball = game.ball;
    // 5. Ball shadow and far-side ball.
    drawBallShadow(ctx, P, ball);
    if (ball.pos.z > CONFIG.netZ && !hiddenByTable(ball)) drawBall(ctx, P, ball, reducedMotion);
  }

  // 6. Net.
  drawNet(ctx, P, s, netShimmer);

  // 6b. Your serve: dotted flight and landing ring, so you can plan where it goes.
  const preview = game.phase === "SERVE" ? game.servePreview() : null;
  if (preview) drawServePreview(ctx, P, preview, s, outRisk(game.playerPower) > 0);

  if (game.phase !== "MENU") {
    const ball = game.ball;
    // 7. Player paddle (slightly see-through), then the near-side ball always in front of it.
    drawPaddleShadow(ctx, P, game.player, PLAYER_STYLE);
    drawPaddle(ctx, P, game.player, PLAYER_STYLE, 0.8);
    if (!behindTable && ball.pos.z <= CONFIG.netZ && !hiddenByTable(ball)) drawBall(ctx, P, ball, reducedMotion);

    // 9. Grab tooltip (mouse only).
    if (selfEmote && game.now - selfEmoteAt < 900) {
      const ps = paddleScreen(P, game.player, PLAYER_STYLE);
      drawGrabTooltip(ctx, ps.x + ps.r * 0.55, ps.y + ps.r * 0.75, s, selfEmote);
    } else if (input.kind === "mouse" && (input.hovering || input.grabbing)) {
      const ps = paddleScreen(P, game.player, PLAYER_STYLE);
      drawGrabTooltip(ctx, ps.x + ps.r * 0.55, ps.y + ps.r * 0.75, s, "You");
    }
  }
  ctx.restore();

  // 10. Caption.
  if (game.phase !== "MENU") hud.drawCaption(ctx, layout, captionText(), game.now);
}

// ---- Loop -----------------------------------------------------------------

let last = performance.now();
let running = true;
let fpsFrames = 0;
let fpsStamp = performance.now();
let slowSeconds = 0;
let connNote = "";

function setConn(text: string) {
  if (connNote === text) return;
  connNote = text;
  const node = document.getElementById("conn-ping");
  if (node) node.textContent = text;
}

function frame(now: number) {
  if (!running) return;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (driveMiss && online) {
    const edge = CONFIG.tableW / 2 + CONFIG.paddleXMargin;
    if (online.role === "host") {
      input.dragTarget = {
        x: game.ball.pos.x,
        z: Math.min(CONFIG.paddleZMax, Math.max(CONFIG.paddleZMin, game.ball.pos.z)),
      };
    } else {
      input.dragTarget = { x: edge, z: CONFIG.paddleZMin };
    }
    const point = game.score.player + game.score.ai;
    if (game.phase === "SERVE" && game.server === "player" && drovePoint !== point) {
      drovePoint = point;
      online.primary();
    }
  }

  game.keyAxis = input.axis();
  game.dragTarget = input.dragTarget;
  input.tickPull(dt);
  game.playerPower = input.pull;
  if (!powerBar.hidden) paintPower(input.pull);
  if (!dev.paused) {
    if (online) online.frame(dt);
    else game.update(dt);
  }

  // Cursor feedback.
  canvas.style.cursor = input.grabbing ? "grabbing" : input.hovering ? "grab" : "default";

  syncCharacter();
  const a = headAnchor();
  character.update(dt, game.now, a.x, a.y);
  shake = Math.max(0, shake - dt * 7);
  netShimmer = Math.max(0, netShimmer - dt * 3);

  if (online) {
    fpsFrames++;
    if (now - fpsStamp >= 1000) {
      if (online.role === "host" && fpsFrames < NET.hostLowFps) slowSeconds++;
      else slowSeconds = 0;
      fpsFrames = 0;
      fpsStamp = now;
    }
    const latency = online.noteLatency();
    const quiet = online.silenceMs(performance.now());
    if (slowSeconds >= 3) setConn(COPY.deviceStruggling);
    else if (quiet > 6000) setConn(`${mpThem || "Friend"} ${COPY.steppedAway}`);
    else if (quiet > 2500 || latency === "wait") setConn(`${COPY.waiting} ${mpThem || "Friend"}…`);
    else if (latency === "slow") setConn(COPY.slowConnection);
    else setConn(`${net.rttMs} ms`);
  }

  // On the home page and lobby screens nothing on the canvas moves, so draw rarely and leave the CPU
  // to the page's own animations (the bouncing ball) and the network.
  if (game.phase !== "MENU" || now - lastIdleDraw > 500) {
    lastIdleDraw = now;
    render();
  }
  requestAnimationFrame(frame);
}
let lastIdleDraw = 0;
requestAnimationFrame(frame);

let wakeLock: WakeLockSentinel | null = null;

async function lockWake() {
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    wakeLock = null;
  }
}

function unlockWake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (online) {
      if (online.role === "host") net.send({ t: "pause", reason: "host_hidden" });
      else net.send({ t: "away" });
      online.paused = true;
    }
    running = false;
  } else if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
    if (online) {
      window.setTimeout(() => {
        if (!online) return;
        if (online.role === "host") net.send({ t: "resume", in: 2 });
        else net.send({ t: "back" });
        online.paused = false;
      }, 2000);
    }
  }
});
