/**
 * The home page rally: the ball flies between the red and blue paddles in an endless loop,
 * clearing the net and bouncing once on the far half each time. The paddles move with the ball:
 * after a hit a paddle follows through towards the net, drops back to a ready spot while the other
 * side plays, then dips with the incoming ball and steps in to meet it on the inner (net) side of
 * its face, swinging through as it hits. Positions are in the hero SVG's viewBox units. It only
 * runs while the home page is on screen, and holds still (the ball over the net) for people who
 * prefer reduced motion.
 */
const SHOT_S = 1.1; // one shot, paddle to paddle
const CYCLE_S = 2 * SHOT_S;
const HIT_L = 124.5; // ball centre at the red paddle's hit: touching the middle of its inner side
const HIT_R = 305.5; // and the blue one's (mirrored about the net at x 215)
const HIT_Y = 1; // the paddle faces' centre line
const TABLE_Y = 48.5; // the centre line: the ball bounces here and its shadow runs along it
const BOUNCE_AT = 0.72; // where the ball lands, as a share of the shot
const LIFT = 50; // how far the arc rises above a straight drop, enough to clear the net
const PIVOT_L = "76 31"; // each paddle swings about its grip
const PIVOT_R = "354 31";
const SHADOW_L = 93; // paddle shadows at rest
const SHADOW_R = 337;
const BACK = 12; // backswing, degrees
const THROUGH = 12; // follow-through, degrees
const RETREAT = 14; // how far a paddle drops back from its hitting spot while the other side plays
const LUNGE = 5; // how hard it steps in through the hit
const SINK = 5; // how much lower it waits at the ready spot
const TRACK = 0.2; // share of the incoming ball's drop the paddle follows

const ease = (t: number) => t * t * (3 - 2 * t);

/** Ball height above the table at progress f (0 to 1) through a shot: an arc down to the bounce,
 *  then a shorter one up to the other paddle, both parabolas as under gravity. */
function height(f: number): number {
  const hitH = TABLE_Y - HIT_Y;
  if (f < BOUNCE_AT) {
    const u = f / BOUNCE_AT;
    return hitH * (1 - u) + 4 * LIFT * u * (1 - u);
  }
  const u = (f - BOUNCE_AT) / (1 - BOUNCE_AT);
  return hitH * (1 - (1 - u) ** 2);
}

/** Paddle angle s seconds from its hit (negative before): draw back, swing through the ball at
 *  s = 0, then settle. */
function swing(s: number): number {
  if (s < -0.4 || s >= 0.5) return 0;
  if (s < -0.1) return -BACK * ease((s + 0.4) / 0.3);
  if (s < 0.1) return -BACK + (BACK + THROUGH) * ease((s + 0.1) / 0.2);
  return THROUGH * (1 - ease((s - 0.1) / 0.4));
}

/** A paddle's offset from its hitting spot, given p (0 to 1) through the cycle from its own hit
 *  and the ball's height on screen. Forward is towards the net. Zero at the hit, moving forward. */
function footwork(p: number, ballY: number): { forward: number; down: number } {
  const away = (1 - Math.cos(2 * Math.PI * p)) / 2; // 0 at the hit, 1 at the other side's hit
  const incoming = p >= 0.5 ? TRACK * (ballY - HIT_Y) : 0;
  return {
    forward: -RETREAT * away + LUNGE * Math.sin(2 * Math.PI * p),
    down: SINK * away + incoming,
  };
}

export function mountHomeRally() {
  const $ = (id: string) => document.getElementById(id);
  const home = $("overlay-start");
  const ball = $("rally-ball");
  const shadow = $("rally-shadow");
  const red = $("rally-red");
  const blue = $("rally-blue");
  const redShadow = $("rally-red-shadow");
  const blueShadow = $("rally-blue-shadow");
  if (!home || !ball || !shadow || !red || !blue || !redShadow || !blueShadow) return;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let start = 0;

  const draw = (t: number) => {
    const shot = t < SHOT_S ? 0 : 1;
    const f = (t - shot * SHOT_S) / SHOT_S;
    const x = shot === 0 ? HIT_L + (HIT_R - HIT_L) * f : HIT_R - (HIT_R - HIT_L) * f;
    const h = height(f);
    const y = TABLE_Y - h;
    ball.setAttribute("cx", x.toFixed(2));
    ball.setAttribute("cy", y.toFixed(2));
    shadow.setAttribute("cx", x.toFixed(2));
    shadow.setAttribute("rx", (5.5 * (1 - h / 160)).toFixed(2));
    shadow.setAttribute("opacity", (1 - h / 110).toFixed(2));

    // Red hits at t = 0, blue at t = SHOT_S.
    const redS = t < SHOT_S ? t : t - CYCLE_S;
    const blueS = t - SHOT_S;
    const r = footwork(t / CYCLE_S, y);
    const b = footwork(((t + SHOT_S) % CYCLE_S) / CYCLE_S, y);
    red.setAttribute(
      "transform",
      `translate(${r.forward.toFixed(2)} ${r.down.toFixed(2)}) rotate(${swing(redS).toFixed(2)} ${PIVOT_L})`,
    );
    blue.setAttribute(
      "transform",
      `translate(${(-b.forward).toFixed(2)} ${b.down.toFixed(2)}) rotate(${(-swing(blueS)).toFixed(2)} ${PIVOT_R})`,
    );
    redShadow.setAttribute("cx", (SHADOW_L + r.forward).toFixed(2));
    blueShadow.setAttribute("cx", (SHADOW_R - b.forward).toFixed(2));
  };

  const tick = (now: number) => {
    draw(((now - start) / 1000) % CYCLE_S);
    frame = requestAnimationFrame(tick);
  };

  const update = () => {
    const run = !home.hidden && document.visibilityState === "visible" && !still.matches;
    if (run && !frame) {
      start = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (!run && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (!run) draw(SHOT_S / 2);
  };

  update();
  document.addEventListener("visibilitychange", update);
  still.addEventListener("change", update);
  new MutationObserver(update).observe(home, { attributes: true, attributeFilter: ["hidden"] });
}
