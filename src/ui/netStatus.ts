import { pingRelay } from "../net/api";
import { COPY } from "../strings";

/**
 * "Your network: Good" under Play with a friend. Times round trips to the relay and uses the
 * same bands as the in-match connection chip (under 200 ms good, up to 450 ms okay, above that weak).
 * It only measures while the home page is on screen, so an idle tab costs one request every 30 s.
 */
const GOOD_MS = 200;
const WEAK_MS = 450;
const REFRESH_MS = 30_000;

type Level = "checking" | "good" | "okay" | "weak" | "offline";

export function mountNetStatus(relayUrl: string) {
  const line = document.getElementById("net-status");
  const bars = document.getElementById("net-bars");
  const word = document.getElementById("net-word");
  const home = document.getElementById("overlay-start");
  if (!line || !bars || !word || !home) return;
  line.hidden = false;

  let samples: number[] = [];
  let busy = false;
  let lastAt = 0;

  const label = document.getElementById("net-label");
  if (label) label.textContent = COPY.netLabel;

  const paint = (level: Level, ms = 0) => {
    line.dataset.level = level;
    bars.dataset.bars = level === "good" ? "3" : level === "okay" ? "2" : level === "weak" ? "1" : "0";
    word.textContent = {
      checking: COPY.netChecking,
      good: COPY.netGood,
      okay: COPY.netOkay,
      weak: COPY.netWeak,
      offline: COPY.netOffline,
    }[level];
    line.title = ms ? `${ms} ms to the game server` : "";
  };

  const onHome = () => !home.hidden && document.visibilityState === "visible";

  async function check(full: boolean) {
    if (busy) return;
    if (!navigator.onLine) {
      samples = [];
      paint("offline");
      return;
    }
    busy = true;
    lastAt = Date.now();
    if (!samples.length) paint("checking");
    // The first request also pays for DNS and the TLS handshake, so a full check throws it away.
    if (full) await pingRelay(relayUrl);
    let got = 0;
    for (let i = 0; i < (full ? 3 : 1); i++) {
      const ms = await pingRelay(relayUrl);
      if (ms === null) continue;
      got++;
      samples = [...samples, ms].slice(-3);
    }
    busy = false;
    if (!got) {
      samples = [];
      paint("offline");
      return;
    }
    const ms = Math.round([...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]);
    paint(ms < GOOD_MS ? "good" : ms <= WEAK_MS ? "okay" : "weak", ms);
  }

  const refresh = () => {
    if (onHome() && Date.now() - lastAt >= REFRESH_MS - 1000) void check(!samples.length);
  };

  void check(true);
  window.setInterval(refresh, REFRESH_MS);
  document.addEventListener("visibilitychange", refresh);
  new MutationObserver(refresh).observe(home, { attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("online", () => void check(true));
  window.addEventListener("offline", () => {
    samples = [];
    paint("offline");
  });
}
