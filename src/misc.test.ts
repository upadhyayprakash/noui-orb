import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "./config";
import { FrameGuard } from "./perf";
import { accessibleName, isOrbState, STATES } from "./states";

describe("mergeConfig", () => {
  it("merges nested partials without touching the base", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { reactivity: 2, placements: { aside: { dx: 10 } }, geometry: { oRadius: 22 } });
    expect(merged.reactivity).toBe(2);
    expect(merged.placements.aside).toEqual({ dx: 10, dy: -37, s: 0.2 });
    expect(merged.geometry.oRadius).toBe(22);
    expect(merged.geometry.orbRadius).toBe(0.39);
    expect(DEFAULT_CONFIG.reactivity).toBe(1.2);
    expect(DEFAULT_CONFIG.placements.aside.dx).toBe(-37);
  });

  it("ignores unknown keys, wrong types and non-finite numbers", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      nope: 1, grain: "x", flowSpeed: NaN, attackMs: Infinity,
    } as never);
    expect(merged).toEqual(DEFAULT_CONFIG);
  });
});

describe("states (SPEC §5)", () => {
  it("has the six states with the spec numbers", () => {
    expect(STATES.idle).toMatchObject({ flow: 0.25, energy: 0, sat: 0.93, ring: "hidden" });
    expect(STATES.listening).toMatchObject({ flow: 0.5, energy: 0.06, sat: 1, dir: -1, audio: "in" });
    expect(STATES.thinking).toMatchObject({ flow: 1.3, energy: 0.3, ring: "spin", pulse: 0.2 });
    expect(STATES.working).toMatchObject({ flow: 0.6, energy: 0.12, sat: 0.95, ring: "steps", pulse: 0.06 });
    expect(STATES.speaking).toMatchObject({ audio: "out", dir: 1 });
    expect(STATES.error).toMatchObject({ flow: 0.08, energy: -0.12, sat: 0.08, ring: "broken" });
  });

  it("validates state names", () => {
    expect(isOrbState("working")).toBe(true);
    expect(isOrbState("toString")).toBe(false);
    expect(isOrbState(null)).toBe(false);
  });

  it("builds the accessible names", () => {
    expect(accessibleName("idle", "noui", null)).toBe("noui is idle");
    expect(accessibleName("listening", "noui", null)).toBe("noui is listening");
    expect(accessibleName("thinking", "noui", null)).toBe("noui is thinking");
    expect(accessibleName("working", "noui", { steps: 3, done: 1 })).toBe("noui is working, step 2 of 3");
    expect(accessibleName("working", "noui", { steps: 3, done: 3 })).toBe("noui is working, step 3 of 3");
    expect(accessibleName("working", "noui", null)).toBe("noui is working");
    expect(accessibleName("speaking", "noui", null)).toBe("noui is speaking");
    expect(accessibleName("error", "noui", null)).toBe("noui can't connect");
    expect(accessibleName("idle", "Orb", null)).toBe("Orb is idle");
  });
});

describe("FrameGuard (SPEC §14)", () => {
  const feed = (g: FrameGuard, ms: number, seconds: number) => {
    let changed = false;
    for (let t = 0; t < seconds * 1000; t += ms) changed = g.push(ms) || changed;
    return changed;
  };

  it("stays high quality at 60 fps", () => {
    const g = new FrameGuard();
    expect(feed(g, 16.7, 10)).toBe(false);
    expect(g.low).toBe(false);
  });

  it("drops to low quality after a 2 s window averaging over 20 ms", () => {
    const g = new FrameGuard();
    expect(feed(g, 33, 1.5)).toBe(false);
    expect(feed(g, 33, 1)).toBe(true);
    expect(g.low).toBe(true);
  });

  it("restores after 10 s of good frames", () => {
    const g = new FrameGuard();
    feed(g, 33, 2.5);
    expect(g.low).toBe(true);
    feed(g, 16.7, 9);
    expect(g.low).toBe(true);
    feed(g, 16.7, 3);
    expect(g.low).toBe(false);
  });

  it("ignores pauses (hidden tab, off-screen)", () => {
    const g = new FrameGuard();
    for (let i = 0; i < 20; i++) g.push(5000);
    feed(g, 16.7, 5);
    expect(g.low).toBe(false);
  });
});
