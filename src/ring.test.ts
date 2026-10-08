import { describe, expect, it } from "vitest";
import { RingModel, type RingInput } from "./ring";

const base: RingInput = { mode: "hidden", steps: 3, done: 0, current: 0, completeFor: -1, suppress: false, motion: 1 };
const run = (m: RingModel, p: Partial<RingInput>, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) m.update(dt, { ...base, ...p });
};

describe("RingModel", () => {
  it("is hidden in idle, listening and speaking", () => {
    const m = new RingModel();
    run(m, { mode: "hidden" }, 1);
    expect(m.opacity).toBeLessThan(0.01);
  });

  it("spins with no gap in thinking", () => {
    const m = new RingModel();
    run(m, { mode: "spin" }, 1);
    expect(m.opacity).toBeGreaterThan(0.99);
    expect(m.gap).toBeLessThan(0.01);
    expect(m.mode).toBe("spin");
  });

  it("rotates at 290°/s, slowed by reduced motion", () => {
    const a = new RingModel();
    a.update(0.1, { ...base, mode: "spin" });
    expect(a.rot).toBeCloseTo(29, 6);
    const b = new RingModel();
    b.update(0.1, { ...base, mode: "spin", motion: 0.35 });
    expect(b.rot).toBeCloseTo(10.15, 6);
  });

  it("steps mode: N segments with 7° gaps, fills follow done and current", () => {
    const m = new RingModel();
    run(m, { mode: "spin" }, 1);
    run(m, { mode: "steps", steps: 5, done: 2, current: 0.5 }, 1);
    expect(m.segments).toBe(5);
    expect(m.gap).toBeGreaterThan(6.9);
    expect(Array.from(m.fills.slice(0, 5))).toEqual([1, 1, 0.5, 0, 0]);
  });

  it("broken mode: 3 segments, 34° gaps, no fill", () => {
    const m = new RingModel();
    run(m, { mode: "broken" }, 1);
    expect(m.segments).toBe(3);
    expect(m.gap).toBeGreaterThan(33);
    expect(Array.from(m.fills.slice(0, 3))).toEqual([0, 0, 0]);
  });

  it("closes the gaps on completion, then fades after 0.5 s", () => {
    const m = new RingModel();
    run(m, { mode: "steps", steps: 3, done: 3 }, 1); // gaps open first
    run(m, { mode: "steps", steps: 3, done: 3, completeFor: 0.1 }, 0.4);
    expect(m.gap).toBeLessThan(0.5);
    expect(m.opacity).toBeGreaterThan(0.9);
    run(m, { mode: "steps", steps: 3, done: 3, completeFor: 0.6 }, 1);
    expect(m.opacity).toBeLessThan(0.02);
  });

  it("never changes the segment count while the gaps are open and the ring is visible", () => {
    const m = new RingModel();
    run(m, { mode: "steps", steps: 3 }, 1);
    m.update(1 / 60, { ...base, mode: "steps", steps: 6 });
    expect(m.segments).toBe(3);
    run(m, { mode: "spin" }, 1); // gap closes, then 3 again
    expect(m.segments).toBe(3);
  });

  it("clamps steps to 1..8", () => {
    const m = new RingModel();
    run(m, { mode: "steps", steps: 20 }, 0.01);
    expect(m.segments).toBe(8);
  });

  it("suppress fades the ring out", () => {
    const m = new RingModel();
    run(m, { mode: "spin" }, 1);
    run(m, { mode: "spin", suppress: true }, 1);
    expect(m.opacity).toBeLessThan(0.02);
  });
});
