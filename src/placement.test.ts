import { describe, expect, it, vi } from "vitest";
import { easeOut } from "./math";
import { PlacementTween, orbCircle } from "./placement";

const center = { dx: 0, dy: 0, s: 1 };
const room = { dx: 0, dy: -16, s: 0.64 };
const aside = { dx: -37, dy: -37, s: 0.2 };

describe("PlacementTween", () => {
  it("runs to the target in the given time and calls done", () => {
    const t = new PlacementTween();
    const done = vi.fn();
    t.start(room, 650, done);
    t.step(300);
    expect(t.active).toBe(true);
    expect(done).not.toHaveBeenCalled();
    t.step(400);
    expect(t.active).toBe(false);
    expect(t.pose).toEqual(room);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("overshoots on the springy curve", () => {
    const t = new PlacementTween();
    t.start({ dx: 100, dy: 0, s: 1 }, 650);
    let max = 0;
    for (let i = 0; i < 65; i++) {
      t.step(10);
      max = Math.max(max, t.pose.dx);
    }
    expect(max).toBeGreaterThan(100);
  });

  it("a new placement interrupts from the current position and resolves the old one", () => {
    const t = new PlacementTween();
    const first = vi.fn();
    t.start(aside, 650, first);
    t.step(200);
    const mid = { ...t.pose };
    t.start(center, 650);
    expect(first).toHaveBeenCalledTimes(1);
    expect(t.pose).toEqual(mid);
    t.step(1);
    expect(Math.abs(t.pose.dx - mid.dx)).toBeLessThan(5);
  });

  it("jump snaps and resolves a running transition", () => {
    const t = new PlacementTween();
    const done = vi.fn();
    t.start(room, 650, done);
    t.jump(aside);
    expect(t.pose).toEqual(aside);
    expect(done).toHaveBeenCalled();
    expect(t.active).toBe(false);
  });

  it("accepts a different curve (reduced motion)", () => {
    const t = new PlacementTween();
    t.start({ dx: 100, dy: 0, s: 1 }, 200, undefined, easeOut);
    let max = 0;
    for (let i = 0; i < 25; i++) {
      t.step(10);
      max = Math.max(max, t.pose.dx);
    }
    expect(max).toBeLessThanOrEqual(100);
  });
});

describe("orbCircle (originRect)", () => {
  const box = { left: 100, top: 50, width: 400, height: 400 };
  it("centre placement: the middle of the box, radius 39%", () => {
    expect(orbCircle(box, center, 0.39)).toEqual({ x: 300, y: 250, r: 156 });
  });
  it("aside: moved by percent of the box, radius scaled", () => {
    const c = orbCircle(box, aside, 0.39);
    expect(c.x).toBeCloseTo(300 - 148, 6);
    expect(c.y).toBeCloseTo(250 - 148, 6);
    expect(c.r).toBeCloseTo(156 * 0.2, 6);
  });
});
