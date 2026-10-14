import http from "node:http";

const base = process.env.RELAY_HTTP ?? "http://127.0.0.1:8787";
const wsBase = process.env.RELAY_WS ?? "ws://127.0.0.1:8787";

function upgradeStatus(path, origin) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: 8787,
      path,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        ...(origin ? { Origin: origin } : {}),
      },
    });
    req.on("upgrade", (res) => {
      resolve(res.statusCode ?? 101);
      res.destroy();
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function api(path, opts = {}) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("socket error")));
  });
}

function nextMessage(ws, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("message timeout")), ms);
    ws.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(JSON.parse(event.data));
    }, { once: true });
  });
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
function randomCode() {
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

async function claim(name) {
  for (let i = 0; i < 6; i++) {
    const want = randomCode();
    const created = await api("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "x-room-code": want },
      body: JSON.stringify({ name, v: 1 }),
    });
    if (created.status === 201 && created.body.code === want) return created;
  }
  throw new Error("could not claim a fresh room code");
}

const created = await claim("Girish");
const code = created.body.code;
assert(typeof created.body.token === "string" && created.body.playerId, "create payload");

const again = await api("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json", "x-room-code": code },
  body: JSON.stringify({ name: "Girish", v: 1 }),
});
assert(again.status === 201, `collision retry ${again.status}`);
assert(again.body.code !== code, "collision should pick a new code");

const preview = await api(`/api/rooms/${code}`);
assert(preview.status === 200, `preview ${preview.status}`);
assert(preview.body.hostName === "Girish" && preview.body.status === "WAITING", "preview body");

const missing = await api("/api/rooms/ZZZZ");
assert(missing.status === 404 && missing.body.error === "ROOM_NOT_FOUND", "missing room");

const joined = await api(`/api/rooms/${code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Ravi", v: 1 }),
});
assert(joined.status === 200, `join ${joined.status} ${JSON.stringify(joined.body)}`);
assert(joined.body.hostName === "Girish" && joined.body.token, "join payload");

const third = await api(`/api/rooms/${code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Sam", v: 1 }),
});
assert(third.status === 409 && third.body.error === "ROOM_FULL", `third join ${third.status} ${JSON.stringify(third.body)}`);

const denied = await api("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ name: "Girish", v: 1 }),
});
assert(denied.status === 403 && denied.body.error === "ORIGIN_DENIED", `origin ${denied.status}`);

const extended = await api(`/api/rooms/${code}/extend`, {
  method: "POST",
  headers: { authorization: `Bearer ${created.body.token}` },
});
assert(extended.status === 409, `extend after join should fail ${extended.status}`);

const fresh = await claim("Host");
const ext1 = await api(`/api/rooms/${fresh.body.code}/extend`, {
  method: "POST",
  headers: { authorization: `Bearer ${fresh.body.token}` },
});
assert(ext1.status === 200 && ext1.body.expiresAt > fresh.body.expiresAt, "extend once");
const ext2 = await api(`/api/rooms/${fresh.body.code}/extend`, {
  method: "POST",
  headers: { authorization: `Bearer ${fresh.body.token}` },
});
assert(ext2.status === 409, "extend twice");

const host = new WebSocket(`${wsBase}/ws/${code}?token=${created.body.token}`);
await waitOpen(host);
const hello = await nextMessage(host);
assert(hello.t === "hello" && hello.role === "host" && hello.peer?.name === "Ravi", `hello ${JSON.stringify(hello)}`);

const badRes = await upgradeStatus(`/ws/${code}?token=nope`);
assert(badRes === 401, `bad token ${badRes}`);

const evilWs = await upgradeStatus(`/ws/${code}?token=${created.body.token}`, "https://evil.example");
assert(evilWs === 403, `ws origin ${evilWs}`);

const guest = new WebSocket(`${wsBase}/ws/${code}?token=${joined.body.token}`);
const joinedNote = nextMessage(host);
await waitOpen(guest);
const guestHello = await nextMessage(guest);
assert(guestHello.t === "hello" && guestHello.role === "guest", "guest hello");
const note = await joinedNote;
assert(note.t === "peer_joined" && note.name === "Ravi", `peer_joined ${JSON.stringify(note)}`);

host.close();
guest.close();
console.log("rooms ok");
