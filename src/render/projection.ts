import { CONFIG } from "../config";

export interface Layout {
  /** Viewport size in CSS px. */
  W: number;
  H: number;
  portrait: boolean;
  /** Design box (centered, aspect preserved) in CSS px. */
  box: { x: number; y: number; w: number; h: number; s: number };
  /** Key vertical anchors in CSS px. */
  scoreY: number;
  captionY: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Pixels per meter at this depth. */
  scale: number;
}

const LANDSCAPE = { w: 1136, h: 718, scoreY: 0.13, farY: 0.41, nearY: 0.82, nearW: 0.524, captionY: 0.875 };
const PORTRAIT = { w: 720, h: 1100, scoreY: 0.11, farY: 0.36, nearY: 0.79, nearW: 0.92, captionY: 0.835 };

export function computeLayout(W: number, H: number): Layout {
  const portrait = W < H * 1.05;
  const d = portrait ? PORTRAIT : LANDSCAPE;
  const s = Math.min(W / d.w, H / d.h);
  const w = d.w * s;
  const h = d.h * s;
  const box = { x: (W - w) / 2, y: (H - h) / 2, w, h, s };
  return {
    W,
    H,
    portrait,
    box,
    scoreY: box.y + d.scoreY * h,
    captionY: box.y + d.captionY * h,
  };
}

/**
 * Pinhole-style projection of table-space (x right, y up, z into the screen)
 * onto the canvas. Tuned so the table trapezoid matches the reference frames.
 */
export class Projection {
  cx = 0;
  horizonY = 0;
  /** Pixels per meter at z = 0. */
  K = 1;
  /** Camera distance behind z = 0 (meters). */
  d = 1;
  /** Camera height above the table (meters). */
  camH = 1;
  nearY = 0;
  farY = 0;

  update(layout: Layout) {
    const d = layout.portrait ? PORTRAIT : LANDSCAPE;
    const { box } = layout;
    const nearW = d.nearW * box.w;
    this.nearY = box.y + d.nearY * box.h;
    this.farY = box.y + d.farY * box.h;
    this.cx = box.x + box.w / 2;

    const r = CONFIG.farNearRatio; // scale(far) / scale(near)
    this.d = (r * CONFIG.tableL) / (1 - r);
    this.K = nearW / CONFIG.tableW;
    const camHK = (this.nearY - this.farY) / (1 - r);
    this.camH = camHK / this.K;
    this.horizonY = this.nearY - camHK;
  }

  scaleAt(z: number): number {
    return this.K / (1 + z / this.d);
  }

  project(x: number, y: number, z: number): Projected {
    const scale = this.scaleAt(z);
    return {
      x: this.cx + x * scale,
      y: this.horizonY + (this.camH - y) * scale,
      scale,
    };
  }

  /** Inverse-project a screen point onto the horizontal plane at height `y`. */
  unprojectToPlane(sx: number, sy: number, y: number): { x: number; z: number } {
    const dy = Math.max(sy - this.horizonY, 1e-3);
    const inv = ((this.camH - y) * this.K) / dy; // = 1 + z/d
    const z = this.d * (inv - 1);
    const x = ((sx - this.cx) * inv) / this.K;
    return { x, z };
  }
}
