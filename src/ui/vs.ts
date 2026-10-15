import { avatarSvg } from "./avatars";

export interface VsSide {
  name: string;
  /** Avatar id (see avatars.ts). Bot uses "bot". */
  avatar: string;
}

function side(kind: "you" | "them", who: VsSide): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `vs-side ${kind}`;
  const face = document.createElement("span");
  face.className = "vs-face";
  face.innerHTML = avatarSvg(who.avatar); // static markup from our own avatar table, never user text
  const name = document.createElement("span");
  name.className = "vs-name";
  name.textContent = who.name;
  wrap.append(face, name);
  return wrap;
}

/**
 * The "versus" splash: a diagonal red/blue split, the opponent top-left (blue) and you bottom-right (red),
 * with a big VS in the middle. Shared by Bot matches and friend matches.
 */
export function buildVs(you: VsSide, them: VsSide): HTMLElement {
  const root = document.createElement("div");
  root.className = "vs";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", `${you.name} versus ${them.name}`);
  const blue = document.createElement("span");
  blue.className = "vs-bg blue";
  const red = document.createElement("span");
  red.className = "vs-bg red";
  const mark = document.createElement("span");
  mark.className = "vs-mark";
  mark.textContent = "VS";
  root.append(blue, red, side("them", them), side("you", you), mark);
  return root;
}
