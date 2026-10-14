import { isRoomCode, ROOM_CODE_ALPHABET } from "../../../shared/constants";
import { NET } from "../../config";
import { ApiError, createRoom, extendRoom, joinRoom, previewRoom, wsUrl } from "../../net/api";
import { net } from "../../net/client";
import { resumeState } from "../../net/hostSim";
import { clearSession, loadName, loadSession, saveName, saveSession, tabClaim } from "../../net/profile";
import { initialSession, reduceSession, type Session, type SessionEvent } from "../../net/session";
import { COPY, type MessageKey } from "../../strings";

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
  const nameBtn = $<HTMLButtonElement>("btn-name");
  const profile = loadName();
  let session = initialSession(profile.name, profile.saved);
  nameBtn.textContent = session.myName;
  let slowTimer = 0;
  let countdownTimer = 0;
  let rematchTimer = 0;
  let expiresAt = 0;
  let ignoreClose = false;
  let playing = false;
  let backingOff = false;
  const tab = { id: crypto.randomUUID(), at: Date.now() };

  $("mp-playing-as").textContent = COPY.playingAs;
  $("mp-divider").textContent = COPY.divider;
  $("btn-host").textContent = COPY.host;
  $("btn-join").textContent = COPY.join;

  hooks.setEscape(() => {
    if (session.role) dispatch({ type: "askLeave" });
  });

  function dispatch(event: SessionEvent) {
    session = reduceSession(session, event);
    render();
  }

  function goMatch() {
    playing = true;
    window.clearInterval(countdownTimer);
    dispatch({ type: "countdownDone" });
    hooks.onMatch(session);
    $<HTMLButtonElement>("btn-conn").hidden = false;
    $<HTMLButtonElement>("btn-leave").hidden = false;
    $<HTMLElement>("btn-mode").hidden = true;
    $("controls").hidden = false;
  }

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
      flash(COPY.linkCopied);
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

  function flash(text: string) {
    const node = document.getElementById("mp-flash");
    if (node) node.textContent = text;
  }

  function render() {
    const inMp = session.screen !== "start";
    root.hidden = !inMp || session.screen === "match";
    if (session.screen === "start") $("overlay-start").hidden = false;
    else if (inMp && session.screen !== "match") $("overlay-start").hidden = true;
    root.replaceChildren();
    if (root.hidden) return;
    const card = el("div", { class: "card mp-card" });
    root.append(card);
    paint(card);
  }

  function paint(card: HTMLElement) {
    const s = session;
    if (s.screen === "creating") {
      card.append(el("h1", {}, COPY.creating), el("p", { class: "sub" }, s.slow ? COPY.creatingSlow : "…"));
      if (s.slow) card.append(button(COPY.retry, "mp-retry", () => void host()));
      return;
    }
    if (s.screen === "hostLobby" || s.screen === "hostReady") {
      card.append(el("p", { class: "mp-spaced", "data-testid": "room-code" }, (s.code || "").split("").join(" ")));
      card.append(el("p", { id: "mp-expiry", class: "hint", "aria-live": "polite", "data-testid": "expiry" }, expiryText()));
      if (s.screen === "hostReady" && s.peerName) card.append(el("p", { class: "sub", "data-testid": "peer-joined" }, `${s.peerName} ${COPY.joined}`));
      const link = el("input", { id: "mp-link-field", "data-testid": "link-field" }) as HTMLInputElement;
      link.hidden = true;
      card.append(link, el("p", { id: "mp-flash", class: "hint" }));
      const buttons = [
        button(COPY.share, "mp-share", () => void share(), true),
        button(COPY.copyLink, "mp-copy-link", () => void share()),
        button(COPY.copyCode, "mp-copy-code", () => void navigator.clipboard.writeText(s.code || "").catch(() => flash(s.code || ""))),
      ];
      if (s.screen === "hostLobby") buttons.push(button(COPY.extend, "mp-extend", () => void extend()));
      if (s.screen === "hostReady") buttons.push(button(COPY.start, "mp-start", () => net.send({ t: "start_request" }), true));
      buttons.push(button(COPY.cancel, "mp-cancel", () => {
        dropRoom();
        dispatch({ type: "cancel" });
      }));
      card.append(actions(...buttons));
      if (s.message === "notConnected") card.append(el("p", { class: "hint" }, `${s.peerName ?? "Your friend"} ${COPY.notConnected}`));
      return;
    }
    if (s.screen === "joinCode") {
      card.append(el("h1", {}, COPY.join), codeBoxes(), el("p", { id: "mp-code-hint", class: "hint" }));
      card.append(actions(button(COPY.cancel, "mp-cancel", () => dispatch({ type: "cancel" }))));
      return;
    }
    if (s.screen === "invite") {
      card.append(el("h1", {}, `${s.hostName} invited you to play`));
      const input = el("input", { id: "mp-name-input", "data-testid": "invite-name", value: s.myName }) as HTMLInputElement;
      input.value = s.myName;
      card.append(input);
      card.append(actions(button(COPY.joinGame, "mp-join-game", () => {
        const next = saveName(input.value) ? input.value.trim() : s.myName;
        session = { ...session, myName: next, nameSaved: true };
        if (s.code) void submitCode(s.code);
      }, true)));
      return;
    }
    if (s.screen === "joining" || s.screen === "guestLobby") {
      card.append(el("h1", {}, s.screen === "joining" ? "Joining…" : COPY.waitingStart));
      if (s.screen === "guestLobby") card.append(el("p", { class: "sub", "data-testid": "guest-wait" }, `${COPY.waitingStart} ${s.hostName} ${COPY.toStart}`));
      card.append(actions(button(COPY.leave, "mp-guest-leave", () => {
        dropRoom();
        dispatch({ type: "confirmLeave" });
      })));
      return;
    }
    if (s.screen === "countdown") {
      card.append(el("h1", { id: "mp-count", "data-testid": "countdown" }, "3"));
      return;
    }
    if (s.screen === "leave") {
      card.append(el("h1", {}, COPY.leaveMatchTitle), el("p", { class: "sub" }, COPY.leaveMatchBody));
      card.append(actions(
        button(COPY.stay, "mp-stay", () => dispatch({ type: "stay" }), true),
        button(COPY.leave, "mp-confirm-leave", () => {
          dropRoom();
          $<HTMLButtonElement>("btn-conn").hidden = true;
          $<HTMLButtonElement>("btn-leave").hidden = true;
          $<HTMLElement>("btn-mode").hidden = false;
          $("controls").hidden = true;
          hooks.onLeave();
          dispatch({ type: "confirmLeave" });
        }),
      ));
      return;
    }
    if (s.screen === "result") {
      card.append(el("h1", {}, s.youWon ? COPY.youWin : `${s.peerName} wins`), el("p", { class: "sub" }, `${s.you} · ${s.them}`));
      card.append(actions(
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
      ));
      return;
    }
    if (s.screen === "rematch") {
      const title = s.rematchFrom === "peer" ? `${s.peerName} ${COPY.wantsRematch}` : `${COPY.waitingRematch} ${s.peerName}…`;
      card.append(el("h1", {}, title));
      const rematchButtons = [];
      if (s.rematchFrom === "peer") {
        rematchButtons.push(button(COPY.accept, "mp-accept", () => {
          net.send({ t: "rematch_accept" });
          dispatch({ type: "acceptRematch" });
          beginCountdown(session.role === "host");
        }, true));
      }
      rematchButtons.push(button(COPY.leave, "mp-rematch-leave", () => dispatch({ type: "askLeave" })));
      card.append(actions(...rematchButtons));
      return;
    }
    if (s.screen === "reconnect") {
      card.append(el("h1", { "data-testid": "reconnect" }, COPY.reconnecting));
      return;
    }
    if (s.screen === "message" && s.message && s.message in COPY.messages) {
      const copy = COPY.messages[s.message as MessageKey];
      const title = s.message === "friendLeft" || s.message === "friendEnded" ? `${s.peerName} ${copy.title}` : copy.title;
      card.append(el("h1", {}, title), el("p", { class: "sub" }, copy.body));
      const bot = el("button", { class: "btn", type: "button", "data-testid": "play-vs-bot" }, COPY.playVsBot);
      bot.addEventListener("click", () => dispatch({ type: "backToMenu" }));
      card.append(actions(
        button(copy.primary, "mp-primary", () => {
          if (s.message === "update") location.reload();
          else dispatch({ type: "backToMenu" });
        }, true),
        bot,
      ));
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
    const node = el("button", { class: primary ? "btn primary" : "btn", type: "button", "data-testid": testid }, label);
    node.addEventListener("click", onClick);
    return node;
  }

  function actions(...nodes: HTMLElement[]) {
    const row = el("div", { class: "actions mp-actions" });
    for (const node of nodes) row.append(node);
    return row;
  }

  function codeBoxes() {
    const row = el("div", { class: "mp-code" });
    const inputs: HTMLInputElement[] = [];
    for (let i = 0; i < 4; i++) {
      const input = el("input", { maxlength: "1", "aria-label": `Letter ${i + 1}`, "data-testid": `code-${i}` }) as HTMLInputElement;
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

  async function extend() {
    if (!session.code || !session.token) return;
    try {
      const next = await extendRoom(NET.relayUrl, session.code, session.token);
      expiresAt = next.expiresAt;
      flash(COPY.extend);
    } catch {
      flash(COPY.extend);
    }
  }

  $<HTMLButtonElement>("btn-host").addEventListener("click", () => void host());
  $<HTMLButtonElement>("btn-join").addEventListener("click", () => dispatch({ type: "openJoin" }));
  $<HTMLButtonElement>("btn-leave").addEventListener("click", () => dispatch({ type: "askLeave" }));
  nameBtn.addEventListener("click", () => {
    const next = window.prompt(COPY.playingAs, session.myName);
    if (!next) return;
    if (saveName(next)) {
      session = { ...session, myName: next.trim(), nameSaved: true };
      nameBtn.textContent = session.myName;
    }
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
    $<HTMLButtonElement>("btn-name").dataset.tab = tab.id;
  }

  window.setInterval(() => {
    const node = document.getElementById("mp-expiry");
    if (node) node.textContent = expiryText();
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

  return {
    session: () => session,
    dispatch,
    noteResult(youWon: boolean, you: number, them: number) {
      dispatch({ type: "matchOver", youWon, you, them });
      $<HTMLButtonElement>("btn-conn").hidden = true;
    },
  };
}
