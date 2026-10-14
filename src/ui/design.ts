// Dev-only component sheet (design.html). Not imported by the game.
import "./styles.css";
import "./footer.css";
import "./mp.css";

const disc = document.getElementById("demo-count");
const num = document.getElementById("demo-count-n");
const order = ["3", "2", "1", "Go"];
let i = 0;
if (disc && num) {
  window.setInterval(() => {
    i = (i + 1) % order.length;
    num.textContent = order[i];
    disc.classList.remove("tick");
    void disc.offsetWidth;
    disc.classList.add("tick");
  }, 1000);
}
