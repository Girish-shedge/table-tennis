/**
 * Player avatars: the same hand-inked blob head and nose as Bot, with six
 * looks. Chunky ink outlines, white skin, and the court blue and paddle red as
 * the only colours (plus a little star yellow). Markup is static, no user text.
 *
 * Every look also has the four moods Bot has in a match (watch, shock, dizzy,
 * happy), so when you play a friend their chosen face reacts the same way.
 */

const INK = "#111";
const BLUE = "#0a8cff";
const RED = "#f23b3b";
const YELLOW = "#ffc83d";

const HEAD = "M35 5c15 0 25 11 25 27 0 17-11 27-26 27C19 59 9 49 9 35c0-7 3-13 8-18 5-7 11-12 18-12z";
const NOSE = "M17 29c-7-4-14 0-13 6 1 5 7 6 13 3";
/** Soft blue shade on the lower right, like the paddles. Drawn inside the outline. */
const SHADE = "M56 21c4 12 1 24-9 31-8 5-19 6-27 1 15 2 32-7 36-32z";

const S = `stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;

export type AvatarMood = "watch" | "shock" | "dizzy" | "happy";

function eye(cx: number, cy: number, dx = 0, dy = 0, r = 6.5, pr = 3) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" ${S} stroke-width="2.8"/><circle cx="${cx + dx}" cy="${cy + dy}" r="${pr}" fill="${INK}"/><circle cx="${cx + dx - 1}" cy="${cy + dy - 1.2}" r="0.9" fill="#fff"/>`;
}

function cheeks(y = 43) {
  return `<ellipse cx="22" cy="${y}" rx="4" ry="2.8" fill="${RED}" opacity="0.28"/><ellipse cx="51" cy="${y - 1}" rx="4" ry="2.8" fill="${RED}" opacity="0.28"/>`;
}

function spiralPath(cx: number, cy: number, r: number) {
  let d = "";
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const a = t * 1.8 * Math.PI * 2;
    const rr = r * t;
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  return d;
}

function spiral(cx: number, cy: number) {
  return `<circle cx="${cx}" cy="${cy}" r="8" fill="#fff" ${S} stroke-width="2.6"/><path d="${spiralPath(cx, cy, 6.4)}" fill="none" ${S} stroke-width="1.6"/>`;
}

function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${YELLOW}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
}

const STARS = `${star(13, 9, 6)}${star(33, 3, 5)}${star(55, 9, 6)}`;
const SWEAT = `<path d="M58 13c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="#bfe1ff" ${S} stroke-width="2"/>`;

/**
 * Several shapes start from the shared stroke (S) and then set their own width, which leaves two
 * stroke-width attributes on one tag. HTML shrugs that off; an SVG loaded as an image (strict XML) does not.
 * Keep the last one on each tag.
 */
function dedupeStroke(svg: string): string {
  return svg.replace(/<[^>]+>/g, (tag) => {
    const found = tag.match(/ stroke-width="[^"]*"/g);
    if (!found || found.length < 2) return tag;
    const last = found[found.length - 1];
    let seen = 0;
    return tag.replace(/ stroke-width="[^"]*"/g, () => (++seen === found.length ? last : ""));
  });
}

function wrap(inner: string, sprite = false) {
  // The sprite is drawn on the game canvas, so its box is a little larger to keep stars and sparkles whole.
  const open = sprite
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -8 76 76" width="228" height="228" fill="none">`
    : `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">`;
  return (
    open +
    `<path d="${NOSE}" fill="#fff" ${S}/>` +
    `<path d="${HEAD}" fill="#fff"/><path d="${SHADE}" fill="#d6e9ff"/><path d="${HEAD}" ${S}/>` +
    `${inner}</svg>`
  );
}

export interface Avatar {
  id: string;
  label: string;
  svg: string;
}

interface Look {
  id: string;
  label: string;
  /** Left and right eye centres, and the mouth centre. Moods reuse them so the face stays in place. */
  eyes: [[number, number], [number, number]];
  eyeR?: number;
  mouth: [number, number];
  cheekY: number;
  /** Eyes are covered (shades), so moods only change the mouth and brows. */
  shades?: boolean;
  /** The signature face, shown while watching (and while dizzy for the Dizzy look). */
  face: string;
  /** Hats, bands, shades and sparkles, drawn on top in every mood. */
  top: string;
}

const LOOKS_DEF: Look[] = [
  {
    // Wow: wide eyes looking up, open mouth, raised brows.
    id: "wow",
    label: "Wow",
    eyes: [[31, 29], [47, 28]],
    mouth: [40, 47],
    cheekY: 44,
    face:
      `<path d="M25 17c3-3 7-3 10 0M43 16c3-3 7-3 10 0" ${S} stroke-width="2.6"/>` +
      `${eye(31, 29, 1.6, -1.8)}${eye(47, 28, 1.6, -1.8)}${cheeks(44)}` +
      `<ellipse cx="40" cy="47" rx="6.5" ry="5.5" fill="${INK}"/><ellipse cx="40" cy="50" rx="3.6" ry="2.2" fill="${RED}"/>`,
    top: "",
  },
  {
    // Cap: court-blue cap, big grin.
    id: "cap",
    label: "Cap",
    eyes: [[31, 35], [47, 34]],
    mouth: [39, 51],
    cheekY: 46,
    face: `${eye(31, 35)}${eye(47, 34)}${cheeks(46)}<path d="M29 47c3 9 17 9 20 0z" fill="${INK}" ${S} stroke-width="2.6"/>`,
    top:
      `<path d="M10 28C8 11 24 2 38 3c13 1 21 10 22 22-10-5-35-8-50 3z" fill="${BLUE}" ${S}/>` +
      `<path d="M38 4c-4 7-4 13 0 19" ${S} stroke-width="2"/><circle cx="38" cy="4" r="2.4" fill="#fff" ${S} stroke-width="2"/>` +
      `<path d="M50 22c6-1 11 1 12 5-6 3-12 2-17 0z" fill="${BLUE}" ${S}/>`,
  },
  {
    // Cool: shades, smirk, sparkle.
    id: "cool",
    label: "Cool",
    eyes: [[26, 33], [49, 32]],
    mouth: [38, 50],
    cheekY: 46,
    shades: true,
    face: `<path d="M28 50c6 5 14 3 19-3" ${S} stroke-width="3"/>${cheeks(46)}`,
    top:
      `<path d="M16 25h19v11c0 4-4 7-9.5 7S16 40 16 36z" fill="${INK}"/><path d="M39 24h19v11c0 4-4 7-9.5 7S39 39 39 35z" fill="${INK}"/>` +
      `<path d="M35 28c2-2 2-2 4 0" ${S} stroke-width="2.6"/><path d="M16 27l-5-2" ${S} stroke-width="2.6"/>` +
      `<path d="M21 30l5-3M44 29l5-3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M58 7l5-4M60 14l4 1M52 2l1-3" ${S} stroke-width="2.6"/>`,
  },
  {
    // Fierce: red headband, angry brows, gritted teeth.
    id: "fierce",
    label: "Fierce",
    eyes: [[31, 43], [47, 42]],
    eyeR: 5,
    mouth: [38, 50],
    cheekY: 48,
    face:
      `${eye(31, 43, 0, 0.8, 5, 2.4)}${eye(47, 42, 0, 0.8, 5, 2.4)}` +
      `<path d="M23 35l12 3M58 34l-11 4" ${S} stroke-width="3.2"/>` +
      `<path d="M31 50h15v5c-5 3-10 3-15 0z" fill="#fff" ${S} stroke-width="2.6"/><path d="M38.500 50v7" ${S} stroke-width="1.8"/>`,
    top:
      `<path d="M10 22c16-8 37-8 50 0l-1 10c-16-6-33-6-48 0z" fill="${RED}" ${S}/>` +
      `<path d="M57 24l8-6-1 9 5 6-12-1z" fill="${RED}" ${S} stroke-width="2.6"/>`,
  },
  {
    // Dizzy: spiral eyes, little "o" mouth, orbiting stars.
    id: "dizzy",
    label: "Dizzy",
    eyes: [[31, 30], [48, 29]],
    mouth: [40, 49],
    cheekY: 46,
    face:
      `${spiral(31, 30)}${spiral(48, 29)}${cheeks(46)}` +
      `<ellipse cx="40" cy="49" rx="3.6" ry="4.6" fill="#fff" ${S} stroke-width="2.6"/>${STARS}`,
    top: "",
  },
  {
    // Wink: one eye shut, big grin, tongue out.
    id: "wink",
    label: "Wink",
    eyes: [[31, 30], [47, 30]],
    mouth: [38, 49],
    cheekY: 44,
    face:
      `${eye(31, 30, 1.2, -0.6)}<path d="M41 31c3-6 10-6 13 0" ${S} stroke-width="3"/>` +
      `<path d="M24 44c6 9 19 9 26 0z" fill="${INK}" ${S} stroke-width="2.6"/>` +
      `<path d="M35 51c0 8 10 8 10 0z" fill="${RED}" ${S} stroke-width="2.4"/>${cheeks(44)}`,
    top: `<path d="M59 9l5-2M60 17l5 1M56 2l2-3" ${S} stroke-width="2.6"/>`,
  },
];

/** The part of the face that changes with the mood. */
function moodFace(look: Look, mood: AvatarMood): string {
  if (mood === "watch") return look.face;
  if (mood === "dizzy" && look.id === "dizzy") return look.face;
  const [l, r] = look.eyes;
  const er = look.eyeR ?? 6.5;
  const [mx, my] = look.mouth;
  let eyes = "";
  let mouth = "";
  let extra = "";
  if (mood === "shock") {
    mouth = `<ellipse cx="${mx}" cy="${my}" rx="4.6" ry="6" fill="${INK}"/>`;
    extra = SWEAT;
    eyes = look.shades
      ? `<path d="M17 21c3-4 8-4 12 0M41 20c3-4 8-4 12 0" ${S} stroke-width="2.6"/>`
      : `${eye(l[0], l[1], 0, 0, er + 1.4, 1.9)}${eye(r[0], r[1], 0, 0, er + 1.4, 1.9)}`;
  } else if (mood === "happy") {
    mouth =
      `<path d="M${mx - 10} ${my - 3}c2 13 18 13 20 0z" fill="${INK}" ${S} stroke-width="2.6"/>` +
      `<path d="M${mx - 4} ${my + 4.5}c0 5 8 5 8 0z" fill="${RED}" ${S} stroke-width="2"/>`;
    eyes = look.shades
      ? ""
      : [l, r].map(([x, y]) => `<path d="M${x - 6.5} ${y + 3}q6.500 -10 13 0" ${S} stroke-width="3.2"/>`).join("");
    extra = look.shades ? `<path d="M2 12l4 3M4 4l4 4" ${S} stroke-width="2.6"/>` : "";
  } else {
    // dizzy
    mouth = `<path d="M${mx - 6} ${my}q3 -4 6 0t6 0" ${S} stroke-width="2.8"/>`;
    extra = STARS;
    eyes = look.shades
      ? [l, r]
          .map(([x, y]) => `<path d="${spiralPath(x, y, 6)}" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/>`)
          .join("")
      : `${spiral(l[0], l[1])}${spiral(r[0], r[1])}`;
  }
  return `${eyes}${cheeks(look.cheekY)}${mouth}${extra}`;
}

function build(look: Look, mood: AvatarMood, sprite = false): string {
  // Shades sit under the mouth in every mood, hats and bands over the face.
  const svg = wrap(`${moodFace(look, mood)}${look.top}`, sprite);
  return sprite ? dedupeStroke(svg) : svg;
}

const LOOKS: Avatar[] = LOOKS_DEF.map((l) => ({ id: l.id, label: l.label, svg: build(l, "watch") }));

/** Bot's own face, shown next to its name. Not selectable. */
const BOT: Avatar = {
  id: "bot",
  label: "Bot",
  svg: wrap(
    `<path d="M38 6c2-5 6-6 10-6" ${S} stroke-width="2.8"/><ellipse cx="50" cy="0.5" rx="4" ry="2.4" fill="#fff" ${S} stroke-width="2"/>` +
      `${eye(31, 31, 1.2, 1.4)}${eye(47, 30, 1.2, 1.4)}` +
      `<ellipse cx="39" cy="48" rx="4.6" ry="3.8" fill="${INK}"/>`,
  ),
};
export const AVATARS = LOOKS;
export const DEFAULT_AVATAR = LOOKS[0].id;
const KEY = "tt-avatar";

export function isAvatarId(id: unknown): id is string {
  return typeof id === "string" && LOOKS.some((a) => a.id === id);
}

export function loadAvatar(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (isAvatarId(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_AVATAR;
}

export function saveAvatar(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export function avatarSvg(id: string): string {
  if (id === BOT.id) return BOT.svg;
  return (LOOKS.find((a) => a.id === id) ?? BOT).svg;
}

// ---- Canvas sprites: the friend's face in the match, one per mood -----------

const sprites = new Map<string, HTMLImageElement>();

/**
 * The avatar as an image for the game canvas. The first call starts loading and
 * returns null; ask again next frame. All four moods are loaded together so a
 * reaction never waits for an image.
 */
export function avatarSprite(id: string, mood: AvatarMood): HTMLImageElement | null {
  const look = LOOKS_DEF.find((l) => l.id === id);
  if (!look) return null;
  if (!sprites.has(`${id}:watch`)) {
    for (const m of ["watch", "shock", "dizzy", "happy"] as AvatarMood[]) {
      const img = new Image();
      img.decoding = "async";
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(build(look, m, true))}`;
      sprites.set(`${id}:${m}`, img);
    }
  }
  const img = sprites.get(`${id}:${mood}`);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}
