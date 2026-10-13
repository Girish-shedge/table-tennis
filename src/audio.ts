/** Tiny synthesized sound effects via Web Audio. Unlocks on the first gesture. */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  constructor() {
    const saved = localStorage.getItem("tt-muted");
    this.muted = saved === "1";
  }

  /** Call from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem("tt-muted", m ? "1" : "0");
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  toggle() {
    this.setMuted(!this.muted);
  }

  private blip(freq: number, dur: number, type: OscillatorType = "sine", gain = 1, slide = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hit(strength = 1) {
    this.blip(700 + strength * 150, 0.045, "triangle", 0.9, -200);
    this.blip(1400, 0.02, "sine", 0.25);
  }
  bounce() {
    this.blip(420, 0.03, "sine", 0.55, -80);
  }
  net() {
    this.blip(160, 0.09, "triangle", 0.6, -60);
  }
  pointWon() {
    this.blip(660, 0.09, "sine", 0.5);
    setTimeout(() => this.blip(990, 0.14, "sine", 0.5), 90);
  }
  pointLost() {
    this.blip(440, 0.1, "sine", 0.45);
    setTimeout(() => this.blip(300, 0.16, "sine", 0.45), 100);
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, "sine", 0.5), i * 110));
  }
  lose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, "triangle", 0.4), i * 140));
  }
}
