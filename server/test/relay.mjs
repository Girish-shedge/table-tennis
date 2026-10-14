const base = process.env.RELAY_HTTP ?? "http://127.0.0.1:8787";
const wsBase = base.replace(/^http/, "ws");
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function api(path, opts = {}) {
  const headers = { "x-test-ip": `relay-${Date.now()}-${Math.random()}`, ...(opts.headers ?? {}) };
  const res = await fetch(base + path, { ...opts, headers });
  const body = await res.json();
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

const want = randomCode();
const created = await api("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json", "x-room-code": want },
  body: JSON.stringify({ name: "Girish", v: 1 }),
});
assert(created.status === 201 && created.body.code === want, "create");
const joined = await api(`/api/rooms/${want}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Ravi", v: 1 }),
});
assert(joined.status === 200, "join");

const hostMessages = [];
const guestMessages = [];
const host = new WebSocket(`${wsBase}/ws/${want}?token=${created.body.token}`);
const guest = new WebSocket(`${wsBase}/ws/${want}?token=${joined.body.token}`);
host.addEventListener("message", (event) => hostMessages.push(event.data));
guest.addEventListener("message", (event) => guestMessages.push(event.data));
await opened(host);
await opened(guest);

host.send("ping");
const pong = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no pong")), 2000);
  host.addEventListener("message", (event) => {
    if (event.data === "pong") {
      clearTimeout(timer);
      resolve(event.data);
    }
  });
});
assert(pong === "pong", "auto pong");

const snapshot = JSON.stringify({ t: "state", v: 1, tick: 7, phase: "RALLY" });
host.send(snapshot);
await new Promise((r) => setTimeout(r, 150));
assert(guestMessages.includes(snapshot), `forward ${JSON.stringify(guestMessages)}`);

const started = Date.now();
guest.close();
const notice = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("peer was not told")), 6000);
  const take = (raw) => {
    if (typeof raw !== "string" || raw === "pong") return;
    const msg = JSON.parse(raw);
    if (msg.t === "peer_left") {
      clearTimeout(timer);
      resolve(msg);
    }
  };
  for (const raw of hostMessages) take(raw);
  host.addEventListener("message", (event) => take(event.data));
});
assert(notice.why === "away" || notice.why === "reconnecting", `why ${notice.why}`);
assert(Date.now() - started < 6000, "detection took 6s or more");
host.close();
console.log("relay ok");
