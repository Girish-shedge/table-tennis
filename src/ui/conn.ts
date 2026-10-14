import { COPY } from "../strings";
import { showToast } from "./toast";

/**
 * Presents the connection text the game already writes into #conn-ping.
 * Numbers become a rounded "N ms", the bars follow 3 under 120 ms, 2 up to
 * 250 ms and 1 above that, and anything else (a warning sentence) becomes a
 * toast so the chip stays small. Presentation only: it reads the DOM text.
 */
export function mountConnChip() {
  const chip = document.getElementById("btn-conn");
  const ping = document.getElementById("conn-ping");
  const bars = document.getElementById("conn-bars");
  if (!chip || !ping || !bars) return;

  let rewriting = false;
  let weakSince = 0;
  let ms = 0;
  let note = false;
  let toasted = "";
  let toastedAt = 0;

  const say = (text: string) => {
    const now = Date.now();
    if (text === toasted && now - toastedAt < 15000) return;
    toasted = text;
    toastedAt = now;
    showToast(text, true, 3200);
  };

  const paint = () => {
    const now = Date.now();
    const slowForAWhile = ms > 250 && weakSince > 0 && now - weakSince >= 5000;
    const weak = note || slowForAWhile;
    const level = note ? 1 : ms < 120 ? 3 : ms <= 250 ? 2 : 1;
    bars.dataset.bars = String(level);
    chip.classList.toggle("weak", weak);
    const word = weak ? COPY.connWeak : level === 3 ? COPY.connStrong : COPY.connOkay;
    chip.setAttribute("aria-label", `${COPY.connection}: ${word}${ms && !note ? `, ${ms} ms` : ""}`);
    if (slowForAWhile) say(COPY.weakConnection);
  };

  const read = () => {
    if (rewriting) return;
    const raw = (ping.textContent ?? "").trim();
    const match = /^(\d+(?:\.\d+)?)\s*ms$/.exec(raw);
    if (match) {
      note = false;
      ms = Math.round(Number(match[1]));
      weakSince = ms > 250 ? weakSince || Date.now() : 0;
      const text = `${ms} ms`;
      if (raw !== text) {
        rewriting = true;
        ping.textContent = text;
        queueMicrotask(() => {
          rewriting = false;
        });
      }
    } else if (raw) {
      note = true;
      weakSince = 0;
      say(raw);
      rewriting = true;
      ping.textContent = COPY.connWeak;
      queueMicrotask(() => {
        rewriting = false;
      });
    }
    paint();
  };

  new MutationObserver(read).observe(ping, { childList: true, characterData: true, subtree: true });
  window.setInterval(paint, 1000);

  chip.addEventListener("click", () => {
    const open = chip.getAttribute("aria-expanded") === "true";
    chip.setAttribute("aria-expanded", open ? "false" : "true");
  });
}
