const base = process.env.RELAY_HTTP ?? "http://127.0.0.1:8787";
const wsBase = base.replace(/^http/, "ws");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const runIp = `limits-${Date.now()}`;

async function api(path, opts = {}, ip = runIp) {
  const headers = { "x-test-ip": ip, ...(opts.headers ?? {}) };
  const res = await fetch(base + path, { ...opts, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
function randomCode() {
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

async function claim(name, ip = "limits") {
  for (let i = 0; i < 6; i++) {
    const want = randomCode();
    const created = await api("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "x-room-code": want },
      body: JSON.stringify({ name, v: 1 }),
    }, ip);
    if (created.status === 201 && created.body.code === want) return created.body;
  }
  throw new Error(`could not claim for ${name}`);
}

const empty = await api("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "   ", v: 1 }),
});
assert(empty.status === 400 && empty.body.error === "BAD_NAME", `empty ${empty.status}`);

const banned = await api("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "shithead", v: 1 }),
});
assert(banned.status === 400 && banned.body.error === "BAD_NAME", `blocklist ${banned.status}`);

const long = await api("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "abcdefghijklmnopq", v: 1 }),
});
assert(long.status === 400, `long ${long.status}`);

const version = await api("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Girish", v: 99 }),
});
assert(version.status === 409 && version.body.error === "VERSION_MISMATCH", `version ${version.status}`);

const host = await claim("Girish\u0000");
const preview = await api(`/api/rooms/${host.code}`);
assert(preview.body.hostName === "Girish", `stripped ${preview.body.hostName}`);

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

const same = await api(`/api/rooms/${host.code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "girish", v: 1 }),
});
assert(same.status === 200, `dup join ${same.status}`);
const names = [];
const hostSock = new WebSocket(`${wsBase}/ws/${host.code}?token=${host.token}`);
hostSock.addEventListener("message", (event) => names.push(JSON.parse(event.data)));
await opened(hostSock);
const guest = new WebSocket(`${wsBase}/ws/${host.code}?token=${same.body.token}`);
await opened(guest);
await new Promise((r) => setTimeout(r, 250));
assert(names.some((m) => m.t === "peer_joined" && m.name === "girish (2)"), `E-47 ${JSON.stringify(names)}`);

hostSock.send(JSON.stringify({ t: "state", v: 99, tick: 1 }));
await new Promise((r) => setTimeout(r, 200));
assert(names.some((m) => m.error === "VERSION_MISMATCH"), `version ${JSON.stringify(names)}`);

let oversizedClosed = false;
hostSock.addEventListener("close", () => {
  oversizedClosed = true;
});
hostSock.send("x".repeat(3000));
await new Promise((r) => setTimeout(r, 250));
assert(oversizedClosed, "oversized socket stayed open");

const still = await api(`/api/rooms/${host.code}`);
assert(still.status === 200, `room crashed after bad client ${still.status}`);

const floodHost = await claim("Flood", "limits-flood");
const flood = new WebSocket(`${wsBase}/ws/${floodHost.code}?token=${floodHost.token}`);
await opened(flood);
let floodClosed = false;
flood.addEventListener("close", () => {
  floodClosed = true;
});
for (let i = 0; i < 120; i++) flood.send(JSON.stringify({ t: "emote", v: 1, id: "hey" }));
await new Promise((r) => setTimeout(r, 300));
assert(floodClosed, "flood was not closed");
const floodPreview = await api(`/api/rooms/${floodHost.code}`, {}, "limits-flood");
assert(floodPreview.status === 200, `room crashed after flood ${floodPreview.status}`);

const malformed = new WebSocket(`${wsBase}/ws/${floodHost.code}?token=${floodHost.token}`);
await opened(malformed);
let malformedClosed = false;
malformed.addEventListener("close", () => {
  malformedClosed = true;
});
malformed.send("this is not json {");
await new Promise((r) => setTimeout(r, 200));
assert(malformedClosed, "malformed socket stayed open");
const after = await api(`/api/rooms/${floodHost.code}`, {}, "limits-flood");
assert(after.status === 200, `room crashed after malformed ${after.status}`);

let limited = null;
for (let i = 0; i < 6; i++) {
  limited = await api("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Cap", v: 1 }),
  }, "limits-cap");
}
assert(limited.status === 429 && limited.body.error === "RATE_LIMITED", `create cap ${limited.status}`);

const look = await claim("Look", "limits-look");
let lookup = null;
for (let i = 0; i < 21; i++) lookup = await api(`/api/rooms/${look.code}`, {}, "limits-look");
assert(lookup.status === 429 && lookup.body.error === "RATE_LIMITED", `lookup cap ${lookup.status} ${JSON.stringify(lookup.body)}`);

guest.close();
console.log("limits ok");
