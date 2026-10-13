export type InputKind = "mouse" | "touch";

export interface InputCallbacks {
  /** Screen → world on the paddle plane. */
  toWorld: (sx: number, sy: number) => { x: number; z: number };
  /** Is this screen point over the player paddle? */
  hitPaddle: (sx: number, sy: number) => boolean;
  /** Current paddle target (so a grab does not make it jump). */
  paddleTarget: () => { x: number; z: number };
  /** Space / click / tap. */
  onPrimary: () => void;
  onMute: () => void;
  onEscape: () => void;
}

export class Input {
  keys = new Set<string>();
  /** Last pointer type that interacted, drives the hint caption. */
  kind: InputKind = "mouse";
  hovering = false;
  grabbing = false;
  /** Desired paddle position while dragging, else null. */
  dragTarget: { x: number; z: number } | null = null;

  private activeId: number | null = null;
  private start = { x: 0, y: 0, t: 0, moved: false };
  private offset = { x: 0, z: 0 };
  /** Relative mode: finger not on the paddle; move it by deltas with softened depth. */
  private relative = false;
  private downWorld = { x: 0, z: 0 };
  private downTarget = { x: 0, z: 0 };
  private static readonly RELATIVE_Z_GAIN = 0.6;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: InputCallbacks,
  ) {
    if (window.matchMedia("(pointer: coarse)").matches) this.kind = "touch";

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("lostpointercapture", (e) => {
      if (e.pointerId === this.activeId) this.release();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private release() {
    this.activeId = null;
    this.grabbing = false;
    this.dragTarget = null;
  }

  /** -1..1 per axis from the keyboard. */
  axis(): { x: number; z: number } {
    const k = this.keys;
    const x = (k.has("ArrowRight") || k.has("KeyD") ? 1 : 0) - (k.has("ArrowLeft") || k.has("KeyA") ? 1 : 0);
    const z = (k.has("ArrowUp") || k.has("KeyW") ? 1 : 0) - (k.has("ArrowDown") || k.has("KeyS") ? 1 : 0);
    return { x, z };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON")) {
      if (e.code !== "Space" && e.code !== "Escape") return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "Space" || e.code === "Enter") this.cb.onPrimary();
    else if (e.code === "KeyM") this.cb.onMute();
    else if (e.code === "Escape") this.cb.onEscape();
  };

  private onDown = (e: PointerEvent) => {
    // A mouse press always starts fresh (covers a lost pointerup).
    if (this.activeId !== null && e.pointerType !== "mouse") return;
    this.activeId = e.pointerId;
    this.kind = e.pointerType === "mouse" ? "mouse" : "touch";
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    this.start = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };

    const onPaddle = this.cb.hitPaddle(e.clientX, e.clientY);
    const world = this.cb.toWorld(e.clientX, e.clientY);
    const target = this.cb.paddleTarget();
    if (onPaddle || this.kind === "touch") {
      this.grabbing = true;
      this.relative = !onPaddle;
      this.downWorld = world;
      this.downTarget = target;
      this.offset = { x: target.x - world.x, z: target.z - world.z };
      if (this.kind === "touch" && onPaddle) this.offset.z += 0.18; // lift above the finger
      this.dragTarget = { ...target };
    }
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && this.activeId === null) {
      this.hovering = this.cb.hitPaddle(e.clientX, e.clientY);
      this.kind = "mouse";
    }
    if (e.pointerId !== this.activeId) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      // The button was released outside our reach; drop the grab.
      this.release();
      this.hovering = this.cb.hitPaddle(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - this.start.x;
    const dy = e.clientY - this.start.y;
    if (dx * dx + dy * dy > 64) this.start.moved = true;
    if (this.grabbing) {
      const world = this.cb.toWorld(e.clientX, e.clientY);
      this.dragTarget = this.relative
        ? {
            x: this.downTarget.x + (world.x - this.downWorld.x),
            z: this.downTarget.z + (world.z - this.downWorld.z) * Input.RELATIVE_Z_GAIN,
          }
        : { x: world.x + this.offset.x, z: world.z + this.offset.z };
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    const quick = performance.now() - this.start.t < 350;
    const tap = !this.start.moved && quick;
    this.release();
    if (e.pointerType === "mouse") this.hovering = this.cb.hitPaddle(e.clientX, e.clientY);
    if (tap && e.type !== "pointercancel") this.cb.onPrimary();
  };
}
