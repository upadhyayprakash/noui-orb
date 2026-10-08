import { describe, expect, it } from "vitest";
import { Character, IMPULSE_GESTURES } from "./character";

type Axis = "sq" | "y" | "x" | "rot";
const AXES: Axis[] = ["sq", "y", "x", "rot"];

/** Samples every spring at multiples of 1/15 s while stepping at `fps`. */
function trajectory(name: keyof typeof IMPULSE_GESTURES, fps: number, seconds = 2) {
  const c = new Character();
  c.schedule(IMPULSE_GESTURES[name]!.impulses);
  const dt = 1 / fps;
  const every = Math.round(fps / 15);
  const out: Record<Axis, number[]> = { sq: [], y: [], x: [], rot: [] };
  for (let i = 1; i * dt <= seconds + 1e-9; i++) {
    c.step(dt, false, null);
    if (i % every === 0) for (const a of AXES) out[a].push(c[a]);
  }
  return out;
}

describe("springs are frame-rate independent (SPEC §8.2, §16)", () => {
  for (const name of ["nod", "shake", "huh", "hop", "emit"] as const) {
    it(`${name}: the same trajectory at 15 fps and 60 fps`, () => {
      const a = trajectory(name, 60);
      const b = trajectory(name, 15);
      for (const axis of AXES) {
        const peak = Math.max(...a[axis].map(Math.abs));
        if (peak < 0.05) continue;
        const worst = Math.max(...a[axis].map((v, i) => Math.abs(v - b[axis][i]!)));
        expect(worst / peak).toBeLessThan(0.02);
      }
    });
  }

  it("a nod still visibly moves at 15 fps", () => {
    const t = trajectory("nod", 15);
    expect(Math.max(...t.y.map(Math.abs))).toBeGreaterThan(0.5);
    expect(Math.max(...t.sq.map(Math.abs))).toBeGreaterThan(0.05);
  });
});

describe("scheduled impulses", () => {
  it("fire inside sub-steps at their own time, not at the next frame", () => {
    const c = new Character();
    c.schedule([{ at: 110, x: -52 }]);
    c.step(0.1, false, null);
    expect(c.xV).toBe(0);
    c.step(0.0667, false, null); // crosses 110 ms inside this frame
    expect(c.queueLength).toBe(0);
  });

  it("cancelScheduled drops pending impulses", () => {
    const c = new Character();
    c.schedule([{ at: 300, sq: 1.9 }]);
    c.cancelScheduled();
    expect(c.atRest()).toBe(true);
  });

  it("atRest is false while moving and true once settled", () => {
    const c = new Character();
    c.schedule(IMPULSE_GESTURES.nod!.impulses);
    expect(c.atRest()).toBe(false);
    for (let i = 0; i < 300; i++) c.step(1 / 60, false, null);
    expect(c.atRest()).toBe(true);
  });
});

describe("rate limit (SPEC §8.3)", () => {
  it("allows one expressive gesture per window", () => {
    const c = new Character();
    expect(c.rateOk(1000, 1200)).toBe(true);
    c.markExpressive(1000);
    expect(c.rateOk(1500, 1200)).toBe(false);
    expect(c.rateOk(2200, 1200)).toBe(true);
  });
});

describe("lean", () => {
  it("leans toward the bottom when listening without a pointer, and gain stays 1.6", () => {
    const c = new Character();
    for (let i = 0; i < 120; i++) c.step(1 / 60, true, null);
    expect(c.leanX).toBeCloseTo(0, 2);
    expect(c.leanY).toBeCloseTo(0.55, 1);
    expect(c.leanGain).toBeCloseTo(1.6, 1);
  });

  it("clamps the pointer vector to the unit disc", () => {
    const c = new Character();
    for (let i = 0; i < 300; i++) c.step(1 / 60, true, { x: 6, y: 8 });
    expect(Math.hypot(c.leanX, c.leanY)).toBeLessThanOrEqual(1.001);
    expect(c.leanX / c.leanY).toBeCloseTo(0.75, 1);
  });

  it("does not lean when not listening", () => {
    const c = new Character();
    for (let i = 0; i < 120; i++) c.step(1 / 60, false, { x: 1, y: 0 });
    expect(Math.hypot(c.leanX, c.leanY)).toBeLessThan(0.01);
  });

  it("pointAt leans at gain 4.5 for its duration and then returns", () => {
    const c = new Character();
    c.pointAt(3, 4, 1, false);
    for (let i = 0; i < 40; i++) c.step(1 / 60, false, null);
    expect(c.leanGain).toBeGreaterThan(3);
    expect(c.leanX / c.leanY).toBeCloseTo(0.75, 1);
    for (let i = 0; i < 240; i++) c.step(1 / 60, false, null);
    expect(Math.hypot(c.leanX, c.leanY)).toBeLessThan(0.02);
  });
});

describe("wait", () => {
  it("dims from 8 s to 10 s, glances every 3.2 s starting at 1.2 s", () => {
    const c = new Character();
    const glances: number[] = [];
    let t = 0;
    c.onGlance = () => glances.push(Math.round(t * 10) / 10);
    c.startWait();
    for (; t < 12; t += 1 / 60) {
      c.step(1 / 60, false, null);
      if (Math.abs(t - 7.5) < 1 / 120) expect(c.dim).toBeLessThan(0.01);
    }
    expect(glances.slice(0, 3)).toEqual([1.2, 4.4, 7.6]);
    expect(c.dim).toBeGreaterThan(0.95);
  });

  it("scaleOffset breathes at 0.018·sin(1.15t) while waiting", () => {
    const c = new Character();
    c.startWait();
    for (let i = 0; i < 60; i++) c.step(1 / 60, false, null);
    expect(c.scaleOffset("idle")).toBeCloseTo(0.018 * Math.sin(c.waitT * 1.15), 6);
  });
});

describe("interrupt and breath", () => {
  it("interrupt pulls back then returns", () => {
    const c = new Character();
    c.startInterrupt();
    c.step(0.05, false, null);
    expect(c.scaleOffset("listening")).toBeLessThan(-0.01);
    for (let i = 0; i < 120; i++) c.step(1 / 60, false, null);
    expect(c.scaleOffset("listening")).toBe(0);
  });

  it("breath only applies while speaking", () => {
    const c = new Character();
    c.startBreath();
    c.step(0.3, false, null);
    expect(c.scaleOffset("speaking")).toBeCloseTo(0.035, 3);
    expect(c.scaleOffset("idle")).toBe(0);
  });
});
