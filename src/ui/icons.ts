/**
 * Playful icon set. Chunky 2px ink outlines, round joins and the paddle red
 * and blue as fills, so every icon reads like part of the same drawing as the
 * paddles and the ball. All markup here is static (no user text).
 */

const INK = "#111";
const RED = "#f23b3b";
const BLUE = "#0a8cff";

const base = 'viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** A ball with a face, used for the difficulty modes and the error screen. */
function ball(fill: string, eyes: string, mouth: string, extra = "") {
  return `<svg ${base}>
    <circle cx="12" cy="12" r="9.5" fill="${fill}" stroke="${INK}" stroke-width="2"/>
    <path d="M6.6 8.2a6.8 6.8 0 0 1 3-2.6" stroke="#fff" stroke-width="1.8"/>
    ${eyes}${mouth}${extra}
  </svg>`;
}

const dotEyes = `<circle cx="8.9" cy="11" r="1.4" fill="${INK}"/><circle cx="15.1" cy="11" r="1.4" fill="${INK}"/>`;

export const ICONS: Record<string, string> = {
  // Difficulty
  easy: ball("#fff", dotEyes, `<path d="M8.4 14.4c1.9 2.4 5.3 2.4 7.2 0" stroke="${INK}" stroke-width="2"/>`),
  medium: ball(
    "#fff",
    dotEyes,
    `<path d="M9 15.6h6" stroke="${INK}" stroke-width="2"/>`,
    `<path d="M7.4 8.6h3M13.6 8.2h3" stroke="${INK}" stroke-width="1.8"/>`,
  ),
  hard: ball(
    "#fff",
    dotEyes,
    `<path d="M8.6 16.4c1.9-2 5.3-2 6.8 0" stroke="${INK}" stroke-width="2"/>`,
    `<path d="M6.8 7.6l3.8 1.8M17.2 7.6l-3.8 1.8" stroke="${INK}" stroke-width="2"/>`,
  ),
  // Error / sad ball
  oops: ball(
    "#fff",
    `<path d="M7.6 9.6l2.8 2.8M10.4 9.6l-2.8 2.8M13.6 9.6l2.8 2.8M16.4 9.6l-2.8 2.8" stroke="${INK}" stroke-width="1.8"/>`,
    `<path d="M8.6 17c2-2.2 4.8-2.2 6.8 0" stroke="${INK}" stroke-width="2"/>`,
  ),
  // Help: a ball with a question mark
  help: `<svg ${base}>
    <circle cx="12" cy="12" r="9.5" fill="#fff" stroke="${INK}" stroke-width="2"/>
    <path d="M9 9.4a3.1 3.1 0 0 1 6 .9c0 2-3 2.3-3 4.2" stroke="${BLUE}" stroke-width="2.6"/>
    <circle cx="12" cy="17.6" r="1.4" fill="${BLUE}"/>
  </svg>`,
  // Edit name
  pencil: `<svg ${base}>
    <path d="M4 20.2l1.3-4.8L16.2 4.5a2.3 2.3 0 0 1 3.3 0l0 0a2.3 2.3 0 0 1 0 3.3L8.7 18.8z" fill="#fff" stroke="${INK}" stroke-width="2"/>
    <path d="M4 20.2l1.3-4.8 3.5 3.4z" fill="${RED}" stroke="${INK}" stroke-width="2"/>
    <path d="M14.2 6.5l3.3 3.3" stroke="${INK}" stroke-width="2"/>
  </svg>`,
  // Tip / hint: a ball with a sparkle
  tip: `<svg ${base}>
    <circle cx="10.5" cy="13.5" r="7" fill="#fff" stroke="currentColor" stroke-width="2"/>
    <path d="M6.6 12a4.6 4.6 0 0 1 2-2" stroke="currentColor" stroke-width="1.8"/>
    <path d="M17.5 3.5v3M16 5h3M21 8.5l-1.6 1M20.5 2.5l-1 1.4" stroke="currentColor" stroke-width="1.8"/>
  </svg>`,
  // Joined
  check: `<svg ${base}>
    <circle cx="12" cy="12" r="9.5" fill="#fff" stroke="currentColor" stroke-width="2"/>
    <path d="M7.4 12.4l3.2 3.2 6-6.6" stroke="currentColor" stroke-width="2.6"/>
  </svg>`,
  // Bare tick, for sitting on a filled green badge
  tick: `<svg ${base}>
    <path d="M6 12.6l4.2 4.2 7.8-8.8" stroke="currentColor" stroke-width="3.6"/>
  </svg>`,
  // Volume: a speaker with sound waves, or a red cross when muted
  volume: `<svg ${base}>
    <path d="M3.5 9.6h3.4l5.1-4.2v13.2l-5.1-4.2H3.5z" fill="${BLUE}" stroke="${INK}" stroke-width="2"/>
    <path class="wave" d="M15.6 9.2a4 4 0 0 1 0 5.6" stroke="${INK}" stroke-width="2"/>
    <path class="wave" d="M18.4 6.4a8 8 0 0 1 0 11.2" stroke="${INK}" stroke-width="2"/>
    <path class="mute-x" d="M15.6 9.4l5 5.2M20.6 9.4l-5 5.2" stroke="${INK}" stroke-width="4.2"/>
    <path class="mute-x" d="M15.6 9.4l5 5.2M20.6 9.4l-5 5.2" stroke="${RED}" stroke-width="2"/>
  </svg>`,
  // Close: a chunky red cross with an ink outline
  close: `<svg ${base}>
    <path d="M6 6l12 12M18 6L6 18" stroke="${INK}" stroke-width="5.2"/>
    <path d="M6 6l12 12M18 6L6 18" stroke="${RED}" stroke-width="2.4"/>
  </svg>`,
};

/** Fill every `[data-icon]` element with its icon. */
export function mountIcons(root: ParentNode = document) {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("[data-icon]"))) {
    const svg = ICONS[node.dataset.icon ?? ""];
    if (svg) node.innerHTML = svg;
  }
}

/** Build an icon element for code that creates DOM (the multiplayer screens). */
export function iconNode(name: string, size: number, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `icon ${className}`.trim();
  span.style.setProperty("--icon", `${size}px`);
  span.dataset.icon = name;
  span.innerHTML = ICONS[name] ?? "";
  span.setAttribute("aria-hidden", "true");
  return span;
}
