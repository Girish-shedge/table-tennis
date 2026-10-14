/** One small message that pops in, holds, and fades out. Text is set with textContent only. */
let hideTimer = 0;
let removeTimer = 0;

export function showToast(text: string, warn = false, holdMs = 2200) {
  const node = document.getElementById("toast");
  if (!node || !text) return;
  window.clearTimeout(hideTimer);
  window.clearTimeout(removeTimer);
  node.classList.remove("out");
  node.classList.toggle("warn", warn);
  node.textContent = text;
  node.hidden = false;
  // Restart the entrance animation when a toast replaces another.
  node.style.animation = "none";
  void node.offsetWidth;
  node.style.animation = "";
  hideTimer = window.setTimeout(() => {
    node.classList.add("out");
    removeTimer = window.setTimeout(() => {
      node.hidden = true;
      node.classList.remove("out");
    }, 320);
  }, holdMs);
}
