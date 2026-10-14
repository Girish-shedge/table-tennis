import { isRoomCode, ROOM_CODE_ALPHABET } from "../../../shared/constants";
import { sanitizeName } from "../../../shared/names";
import { NET } from "../../config";
import { ApiError, createRoom, joinRoom, previewRoom, wsUrl } from "../../net/api";
import { net } from "../../net/client";
import { resumeState } from "../../net/hostSim";
import { clearSession, loadName, loadSession, saveName, saveSession, tabClaim } from "../../net/profile";
import { initialSession, reduceSession, type Session, type SessionEvent } from "../../net/session";
import { COPY, truncateName, type MessageKey } from "../../strings";
import { mountConnChip } from "../conn";
import { showToast } from "../toast";
import { iconNode } from "../icons";
import { avatarSvg } from "../avatars";
import { peer } from "../../net/peer";

export interface ScreenHooks {
  unlock: () => void;
  onMatch: (session: Session) => void;
  onLeave: () => void;
  setEscape: (fn: () => void) => void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

function messageKey(error: string): MessageKey {
  switch (error) {
    case "ROOM_NOT_FOUND":
      return "roomNotFound";
    case "ROOM_EXPIRED":
      return "roomExpired";
    case "ROOM_FULL":
      return "matchStarted";
    case "ROOM_ENDED":
      return "roomEnded";
    case "VERSION_MISMATCH":
      return "update";
    case "RATE_LIMITED":
    case "RESTING":
      return "resting";
    default:
      return "unreachable";
  }
}

export function mountMultiplayer(hooks: ScreenHooks) {
  const entry = $("mp-entry");
  if (!NET.relayUrl) {
    entry.hidden = true;
    return;
  }
  entry.hidden = false;
  const root = $("mp-root");
  const profile = loadName();
  let session = initialSession(profile.name, profile.saved);
  const setName = (name: string) => {
    $("profile-btn-name").textContent = name;
  };
  setName(session.myName);
  mountConnChip();
  let lastScreen = session.screen;
  let said = "";
  let lastLeft = Infinity;
  let slowTimer = 0;
  let countdownTimer = 0;
  let rematchTimer = 0;
  let expiresAt = 0;
  let ignoreClose = false;
  let playing = false;
  let backingOff = false;
  const tab = { id: crypto.randomUUID(), at: Date.now() };

  $("mp-divider").textContent = COPY.divider;
  $("btn-friend").textContent = COPY.playFriend;
  $("friend-title").textContent = COPY.playFriend;
  $("friend-sub").textContent = COPY.friendSub;
  $("host-name").textContent = COPY.host;
  $("host-desc").textContent = COPY.hostDesc;
  $("join-name").textContent = COPY.join;
  $("join-desc").textContent = COPY.joinDesc;

  // "Play with a friend" opens a chooser; Host and Join then run the usual flows.
  const friendDialog = $("friend-dialog");
  const friendBtn = $<HTMLButtonElement>("btn-friend");
  const closeFriend = (refocus: boolean) => {
    friendDialog.hidden = true;
    if (refocus) friendBtn.focus();
  };
  friendBtn.addEventListener("click", () => {
    friendDialog.hidden = false;
    $("btn-host").focus();
  });
  $("friend-cancel").addEventListener("click", () => closeFriend(true));
  friendDialog.addEventListener("click", (e) => {
    if (e.target === friendDialog) closeFriend(true);
  });
  friendDialog.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") closeFriend(true);
  });

  hooks.setEscape(() => {
    if (session.role) dispatch({ type: "askLeave" });
  });

  function dispatch(event: SessionEvent) {
    session = reduceSession(session, event);
    render();
  }

  function goMatch() {
    if (session.screen === "match") return;
    playing = true;
    window.clearInterval(countdownTimer);
    dispatch({ type: "countdownDone" });
    hooks.onMatch(session);
    $<HTMLButtonElement>("btn-conn").hidden = false;
    $<HTMLButtonElement>("btn-leave").hidden = false;
    $<HTMLElement>("btn-mode").hidden = true;
    $("controls").hidden = false;
  }

  // The friend's avatar arrives a moment after they do: redraw the screens that show it.
  peer.onChange(() => {
    if (["hostReady", "guestLobby", "result", "rematch"].includes(session.screen)) render();
  });

  net.on((msg) => {
    if (typeof msg === "string") return;
    if (msg.t === "peer_joined" && typeof msg.name === "string") dispatch({ type: "peerJoined", name: msg.name });
    if (msg.t === "peer_left") dispatch({ type: "peerLeft", name: String(msg.name || "Friend"), why: String(msg.why || "left") });
      if (msg.t === "room_closed") {
        if (msg.why === "forfeit") return;
        dispatch({ type: "roomClosed", message: msg.why === "expired" ? "hostExpired" : msg.why === "inactivity" ? "inactivity" : "friendEnded" });
      }
    if (msg.t === "start_ok") beginCountdown(true);
    if (msg.t === "start_rejected") dispatch({ type: "startRejected", message: "notConnected" });
    if (msg.t === "countdown" && session.role === "guest") {
      if (session.screen !== "countdown" && session.screen !== "match") dispatch({ type: "guestStart" });
      showCount(Number(msg.n));
    }
    if (msg.t === "hello") {
      const cp = msg.checkpoint as { score?: { player: number; ai: number }; server?: string } | null;
      if (!playing && cp?.score && (cp.server === "player" || cp.server === "ai")) {
        resumeState.checkpoint = { score: cp.score, server: cp.server };
      }
      const status = String(msg.roomStatus || "");
      if (session.screen === "reconnect") dispatch({ type: "reconnected" });
      if (!playing && (status === "PLAYING" || status === "PAUSED" || status === "COUNTDOWN")) {
        const peer = msg.peer as { name?: string } | null;
        if (peer?.name) session = { ...session, peerName: peer.name };
        playing = true;
        hooks.onMatch(session);
      }
    }
    if (msg.t === "rematch_request") dispatch({ type: "peerRematch" });
    if (msg.t === "rematch_accept") {
      dispatch({ type: "acceptRematch" });
      if (session.screen === "countdown") beginCountdown(session.role === "host");
    }
    if (msg.t === "error" && msg.error === "DUPLICATE_TAB") dispatch({ type: "roomClosed", message: "duplicate" });
    if (msg.t === "socket_closed") {
      if (ignoreClose) {
        ignoreClose = false;
        return;
      }
      if (session.screen === "match" || session.screen === "countdown") {
        dispatch({ type: "disconnected" });
        void backoff();
      } else if (session.screen !== "start" && session.screen !== "message") dispatch({ type: "disconnected" });
    }
  });

  async function backoff() {
    if (backingOff) return;
    backingOff = true;
    const saved = loadSession();
    const delays = [1000, 2000, 4000, 5000];
    const started = Date.now();
    let i = 0;
    while (saved && Date.now() - started < NET.reconnectWindowMs && session.screen === "reconnect") {
      await new Promise((resolve) => window.setTimeout(resolve, delays[Math.min(i, delays.length - 1)]));
      i++;
      try {
        await connect(saved.code, saved.token, saved.role);
        backingOff = false;
        return;
      } catch {
        /* try again */
      }
    }
    backingOff = false;
  }

  async function connect(code: string, token: string, role: "host" | "guest") {
    saveSession({ code, playerId: session.playerId || "", token, role });
    await net.connect(wsUrl(NET.relayUrl, code, token));
  }

  function dropRoom() {
    ignoreClose = true;
    net.send({ t: "leave" });
    net.close();
    clearSession();
  }

  function showCount(n: number) {
    const node = document.getElementById("mp-count");
    if (node) node.textContent = n > 0 ? String(n) : "Go";
    // Restart the ring and the numeral pop on every tick.
    const disc = node?.closest(".mp-count");
    if (disc) {
      disc.classList.remove("tick");
      void (disc as HTMLElement).offsetWidth;
      disc.classList.add("tick");
    }
    if (n <= 0) goMatch();
  }

  function beginCountdown(send: boolean) {
    dispatch({ type: "start" });
    let n = 3;
    const tick = () => {
      if (send) net.send({ t: "countdown", n });
      showCount(n);
      if (n <= 0) {
        window.clearInterval(countdownTimer);
        return;
      }
      n -= 1;
    };
    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  async function host() {
    hooks.unlock();
    const previous = loadSession();
    dispatch({ type: "host" });
    slowTimer = window.setTimeout(() => dispatch({ type: "createSlow" }), 5000);
    try {
      const room = await createRoom(NET.relayUrl, session.myName, previous?.role === "host" ? previous : undefined);
      window.clearTimeout(slowTimer);
      expiresAt = room.expiresAt;
      dispatch({ type: "created", code: room.code, token: room.token, playerId: room.playerId });
      history.pushState({ mp: session.screen }, "");
      try {
        await connect(room.code, room.token, "host");
      } catch {
        dispatch({ type: "roomClosed", message: "unreachable" });
      }
    } catch (err) {
      window.clearTimeout(slowTimer);
      const code = err instanceof ApiError ? messageKey(err.code) : "unreachable";
      dispatch({ type: "createFailed", message: code });
    }
  }

  async function submitCode(code: string) {
    hooks.unlock();
    dispatch({ type: "submitCode" });
    try {
      const room = await joinRoom(NET.relayUrl, code, session.myName);
      session = { ...session, code };
      dispatch({ type: "joined", token: room.token, playerId: room.playerId, hostName: room.hostName });
      history.pushState({ mp: "guestLobby" }, "");
      try {
        await connect(code, room.token, "guest");
      } catch {
        dispatch({ type: "joinFailed", message: "unreachable" });
      }
    } catch (err) {
      const codeKey = err instanceof ApiError ? messageKey(err.code) : "unreachable";
      dispatch({ type: "joinFailed", message: codeKey });
    }
  }

  async function openLink(code: string) {
    try {
      const preview = await previewRoom(NET.relayUrl, code);
      dispatch({ type: "openLink", code, hostName: preview.hostName });
      if (session.nameSaved) await submitCode(code);
    } catch (err) {
      const codeKey = err instanceof ApiError ? messageKey(err.code) : "unreachable";
      dispatch({ type: "joinFailed", message: codeKey });
    }
  }

  function inviteLink() {
    const url = new URL(location.href);
    url.searchParams.set("room", session.code || "");
    return url.toString();
  }

  async function share() {
    const link = inviteLink();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Table Tennis", url: link });
        return;
      }
    } catch {
      /* user dismissed the sheet */
    }
    try {
      await navigator.clipboard.writeText(link);
      flash(COPY.linkCopied, "success");
    } catch {
      const field = document.getElementById("mp-link-field") as HTMLInputElement | null;
      if (field) {
        field.hidden = false;
        field.value = link;
        field.focus();
        field.select();
      }
    }
  }

  function flash(text: string, kind: "success" | "warn" | false = false) {
    showToast(text, kind);
  }

  function render() {
    const inMp = session.screen !== "start";
    root.hidden = !inMp || session.screen === "match";
    if (session.screen === "start") $("overlay-start").hidden = false;
    else if (inMp && session.screen !== "match") $("overlay-start").hidden = true;
    root.replaceChildren();
    if (root.hidden) {
      lastScreen = session.screen;
      return;
    }
    // Animate only when the screen changes, so a small update does not replay the entrance.
    const changed = session.screen !== lastScreen;
    if (changed) said = "";
    lastScreen = session.screen;
    root.dataset.screen = session.screen;
    root.classList.toggle("fresh", changed);
    const card = el("div", { class: changed ? "card mp-card" : "card mp-card still" });
    root.append(card);
    paint(card);
  }

  function glyph(): HTMLElement {
    return iconNode("oops", 64, "mp-glyph");
  }

  function dots() {
    const wrap = el("span", { class: "mp-dots", "aria-hidden": "true" });
    wrap.append(el("i"), el("i"), el("i"));
    return wrap;
  }

  function codeCard(code: string, small = false) {
    const wrap = el("div", { class: small ? "code-card small" : "code-card", "data-testid": "room-code", role: "img", "aria-label": `${COPY.codeAria} ${code.split("").join(" ")}` });
    code.split("").forEach((ch, i) => {
      const tile = el("span", { class: "code-tile", "aria-hidden": "true" }, ch);
      tile.style.setProperty("--i", String(i));
      wrap.append(tile);
    });
    return wrap;
  }

  /** A round avatar. Unknown (friend has not told us yet) shows a dashed "?" so the layout does not jump. */
  function face(id: string, kind: "you" | "them", tick = false) {
    const wrap = el("span", { class: id ? "duo-face" : "duo-face unknown", "aria-hidden": "true" });
    if (id) wrap.innerHTML = avatarSvg(id); // static markup from our own avatar table, never user text
    else wrap.textContent = "?";
    if (tick) {
      const t = el("span", { class: "tick" });
      t.append(iconNode("tick", 16));
      wrap.append(t);
    }
    wrap.dataset.kind = kind;
    return wrap;
  }

  /** You and your friend side by side, joined by a dotted line. */
  function duo(youName: string, themName: string, tickYou: boolean, tickThem: boolean) {
    const row = el("div", { class: "mp-duo" });
    const a = el("div", { class: "who you" });
    a.append(face(peer.mine, "you", tickYou), el("span", { class: "who-name" }, youName));
    const b = el("div", { class: "who them" });
    b.append(face(peer.theirs, "them", tickThem), el("span", { class: "who-name" }, themName));
    row.append(a, el("span", { class: "duo-link", "aria-hidden": "true" }), b);
    return row;
  }

  function scoreBlock(you: number, them: number, themName: string) {
    const wrap = el("div", { class: "mp-score", role: "img", "aria-label": `${COPY.scoreAria}: You ${you}, ${themName} ${them}` });
    const left = el("div", { class: "side you" });
    left.append(miniFace(peer.mine), el("span", { class: "num" }, String(you)), el("span", { class: "who" }, "You"));
    const right = el("div", { class: "side them" });
    right.append(miniFace(peer.theirs), el("span", { class: "num" }, String(them)), el("span", { class: "who" }, themName));
    wrap.append(left, el("span", { class: "dot" }, "·"), right);
    return wrap;
  }

  function miniFace(id: string) {
    const f = el("span", { class: id ? "mini-face" : "mini-face unknown", "aria-hidden": "true" });
    if (id) f.innerHTML = avatarSvg(id);
    else f.textContent = "?";
    return f;
  }

  function announce(text: string) {
    const live = document.getElementById("mp-live");
    if (!live || said === text) return;
    said = text;
    live.textContent = text;
  }

  /** Space is typed into name and code fields, not sent to the game as a serve. */
  function typing(node: HTMLElement) {
    node.addEventListener("keydown", (event) => event.stopPropagation());
    return node;
  }

  function ballSpinner() {
    const ball = el("div", { class: "mp-ball", "aria-hidden": "true" });
    ball.append(el("span"));
    return ball;
  }

  function paint(card: HTMLElement) {
    const s = session;
    const peerName = s.peerName ?? "Your friend";

    if (s.screen === "creating") {
      card.append(ballSpinner(), el("h1", { class: "mp-h" }, COPY.creating), el("p", { class: "sub" }, s.slow ? COPY.creatingSlow : ""));
      announce(s.slow ? COPY.creatingSlow : COPY.creating);
      if (s.slow) card.append(actions(button(COPY.retry, "mp-retry", () => void host(), true), button(COPY.cancel, "mp-cancel", () => dispatch({ type: "cancel" }))));
      return;
    }

    // Same shape as "Join with code": heading, the timer as the subheading, the code, two buttons.
    if (s.screen === "hostLobby") {
      const urgent = expiresAt > 0 && expiresAt - Date.now() <= 20000;
      card.append(
        el("h1", { class: "mp-h" }, COPY.host),
        el("p", { id: "mp-expiry", class: urgent ? "sub mp-expiry urgent" : "sub mp-expiry", "data-testid": "expiry" }, expiryText()),
        codeCard(s.code || ""),
      );
      const link = typing(el("input", { id: "mp-link-field", class: "mp-field mp-link-field", "data-testid": "link-field", "aria-label": COPY.inviteLink, readonly: "" })) as HTMLInputElement;
      link.hidden = true;
      card.append(link);
      card.append(actions(
        button(COPY.share, "mp-share", () => void share(), true),
        button(COPY.cancel, "mp-cancel", () => {
          dropRoom();
          dispatch({ type: "cancel" });
        }),
      ));
      return;
    }

    if (s.screen === "hostReady") {
      card.classList.add("mp-split");
      const badge = el("p", { class: "info-badge mp-joined", "data-testid": "peer-joined" });
      const check = iconNode("check", 20);
      badge.append(miniFace(peer.theirs), el("span", {}, `${peerName} ${COPY.joined}`), check);
      card.append(el("p", { class: "mp-eyebrow" }, COPY.roomCode), codeCard(s.code || "", true), el("div", { class: "mp-spacer" }), badge);
      announce(`${peerName} ${COPY.joined}`);
      card.append(actions(
        button(COPY.start, "mp-start", () => net.send({ t: "start_request" }), true),
        button(COPY.leaveRoom, "mp-cancel", () => {
          dropRoom();
          dispatch({ type: "cancel" });
        }),
      ));
      if (s.message === "notConnected") card.append(el("p", { class: "mp-warn", role: "status" }, `${peerName} ${COPY.notConnected}`));
      return;
    }

    if (s.screen === "joinCode") {
      card.append(el("h1", { class: "mp-h" }, COPY.join), el("p", { class: "sub" }, COPY.codePrompt), codeBoxes(), el("p", { id: "mp-code-hint", class: "mp-warn", role: "status" }));
      card.append(actions(button(COPY.cancel, "mp-cancel", () => dispatch({ type: "cancel" }))));
      return;
    }

    if (s.screen === "invite") {
      card.append(el("h1", { class: "mp-h" }, `${s.hostName} invited you to play`));
      card.append(el("label", { class: "mp-label", for: "mp-name-input" }, COPY.yourName));
      const input = typing(el("input", { id: "mp-name-input", class: "mp-field", "data-testid": "invite-name", value: s.myName, maxlength: "16", autocomplete: "off", spellcheck: "false" })) as HTMLInputElement;
      input.value = s.myName;
      const go = () => {
        const clean = sanitizeName(input.value) || s.myName;
        saveName(clean);
        setName(clean);
        session = { ...session, myName: clean, nameSaved: true };
        if (s.code) void submitCode(s.code);
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") go();
      });
      card.append(input);
      card.append(actions(
        button(COPY.joinGame, "mp-join-game", go, true),
        button(COPY.cancel, "mp-cancel", () => dispatch({ type: "cancel" })),
      ));
      return;
    }

    if (s.screen === "joining") {
      card.append(ballSpinner(), el("h1", { class: "mp-h" }, "Joining…"));
      card.append(actions(button(COPY.leave, "mp-guest-leave", () => {
        dropRoom();
        dispatch({ type: "confirmLeave" });
      })));
      return;
    }

    if (s.screen === "guestLobby") {
      const hostName = s.hostName ?? "your friend";
      card.classList.add("mp-lobby");
      card.append(duo(s.myName, truncateName(hostName, 12), true, false));
      card.append(el("h1", { class: "mp-h win" }, COPY.joinedTitle));
      const wait = el("p", { class: "mp-wait", "data-testid": "guest-wait" });
      wait.append(`${COPY.waitingStart} `, el("span", { class: "dotted" }, hostName), ` ${COPY.toStart}`, dots());
      card.append(wait);
      if (s.code) {
        const room = el("p", { class: "mp-room" }, "Room ");
        room.append(el("b", {}, s.code));
        card.append(room);
      }
      announce(`${COPY.joinedTitle} ${COPY.waitingStart} ${hostName} ${COPY.toStart}`);
      card.append(actions(button(COPY.leave, "mp-guest-leave", () => {
        dropRoom();
        dispatch({ type: "confirmLeave" });
      })));
      return;
    }

    if (s.screen === "countdown") {
      card.className = "mp-count tick";
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      ring.setAttribute("viewBox", "0 0 130 130");
      ring.setAttribute("aria-hidden", "true");
      const arc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      for (const [k, v] of Object.entries({ cx: "65", cy: "65", r: "60" })) arc.setAttribute(k, v);
      ring.append(arc);
      card.append(ring, el("h1", { id: "mp-count", "data-testid": "countdown" }, "3"));
      return;
    }

    if (s.screen === "leave") {
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      card.setAttribute("aria-label", COPY.leaveMatchTitle);
      card.append(el("h1", {}, COPY.leaveMatchTitle), el("p", { class: "sub" }, COPY.leaveMatchBody));
      const stay = button(COPY.stay, "mp-stay", () => dispatch({ type: "stay" }), true);
      const row = actions(
        stay,
        button(COPY.leave, "mp-confirm-leave", () => {
          dropRoom();
          $<HTMLButtonElement>("btn-conn").hidden = true;
          $<HTMLButtonElement>("btn-leave").hidden = true;
          $<HTMLElement>("btn-mode").hidden = false;
          $("controls").hidden = true;
          hooks.onLeave();
          dispatch({ type: "confirmLeave" });
        }),
      );
      card.append(row);
      queueMicrotask(() => stay.focus());
      return;
    }

    if (s.screen === "result") {
      const title = s.youWon ? COPY.youWin : `${peerName} wins`;
      card.append(el("h1", { class: s.youWon ? "win" : "" }, title), scoreBlock(s.you, s.them, peerName));
      announce(`${title} ${s.you} to ${s.them}`);
      const row = actions(
        button(COPY.rematch, "mp-rematch", () => {
          net.send({ t: "rematch_request" });
          dispatch({ type: "rematch" });
          window.clearTimeout(rematchTimer);
          rematchTimer = window.setTimeout(() => dispatch({ type: "rematchTimeout" }), NET.rematchTimeoutMs);
        }, true),
        button(COPY.leave, "mp-result-leave", () => {
          dropRoom();
          hooks.onLeave();
          dispatch({ type: "confirmLeave" });
        }),
      );
      card.append(row);
      return;
    }

    if (s.screen === "rematch") {
      const asked = s.rematchFrom === "peer";
      card.append(el("h1", { class: "mp-h" }, asked ? `${peerName} ${COPY.wantsRematch}` : `${COPY.waitingRematch} ${peerName}…`));
      card.append(scoreBlock(s.you, s.them, peerName));
      const buttons: HTMLElement[] = [];
      if (asked) {
        buttons.push(button(COPY.accept, "mp-accept", () => {
          net.send({ t: "rematch_accept" });
          dispatch({ type: "acceptRematch" });
          beginCountdown(session.role === "host");
        }, true));
      }
      buttons.push(button(COPY.leave, "mp-rematch-leave", () => dispatch({ type: "askLeave" })));
      announce(asked ? `${peerName} ${COPY.wantsRematch}` : `${COPY.waitingRematch} ${peerName}`);
      card.append(actions(...buttons));
      return;
    }

    if (s.screen === "reconnect") {
      card.append(ballSpinner(), el("h1", { class: "mp-h", "data-testid": "reconnect" }, COPY.reconnecting), el("p", { class: "sub" }, COPY.reconnectingSub));
      announce(COPY.reconnecting);
      card.append(actions(button(COPY.leave, "mp-reconnect-leave", () => dispatch({ type: "askLeave" }))));
      return;
    }

    if (s.screen === "message" && s.message && s.message in COPY.messages) {
      const copy = COPY.messages[s.message as MessageKey];
      const title = s.message === "friendLeft" || s.message === "friendEnded" ? `${peerName} ${copy.title}` : copy.title;
      if (s.message !== "friendLeft") card.append(glyph());
      card.append(el("h1", { class: "mp-h" }, title), el("p", { class: "sub" }, copy.body));
      announce(`${title}. ${copy.body}`);
      const primary = button(copy.primary, "mp-primary", () => {
        if (s.message === "update") location.reload();
        else dispatch({ type: "backToMenu" });
      }, true);
      const items: HTMLElement[] = [primary];
      if (copy.primary !== COPY.backHome) items.push(button(COPY.backHome, "back-home", () => dispatch({ type: "backToMenu" })));
      card.append(actions(...items));
    }
  }

  function expiryText() {
    if (!expiresAt) return COPY.waiting;
    const left = Math.max(0, expiresAt - Date.now());
    const m = Math.floor(left / 60000);
    const sec = Math.floor((left % 60000) / 1000);
    return `${COPY.expiresIn} ${m}:${String(sec).padStart(2, "0")}`;
  }

  function button(label: string, testid: string, onClick: () => void, primary = false) {
    const cls = primary ? "btn primary" : "btn";
    const node = el("button", { class: cls, type: "button", "data-testid": testid }, label);
    node.addEventListener("click", onClick);
    return node;
  }

  function actions(...nodes: HTMLElement[]) {
    const row = el("div", { class: "actions mp-actions" });
    for (const node of nodes) row.append(node);
    return row;
  }

  function codeBoxes() {
    const row = el("div", { class: "mp-code", role: "group", "aria-label": COPY.join });
    const inputs: HTMLInputElement[] = [];
    for (let i = 0; i < 4; i++) {
      const input = typing(el("input", {
        class: "code-input",
        maxlength: "1",
        inputmode: "text",
        autocapitalize: "characters",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": `Letter ${i + 1}`,
        "data-testid": `code-${i}`,
      })) as HTMLInputElement;
      input.addEventListener("input", () => {
        const ch = input.value.toUpperCase();
        if (ch && !ROOM_CODE_ALPHABET.includes(ch)) {
          input.value = "";
          const hint = document.getElementById("mp-code-hint");
          if (hint) hint.textContent = COPY.codeHint;
          return;
        }
        input.value = ch;
        if (ch && inputs[i + 1]) inputs[i + 1].focus();
        const code = inputs.map((n) => n.value).join("");
        if (isRoomCode(code)) void submitCode(code);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && inputs[i - 1]) inputs[i - 1].focus();
      });
      input.addEventListener("paste", (event) => {
        const text = event.clipboardData?.getData("text")?.toUpperCase().replace(/[^A-Z]/g, "") ?? "";
        if (text.length >= 4) {
          event.preventDefault();
          for (let k = 0; k < 4; k++) inputs[k].value = text[k];
          if (isRoomCode(text.slice(0, 4))) void submitCode(text.slice(0, 4));
        }
      });
      inputs.push(input);
      row.append(input);
    }
    queueMicrotask(() => inputs[0]?.focus());
    return row;
  }

  $<HTMLButtonElement>("btn-host").addEventListener("click", () => {
    closeFriend(false);
    void host();
  });
  $<HTMLButtonElement>("btn-join").addEventListener("click", () => {
    closeFriend(false);
    dispatch({ type: "openJoin" });
  });
  $<HTMLButtonElement>("btn-leave").addEventListener("click", () => {
    if (session.role) dispatch({ type: "askLeave" }); // against Bot, main.ts handles it
  });
  window.addEventListener("popstate", () => {
    if (session.screen === "hostLobby" || session.screen === "hostReady" || session.screen === "guestLobby" || session.screen === "match") {
      dispatch({ type: "askLeave" });
    }
  });

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("tt-mp");
    channel.postMessage(tab);
    channel.onmessage = (event) => {
      const theirs = event.data as { id: string; at: number };
      // A live room stays up so two tabs can be the two players. A second idle tab still loses (E-22).
      if (session.token) return;
      if (tabClaim(tab, theirs) === "yield") dispatch({ type: "roomClosed", message: "duplicate" });
    };
    $<HTMLButtonElement>("btn-profile").dataset.tab = tab.id;
  }

  window.setInterval(() => {
    const node = document.getElementById("mp-expiry");
    if (!node) {
      lastLeft = Infinity;
      return;
    }
    node.textContent = expiryText();
    const left = expiresAt ? Math.max(0, expiresAt - Date.now()) : Infinity;
    node.classList.toggle("urgent", left <= 20000);
    // Screen readers hear the time only at a few moments, not every second.
    for (const mark of [60000, 30000, 20000, 10000]) {
      if (lastLeft > mark && left <= mark) {
        const live = document.getElementById("mp-live");
        if (live) live.textContent = expiryText();
      }
    }
    lastLeft = left;
  }, 1000);

  const saved = loadSession();
  if (saved && !new URLSearchParams(location.search).get("room")) {
    session = { ...session, role: saved.role, code: saved.code, token: saved.token, playerId: saved.playerId, screen: "reconnect", underneath: "match" };
    render();
    void connect(saved.code, saved.token, saved.role).catch(() => dispatch({ type: "roomClosed", message: "unreachable" }));
  }

  const params = new URLSearchParams(location.search);
  const room = params.get("room");
  if (room && isRoomCode(room.toUpperCase())) void openLink(room.toUpperCase());

  if (import.meta.env.DEV) {
    // Visual QA only: lets a screenshot script put the screen machine in any state.
    (window as unknown as Record<string, unknown>).__mp = {
      dispatch,
      setExpiry: (ms: number) => {
        expiresAt = ms;
        render();
      },
      session: () => session,
      patch: (partial: Partial<Session>) => {
        session = { ...session, ...partial };
        render();
      },
    };
  }

  return {
    session: () => session,
    dispatch,
    /** The My player dialog saved a new name. */
    setName(name: string) {
      session = { ...session, myName: name, nameSaved: true };
      setName(name);
    },
    noteResult(youWon: boolean, you: number, them: number) {
      dispatch({ type: "matchOver", youWon, you, them });
      $<HTMLButtonElement>("btn-conn").hidden = true;
    },
  };
}
