import { springy } from "./math";
import type { PlacementPose } from "./types";

type Ease = (x: number) => number;

/**
 * SPEC §9. Moves the orb between placements with the springy curve. A new target interrupts a running
 * transition from wherever the orb currently is.
 */
export class PlacementTween {
  readonly pose: PlacementPose = { dx: 0, dy: 0, s: 1 };
  active = false;

  private from: PlacementPose = { dx: 0, dy: 0, s: 1 };
  private to: PlacementPose = { dx: 0, dy: 0, s: 1 };
  private t = 0;
  private dur = 1;
  private done: (() => void) | null = null;
  private ease: Ease = springy;

  /** Snaps to a pose and resolves any running transition. */
  jump(p: PlacementPose): void {
    this.settle();
    this.pose.dx = p.dx;
    this.pose.dy = p.dy;
    this.pose.s = p.s;
  }

  /** Starts a transition. `done` runs when it ends or is interrupted by another one. */
  start(to: PlacementPose, ms: number, done?: () => void, ease: Ease = springy): void {
    this.settle();
    this.from = { ...this.pose };
    this.to = { ...to };
    this.t = 0;
    this.dur = Math.max(1, ms);
    this.active = true;
    this.done = done ?? null;
    this.ease = ease;
  }

  step(dtMs: number): void {
    if (!this.active) return;
    this.t += dtMs;
    const x = Math.min(1, this.t / this.dur);
    const p = x >= 1 ? 1 : this.ease(x);
    this.pose.dx = this.from.dx + (this.to.dx - this.from.dx) * p;
    this.pose.dy = this.from.dy + (this.to.dy - this.from.dy) * p;
    this.pose.s = this.from.s + (this.to.s - this.from.s) * p;
    if (x >= 1) this.settle();
  }

  private settle(): void {
    this.active = false;
    const d = this.done;
    this.done = null;
    d?.();
  }
}

/** The viewport circle of the orb for a box rectangle and pose (SPEC §3.2 `originRect`). */
export function orbCircle(
  box: { left: number; top: number; width: number; height: number },
  pose: PlacementPose,
  orbRadius: number,
): { x: number; y: number; r: number } {
  return {
    x: box.left + box.width / 2 + (pose.dx / 100) * box.width,
    y: box.top + box.height / 2 + (pose.dy / 100) * box.height,
    r: orbRadius * Math.min(box.width, box.height) * pose.s,
  };
}
