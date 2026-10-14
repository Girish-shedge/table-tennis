/**
 * Chaos against a local relay (E-11 to E-14, E-19).
 * Drop a player, restore them, reload the host, and deliver a slow message.
 */
const base = process.env.RELAY_HTTP ?? "http://127.0.0.1:8787";
const wsBase = base.replace(/^http/, "ws");
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function api(path, opts = {}) {
  const headers = { "x-test-ip": `chaos-${Date.now()}-${Math.random()}`, ...(opts.headers ?? {}) };
  const res = await fetch(base + path, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function randomCode() {
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

function opened(ws) {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("open timeout")), 4000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("socket error"));
    });
  });
}

function waitFor(list, pred, ms = 4000) {
  const hit = list.map(parse).find(pred);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a message")), ms);
    const check = (raw) => {
      const msg = parse(raw);
      if (!pred(msg)) return;
      clearTimeout(timer);
      resolve(msg);
    };
    list.push = new Proxy(list.push, {
      apply(target, thisArg, args) {
        const n = Reflect.apply(target, thisArg, args);
        check(args[0]);
        return n;
      },
    });
  });
}

function parse(raw) {
  if (typeof raw !== "string" || raw === "pong" || raw === "ping") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function collect(ws) {
  const list = [];
  ws.addEventListener("message", (event) => list.push(event.data));
  return list;
}

const code = randomCode();
const created = await api("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json", "x-room-code": code, "x-reconnect-ms": "4000" },
  body: JSON.stringify({ name: "Host", v: 1 }),
});
assert(created.status === 201, `create ${created.status}`);
const joined = await api(`/api/rooms/${code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Guest", v: 1 }),
});
assert(joined.status === 200, "join");

let host = new WebSocket(`${wsBase}/ws/${code}?token=${created.body.token}`);
let guest = new WebSocket(`${wsBase}/ws/${code}?token=${joined.body.token}`);
let hostLog = collect(host);
let guestLog = collect(guest);
await opened(host);
await opened(guest);

host.send(JSON.stringify({ t: "start_request", v: 1 }));
await waitFor(hostLog, (m) => m?.t === "start_ok");
host.send(JSON.stringify({ t: "countdown", v: 1, n: 0 }));
host.send(JSON.stringify({ t: "checkpoint", v: 1, score: { player: 4, ai: 2 }, server: "ai" }));
await new Promise((r) => setTimeout(r, 150));

guest.close();
const dropped = await waitFor(hostLog, (m) => m?.t === "peer_left");
assert(dropped.why === "reconnecting", `drop why ${dropped.why}`);

guest = new WebSocket(`${wsBase}/ws/${code}?token=${joined.body.token}`);
guestLog = collect(guest);
await opened(guest);
const back = await waitFor(guestLog, (m) => m?.t === "hello");
assert(back.checkpoint?.score?.player === 4, "checkpoint survived the drop");
assert(back.roomStatus === "PLAYING" || back.roomStatus === "PAUSED", `status ${back.roomStatus}`);

host.close();
host = new WebSocket(`${wsBase}/ws/${code}?token=${created.body.token}`);
hostLog = collect(host);
await opened(host);
const reloaded = await waitFor(hostLog, (m) => m?.t === "hello");
assert(reloaded.role === "host" && reloaded.checkpoint?.score?.ai === 2, "host reload kept the checkpoint");

const slow = JSON.stringify({ t: "emote", v: 1, id: 0 });
await new Promise((r) => setTimeout(r, 350));
host.send(slow);
const seen = await waitFor(guestLog, (m) => m?.t === "emote" && m.id === 0);
assert(seen.id === 0, "a delayed message still arrives");

host.close();
guest.close();
console.log("chaos ok");
