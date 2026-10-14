/**
 * Tap feedback for every button-like control. CSS :active is too brief on a quick phone tap
 * (and iOS skips it without a touch listener), so the pressed look is held for at least
 * MIN_MS, then released so the springy return in styles.css can play.
 */
const SELECTOR = ".btn, .chip, .option, .avatar";
const MIN_MS = 110;

export function mountPress() {
  let current: HTMLElement | null = null;
  let downAt = 0;
  let timer = 0;

  const release = () => {
    const node = current;
    if (!node) return;
    current = null;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => node.classList.remove("is-pressed"), Math.max(0, MIN_MS - (performance.now() - downAt)));
  };

  document.addEventListener(
    "pointerdown",
    (e) => {
      const node = (e.target as Element | null)?.closest<HTMLElement>(SELECTOR);
      if (!node || (node as HTMLButtonElement).disabled) return;
      window.clearTimeout(timer);
      current?.classList.remove("is-pressed");
      current = node;
      downAt = performance.now();
      node.classList.add("is-pressed");
    },
    { passive: true },
  );
  document.addEventListener("pointerup", release, { passive: true });
  document.addEventListener("pointercancel", release, { passive: true });
  window.addEventListener("blur", release);
  // Keyboard presses (Space / Enter on a focused button) get the same sink and bounce.
  document.addEventListener("keydown", (e) => {
    if ((e.key !== " " && e.key !== "Enter") || e.repeat) return;
    const node = (e.target as Element | null)?.closest<HTMLElement>(SELECTOR);
    if (!node) return;
    current = node;
    downAt = performance.now();
    node.classList.add("is-pressed");
  });
  document.addEventListener("keyup", release);
}
