import { isAvatarId, loadAvatar, saveAvatar } from "../ui/avatars";
import { net } from "./client";

/**
 * Which avatar each side picked. Shared by the lobby screens, the match and the profile bar.
 * It rides on the relay's existing "emote" message (id -1 means "this is my avatar"), so the
 * relay needs no change. Each side sends when the other connects and answers once.
 */
let mine = loadAvatar();
let theirs = "";
const listeners = new Set<() => void>();

function changed() {
  for (const fn of listeners) fn();
}

function send() {
  net.send({ t: "emote", id: -1, avatar: mine });
}

net.on((msg) => {
  if (typeof msg === "string") return;
  // Someone is here: tell them who we are (and they will tell us).
  if (msg.t === "peer_joined" || msg.t === "hello") send();
  if (msg.t === "emote" && msg.id === -1 && isAvatarId(msg.avatar)) {
    const first = theirs !== msg.avatar;
    theirs = msg.avatar;
    changed();
    if (first) send();
  }
});

export const peer = {
  /** My avatar id. */
  get mine() {
    return mine;
  },
  /** The other player's avatar id, or "" until they have told us. */
  get theirs() {
    return theirs;
  },
  setMine(id: string) {
    mine = id;
    saveAvatar(id);
    send();
    changed();
  },
  /** Forget the other player (left the room, or back to Bot). */
  reset() {
    theirs = "";
    changed();
  },
  /** Visual QA only (dev builds). */
  devSetTheirs(id: string) {
    if (import.meta.env.DEV) {
      theirs = id;
      changed();
    }
  },
  onChange(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
