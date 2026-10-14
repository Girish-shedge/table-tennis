const url = process.env.RELAY_URL ?? "ws://127.0.0.1:8787/debug/echo";
const ws = new WebSocket(url);
const timer = setTimeout(() => {
  console.error("timeout waiting for echo");
  process.exit(1);
}, 8000);

ws.addEventListener("open", () => ws.send("hello-echo"));
ws.addEventListener("message", (event) => {
  if (event.data !== "hello-echo") {
    console.error("unexpected payload", event.data);
    process.exit(1);
  }
  clearTimeout(timer);
  console.log("echo ok");
  ws.close();
  process.exit(0);
});
ws.addEventListener("error", () => {
  console.error("socket error");
  process.exit(1);
});
