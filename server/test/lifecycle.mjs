const base = process.env.RELAY_HTTP ?? "http://127.0.0.1:8787";
const CLOCKS = {
  "x-join-window-ms": "800",
  "x-inactivity-ms": "1800",
  "x-reconnect-ms": "700",
  "x-both-ms": "1000",
};
const wsBase = base.replace(/^http/, "ws");
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function randomCode() {
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

async function claim(name, extra = {}) {
  for (let i = 0; i < 6; i++) {
    const want = randomCode();
    const created = await api("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "x-room-code": want, ...CLOCKS },
      body: JSON.stringify({ name, v: 1, ...extra }),
    });
    if (created.status === 201 && created.body.code === want) return created.body;
  }
  throw new Error("could not claim a room");
}

function open(code, token) {
  const ws = new WebSocket(`${wsBase}/ws/${code}?token=${token}`);
  const q = [];
  const waiters = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else q.push(msg);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () => reject(new Error("socket error")));
  });
  return {
    ws,
    ready,
    next(ms = 2500) {
      if (q.length) return Promise.resolve(q.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("message timeout")), ms);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
  };
}

async function until(sock, pred, ms = 2500) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const msg = await sock.next(ms - (Date.now() - start));
    if (pred(msg)) return msg;
  }
  throw new Error("expected message did not arrive");
}

function send(sock, msg) {
  sock.ws.send(JSON.stringify({ v: 1, ...msg }));
}

// E-2: after the join window, a join is expired. A join before it cancels the alarm.
{
  const room = await claim("Late");
  await sleep(1100);
  const late = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ravi", v: 1 }),
  });
  assert(late.status === 410 && late.body.error === "ROOM_EXPIRED", `E-2 late ${late.status} ${JSON.stringify(late.body)}`);
  const preview = await api(`/api/rooms/${room.code}`);
  assert(preview.status === 410, `E-2 preview ${preview.status}`);
}

{
  const room = await claim("Early");
  const joined = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ravi", v: 1 }),
  });
  assert(joined.status === 200, "E-2 join in time");
  await sleep(1100);
  const preview = await api(`/api/rooms/${room.code}`);
  assert(preview.status === 200 && preview.body.status === "LOBBY_FULL", `E-2 held ${preview.status} ${JSON.stringify(preview.body)}`);
}

// E-1: host socket drops while waiting; guest still joins and hears that the host stepped away.
{
  const room = await claim("Girish");
  const host = open(room.code, room.token);
  await host.ready;
  await until(host, (m) => m.t === "hello");
  host.ws.close();
  await sleep(150);
  const joined = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ravi", v: 1 }),
  });
  assert(joined.status === 200, "E-1 guest can still join");
  const guest = open(room.code, joined.body.token);
  await guest.ready;
  const away = await until(guest, (m) => m.t === "peer_left" && m.why === "away");
  assert(away.name === "Girish", "E-1 away name");
  const host2 = open(room.code, room.token);
  await host2.ready;
  const hello = await until(host2, (m) => m.t === "hello");
  assert(hello.role === "host" && hello.peer?.name === "Ravi", "E-1 host resumes");
  host2.ws.close();
  guest.ws.close();
}

// E-3: guest leaves before start. Slot frees and a new guest can join.
{
  const room = await claim("Host");
  const host = open(room.code, room.token);
  await host.ready;
  await until(host, (m) => m.t === "hello");
  const joined = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ravi", v: 1 }),
  });
  const guest = open(room.code, joined.body.token);
  await guest.ready;
  send(guest, { t: "leave" });
  const left = await until(host, (m) => m.t === "peer_left" && m.why === "left");
  assert(left.name === "Ravi", "E-3 left");
  await sleep(100);
  const again = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Sam", v: 1 }),
  });
  assert(again.status === 200 && again.body.hostName === "Host", `E-3 rejoin ${again.status}`);
  host.ws.close();
  guest.ws.close();
}

// E-4: start while the guest socket is down.
{
  const room = await claim("Host");
  const host = open(room.code, room.token);
  await host.ready;
  const joined = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ravi", v: 1 }),
  });
  assert(joined.status === 200, "E-4 joined");
  send(host, { t: "start_request" });
  const rejected = await until(host, (m) => m.t === "start_rejected");
  assert(rejected.reason === "not_connected", "E-4 reason");
  host.ws.close();
}

// E-7: hosting a second room closes the first.
{
  const first = await claim("Host");
  const sock = open(first.code, first.token);
  await sock.ready;
  const second = await claim("Host", { previousCode: first.code, previousToken: first.token });
  const closed = await until(sock, (m) => m.t === "room_closed");
  assert(closed.why === "host_cancelled", `E-7 ${closed.why}`);
  const preview = await api(`/api/rooms/${first.code}`);
  assert(preview.status === 410 && preview.body.error === "ROOM_ENDED", "E-7 ended");
  assert(second.code !== first.code, "E-7 new room");
  sock.ws.close();
}

// E-10: host cancels while the guest is in the lobby.
{
  const room = await claim("Girish");
  const host = open(room.code, room.token);
  await host.ready;
  const joined = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ravi", v: 1 }),
  });
  const guest = open(room.code, joined.body.token);
  await guest.ready;
  await until(guest, (m) => m.t === "hello");
  send(host, { t: "leave" });
  const closed = await until(guest, (m) => m.t === "room_closed");
  assert(closed.why === "host_cancelled", `E-10 ${closed.why}`);
  const late = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Sam", v: 1 }),
  });
  assert(late.status === 404 || late.status === 410, `E-10 late join ${late.status}`);
  host.ws.close();
  guest.ws.close();
}

// E-9: nobody presses start.
{
  const room = await claim("Host");
  const host = open(room.code, room.token);
  await host.ready;
  const joined = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ravi", v: 1 }),
  });
  const guest = open(room.code, joined.body.token);
  await guest.ready;
  const closed = await until(host, (m) => m.t === "room_closed" && m.why === "inactivity", 3000);
  assert(closed.why === "inactivity", "E-9");
  const preview = await api(`/api/rooms/${room.code}`);
  assert(preview.body.error === "ROOM_ENDED", "E-9 ended");
  host.ws.close();
  guest.ws.close();
}

async function playing() {
  const room = await claim("Girish");
  const host = open(room.code, room.token);
  await host.ready;
  const joined = await api(`/api/rooms/${room.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ravi", v: 1 }),
  });
  const guest = open(room.code, joined.body.token);
  await guest.ready;
  await until(host, (m) => m.t === "peer_joined");
  send(host, { t: "start_request" });
  await until(host, (m) => m.t === "start_ok");
  send(host, { t: "countdown", n: 0 });
  await sleep(80);
  const preview = await api(`/api/rooms/${room.code}`);
  assert(preview.body.status === "PLAYING", `playing ${JSON.stringify(preview.body)}`);
  return { room, host, guest, guestToken: joined.body.token };
}

// E-14 then E-11: checkpoint survives a host reload; a guest drop recovers inside the window.
{
  const { room, host, guest, guestToken } = await playing();
  send(host, { t: "checkpoint", score: { player: 4, ai: 3 }, server: "ai" });
  await sleep(80);
  host.ws.close();
  await sleep(120);
  const host2 = open(room.code, room.token);
  await host2.ready;
  const hello = await until(host2, (m) => m.t === "hello");
  assert(hello.checkpoint?.score?.player === 4 && hello.checkpoint.server === "ai", `E-14 ${JSON.stringify(hello.checkpoint)}`);
  assert(hello.roomStatus === "PLAYING", `E-14 status ${hello.roomStatus}`);

  guest.ws.close();
  const dropped = await until(host2, (m) => m.t === "peer_left" && m.why === "reconnecting");
  assert(dropped.name === "Ravi", "E-11 drop");
  await sleep(200);
  const guest2 = open(room.code, guestToken);
  await guest2.ready;
  const back = await until(host2, (m) => m.t === "peer_joined" && m.name === "Ravi");
  assert(back.t === "peer_joined", "E-11 back");
  await sleep(1100);
  const preview = await api(`/api/rooms/${room.code}`);
  assert(preview.status === 200 && preview.body.status === "PLAYING", `E-11 still playing ${JSON.stringify(preview.body)}`);
  host2.ws.close();
  guest2.ws.close();
}

// E-13: host drop past the window is a forfeit.
{
  const { room, host, guest } = await playing();
  host.ws.close();
  const lost = await until(guest, (m) => m.t === "peer_left" && m.why === "forfeit", 2500);
  assert(lost.name === "Girish", `E-13 ${lost.why}`);
  const preview = await api(`/api/rooms/${room.code}`);
  assert(preview.status === 410, `E-13 ended ${preview.status}`);
  guest.ws.close();
}

// E-15: both drop, room is destroyed after the longer window.
{
  const { room, host, guest } = await playing();
  host.ws.close();
  guest.ws.close();
  await sleep(1600);
  const preview = await api(`/api/rooms/${room.code}`);
  assert(preview.status === 410, `E-15 ${preview.status} ${JSON.stringify(preview.body)}`);
}

// E-8: a finished match previews as ended.
{
  const { room, host, guest } = await playing();
  send(host, { t: "match_over", score: { player: 11, ai: 7 } });
  await sleep(80);
  const preview = await api(`/api/rooms/${room.code}`);
  assert(preview.status === 410 && preview.body.error === "ROOM_ENDED", `E-8 ${JSON.stringify(preview.body)}`);
  host.ws.close();
  guest.ws.close();
}

// E-22: the newest tab wins.
{
  const room = await claim("Host");
  const first = open(room.code, room.token);
  await first.ready;
  await until(first, (m) => m.t === "hello");
  const second = open(room.code, room.token);
  await second.ready;
  const dup = await until(first, (m) => m.t === "error" && m.error === "DUPLICATE_TAB");
  assert(dup.error === "DUPLICATE_TAB", "E-22");
  const hello = await until(second, (m) => m.t === "hello");
  assert(hello.role === "host", "E-22 newest");
  second.ws.close();
}

console.log("lifecycle ok");
