import { clamp, expK } from "./math";
import type { GestureName, OrbState } from "./types";

export interface Impulse {
  sq?: number;
  y?: number;
  x?: number;
  rot?: number;
}

export interface TimedImpulse extends Impulse {
  /** Milliseconds from gesture start. */
  at: number;
}

export interface GestureDef {
  impulses: TimedImpulse[];
  /** Seconds the flow stalls. */
  hesitate?: number;
  /** Minimum completion flash. */
  flash?: number;
}

/** SPEC §8.1. Gestures that are plain sets of impulses; interrupt, point and wait have their own logic. */
export const IMPULSE_GESTURES: Partial<Record<GestureName, GestureDef>> = {
  nod: { impulses: [{ at: 0, sq: 1.9, y: 22 }] },
  shake: {
    hesitate: 0.35,
    impulses: [
      { at: 0, x: 34 },
      { at: 110, x: -52 },
      { at: 230, x: 40 },
      { at: 350, x: -20 },
    ],
  },
  huh: {
    hesitate: 0.5,
    impulses: [
      { at: 0, rot: 95, x: 18 },
      { at: 240, rot: -140, x: -26 },
    ],
  },
  hop: {
    impulses: [
      { at: 0, y: -60, sq: -1.4 },
      { at: 300, sq: 1.9 },
    ],
  },
  emit: { flash: 0.6, impulses: [{ at: 0, sq: 1.3 }] },
};

/** Gestures subject to the rate limit (SPEC §8.3). */
export const EXPRESSIVE: ReadonlySet<GestureName> = new Set(["nod", "shake", "huh", "hop", "emit", "point"]);

export interface Pointer {
  x: number;
  y: number;
}

const SUBSTEP_HZ = 240;
const LEAN_REST = 1.6;
const LEAN_POINT = 4.5;
const REST_POS = 0.05;
const REST_VEL = 0.5;

/**
 * Four damped springs, the lean vector, wait and breath (SPEC §8). Semi-implicit Euler sub-stepped at
 * 240 Hz so motion is the same at any frame rate. Scheduled impulses fire inside the sub-steps for the
 * same reason.
 */
export class Character {
  sq = 0;
  sqV = 0;
  x = 0;
  xV = 0;
  y = 0;
  yV = 0;
  rot = 0;
  rotV = 0;

  leanX = 0;
  leanY = 0;
  leanGain = LEAN_REST;

  /** Seconds the flow is stalled for. */
  hesitate = 0;
  /** Seconds since the breath began (9 = not breathing). */
  breathT = 9;
  /** Seconds since an interrupt (9 = none). */
  yieldT = 9;

  pointT = 0;
  private pointX = 0;
  private pointY = 0;

  waiting = false;
  waitT = 0;
  private glanceT = 0;
  dim = 0;

  /** Called when a wait glance is due. */
  onGlance: (() => void) | null = null;

  private time = 0;
  private queue: Array<{ due: number; imp: Impulse }> = [];
  private lastExpressiveAt = -Infinity;

  constructor(public waitDimAfterMs = 8000) {}

  /** Rate limit check for expressive gestures. `nowMs` is any monotonic clock. */
  rateOk(nowMs: number, limitMs: number): boolean {
    return nowMs - this.lastExpressiveAt >= limitMs;
  }

  markExpressive(nowMs: number): void {
    this.lastExpressiveAt = nowMs;
  }

  impulse(i: Impulse): void {
    if (i.sq) this.sqV += i.sq;
    if (i.y) this.yV += i.y;
    if (i.x) this.xV += i.x;
    if (i.rot) this.rotV += i.rot;
  }

  /** Applies an impulse now (at 0) or queues it. Returns the time the last one fires, in seconds from now. */
  schedule(imps: TimedImpulse[]): number {
    let last = 0;
    for (const t of imps) {
      if (t.at <= 0) this.impulse(t);
      else this.queue.push({ due: this.time + t.at / 1000, imp: t });
      last = Math.max(last, t.at / 1000);
    }
    return last;
  }

  cancelScheduled(): void {
    this.queue.length = 0;
  }

  startInterrupt(): void {
    this.cancelScheduled();
    this.clearPoint();
    this.stopWait();
    this.yieldT = 0;
    this.impulse({ y: -10, sq: 0.8 });
  }

  startBreath(): void {
    this.breathT = 0;
  }

  startWait(): void {
    this.waiting = true;
    this.waitT = 0;
    this.glanceT = 1.2;
  }

  stopWait(): void {
    this.waiting = false;
  }

  /** Lean toward a unit direction. `jab` also kicks the springs the same way. */
  pointAt(dirX: number, dirY: number, seconds: number, jab: boolean): void {
    const len = Math.hypot(dirX, dirY) || 1;
    this.pointX = dirX / len;
    this.pointY = dirY / len;
    this.pointT = seconds;
    if (jab) {
      this.xV += this.pointX * 16;
      this.yV += this.pointY * 16;
    }
  }

  clearPoint(): void {
    this.pointT = 0;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  /** True when the springs have settled and nothing is queued. */
  atRest(): boolean {
    return (
      this.queue.length === 0 &&
      Math.abs(this.sq) < REST_POS && Math.abs(this.y) < REST_POS && Math.abs(this.x) < REST_POS && Math.abs(this.rot) < REST_POS &&
      Math.abs(this.sqV) < REST_VEL && Math.abs(this.yV) < REST_VEL && Math.abs(this.xV) < REST_VEL && Math.abs(this.rotV) < REST_VEL
    );
  }

  /** Zeroes all motion (gestures turned off, reduced motion, intro). */
  reset(): void {
    this.sq = this.sqV = this.x = this.xV = this.y = this.yV = this.rot = this.rotV = 0;
    this.leanX = this.leanY = 0;
    this.leanGain = LEAN_REST;
    this.hesitate = 0;
    this.breathT = 9;
    this.yieldT = 9;
    this.pointT = 0;
    this.waiting = false;
    this.waitT = 0;
    this.dim = 0;
    this.queue.length = 0;
  }

  step(dt: number, listening: boolean, pointer: Pointer | null): void {
    const n = Math.max(1, Math.ceil(dt * SUBSTEP_HZ));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.time += h;
      for (let q = 0; q < this.queue.length; q++) {
        const item = this.queue[q]!;
        if (item.due <= this.time) {
          this.impulse(item.imp);
          this.queue.splice(q, 1);
          q--;
        }
      }
      this.sqV += (-170 * this.sq - 11 * this.sqV) * h;
      this.sq += this.sqV * h;
      this.yV += (-150 * this.y - 10 * this.yV) * h;
      this.y += this.yV * h;
      this.xV += (-140 * this.x - 11 * this.xV) * h;
      this.x += this.xV * h;
      this.rotV += (-160 * this.rot - 10 * this.rotV) * h;
      this.rot += this.rotV * h;
    }

    this.breathT += dt;
    this.yieldT += dt;
    this.hesitate = Math.max(0, this.hesitate - dt);
    if (this.pointT > 0) this.pointT -= dt;

    if (this.waiting) {
      this.waitT += dt;
      this.glanceT -= dt;
      if (this.glanceT <= 0) {
        this.onGlance?.();
        this.glanceT = 3.2;
      }
    }
    const dimStart = this.waitDimAfterMs / 1000;
    const dimTarget = this.waiting ? clamp((this.waitT - dimStart) / 2) : 0;
    this.dim += (dimTarget - this.dim) * expK(dt, 0.5);

    let tx = 0;
    let ty = 0;
    let gainTarget = LEAN_REST;
    if (this.pointT > 0) {
      tx = this.pointX;
      ty = this.pointY;
      gainTarget = LEAN_POINT;
    } else if (listening) {
      if (pointer) {
        tx = pointer.x;
        ty = pointer.y;
      } else {
        ty = 0.55;
      }
      const len = Math.hypot(tx, ty);
      if (len > 1) {
        tx /= len;
        ty /= len;
      }
    }
    const k = expK(dt, 0.28);
    this.leanX += (tx - this.leanX) * k;
    this.leanY += (ty - this.leanY) * k;
    this.leanGain += (gainTarget - this.leanGain) * k;
  }

  /** `translate(lean·gain + x, …) rotate(rot) scale(…)` for the orb body (SPEC §8.2). */
  transform(): string {
    return (
      `translate(${(this.leanX * this.leanGain + this.x).toFixed(3)}%,${(this.leanY * this.leanGain + this.y).toFixed(3)}%) ` +
      `rotate(${this.rot.toFixed(2)}deg) scale(${(1 + this.sq * 0.55).toFixed(4)},${(1 - this.sq).toFixed(4)})`
    );
  }

  /** The gesture part of the orb scale: breath before speaking, slow breath while waiting, pull back on interrupt. */
  scaleOffset(state: OrbState): number {
    let a = 0;
    if (state === "speaking" && this.breathT < 0.6) a += Math.sin((Math.PI * this.breathT) / 0.6) * 0.035;
    if (this.waiting) a += 0.018 * Math.sin(this.waitT * 1.15);
    if (this.yieldT < 1.5) a -= 0.07 * (1 - Math.exp(-this.yieldT / 0.06)) * Math.exp(-this.yieldT / 0.45);
    return a;
  }
}
