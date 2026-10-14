/**
 * Player avatars: the same hand-inked blob head and nose as Bot, with six
 * looks. Chunky ink outlines, white skin, and the court blue and paddle red as
 * the only colours (plus a little star yellow). Markup is static, no user text.
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

function eye(cx: number, cy: number, dx = 0, dy = 0, r = 6.5, pr = 3) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" ${S} stroke-width="2.8"/><circle cx="${cx + dx}" cy="${cy + dy}" r="${pr}" fill="${INK}"/><circle cx="${cx + dx - 1}" cy="${cy + dy - 1.2}" r="0.9" fill="#fff"/>`;
}

function cheeks(y = 43) {
  return `<ellipse cx="22" cy="${y}" rx="4" ry="2.8" fill="${RED}" opacity="0.28"/><ellipse cx="51" cy="${y - 1}" rx="4" ry="2.8" fill="${RED}" opacity="0.28"/>`;
}

function spiral(cx: number, cy: number) {
  let d = "";
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const a = t * 1.8 * Math.PI * 2;
    const r = 6.4 * t;
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="8" fill="#fff" ${S} stroke-width="2.6"/><path d="${d}" fill="none" ${S} stroke-width="1.6"/>`;
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

function wrap(inner: string) {
  return (
    `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">` +
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

const LOOKS: Avatar[] = [
  {
    // Wow: wide eyes looking up, open mouth, raised brows.
    id: "wow",
    label: "Wow",
    svg: wrap(
      `<path d="M25 17c3-3 7-3 10 0M43 16c3-3 7-3 10 0" ${S} stroke-width="2.6"/>` +
        `${eye(31, 29, 1.6, -1.8)}${eye(47, 28, 1.6, -1.8)}${cheeks(44)}` +
        `<ellipse cx="40" cy="47" rx="6.5" ry="5.5" fill="${INK}"/><ellipse cx="40" cy="50" rx="3.6" ry="2.2" fill="${RED}"/>`,
    ),
  },
  {
    // Cap: court-blue cap, big grin.
    id: "cap",
    label: "Cap",
    svg: wrap(
      `${eye(31, 35)}${eye(47, 34)}${cheeks(46)}` +
        `<path d="M29 47c3 9 17 9 20 0z" fill="${INK}" ${S} stroke-width="2.6"/>` +
        `<path d="M10 28C8 11 24 2 38 3c13 1 21 10 22 22-10-5-35-8-50 3z" fill="${BLUE}" ${S}/>` +
        `<path d="M38 4c-4 7-4 13 0 19" ${S} stroke-width="2"/><circle cx="38" cy="4" r="2.4" fill="#fff" ${S} stroke-width="2"/>` +
        `<path d="M50 22c6-1 11 1 12 5-6 3-12 2-17 0z" fill="${BLUE}" ${S}/>`,
    ),
  },
  {
    // Cool: shades, smirk, sparkle.
    id: "cool",
    label: "Cool",
    svg: wrap(
      `<path d="M16 25h19v11c0 4-4 7-9.5 7S16 40 16 36z" fill="${INK}"/><path d="M39 24h19v11c0 4-4 7-9.5 7S39 39 39 35z" fill="${INK}"/>` +
        `<path d="M35 28c2-2 2-2 4 0" ${S} stroke-width="2.6"/><path d="M16 27l-5-2" ${S} stroke-width="2.6"/>` +
        `<path d="M21 30l5-3M44 29l5-3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M28 50c6 5 14 3 19-3" ${S} stroke-width="3"/>${cheeks(46)}` +
        `<path d="M58 7l5-4M60 14l4 1M52 2l1-3" ${S} stroke-width="2.6"/>`,
    ),
  },
  {
    // Fierce: red headband, angry brows, gritted teeth.
    id: "fierce",
    label: "Fierce",
    svg: wrap(
      `${eye(31, 43, 0, 0.8, 5, 2.4)}${eye(47, 42, 0, 0.8, 5, 2.4)}` +
        `<path d="M23 35l12 3M58 34l-11 4" ${S} stroke-width="3.2"/>` +
        `<path d="M31 50h15v5c-5 3-10 3-15 0z" fill="#fff" ${S} stroke-width="2.6"/><path d="M38.500 50v7" ${S} stroke-width="1.8"/>` +
        `<path d="M10 22c16-8 37-8 50 0l-1 10c-16-6-33-6-48 0z" fill="${RED}" ${S}/>` +
        `<path d="M57 24l8-6-1 9 5 6-12-1z" fill="${RED}" ${S} stroke-width="2.6"/>`,
    ),
  },
  {
    // Dizzy: spiral eyes, little "o" mouth, orbiting stars.
    id: "dizzy",
    label: "Dizzy",
    svg: wrap(
      `${spiral(31, 30)}${spiral(48, 29)}${cheeks(46)}` +
        `<ellipse cx="40" cy="49" rx="3.6" ry="4.6" fill="#fff" ${S} stroke-width="2.6"/>` +
        `${star(13, 9, 6)}${star(33, 3, 5)}${star(55, 9, 6)}`,
    ),
  },
  {
    // Wink: one eye shut, big grin, tongue out.
    id: "wink",
    label: "Wink",
    svg: wrap(
      `${eye(31, 30, 1.2, -0.6)}<path d="M41 31c3-6 10-6 13 0" ${S} stroke-width="3"/>` +
        `<path d="M24 44c6 9 19 9 26 0z" fill="${INK}" ${S} stroke-width="2.6"/>` +
        `<path d="M35 51c0 8 10 8 10 0z" fill="${RED}" ${S} stroke-width="2.4"/>${cheeks(44)}` +
        `<path d="M59 9l5-2M60 17l5 1M56 2l2-3" ${S} stroke-width="2.6"/>`,
    ),
  },
];

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
