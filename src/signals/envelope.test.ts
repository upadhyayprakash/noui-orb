import { describe, expect, it } from "vitest";
import { Envelope } from "./envelope";

const cfg = { reactivity: 1, attackMs: 45, releaseMs: 260 };
const loud = { amp: 1, bright: 0.8, bass: 0.5, treble: 0.5 };
const quiet = { amp: 0, bright: 0.5, bass: 0, treble: 0 };

function run(env: Envelope, f: typeof loud, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) env.update(dt, f, cfg);
}

describe("Envelope", () => {
  it("attacks fast and releases slowly", () => {
    const env = new Envelope();
    run(env, loud, 0.045); // one attack time constant: ~63%
    expect(env.amp).toBeGreaterThan(0.55);
    expect(env.amp).toBeLessThan(0.72);
    run(env, loud, 0.5);
    expect(env.amp).toBeGreaterThan(0.99);
    run(env, quiet, 0.26); // one release time constant: ~37% left
    expect(env.amp).toBeGreaterThan(0.3);
    expect(env.amp).toBeLessThan(0.45);
  });

  it("multiplies loudness by reactivity and clamps", () => {
    const env = new Envelope();
    for (let i = 0; i < 120; i++) env.update(1 / 60, { ...loud, amp: 0.5 }, { ...cfg, reactivity: 1.2 });
    expect(env.amp).toBeCloseTo(0.6, 2);
    for (let i = 0; i < 120; i++) env.update(1 / 60, { ...loud, amp: 0.9 }, { ...cfg, reactivity: 1.2 });
    expect(env.amp).toBeCloseTo(1, 2);
  });

  it("smooths brightness with a 0.12 s time constant", () => {
    const env = new Envelope();
    run(env, { ...quiet, bright: 1 }, 0.12);
    expect(env.bright).toBeGreaterThan(0.5 + 0.5 * 0.55);
    expect(env.bright).toBeLessThan(0.5 + 0.5 * 0.7);
  });

  it("counts onsets, re-arms below 0.22, and reports pace", () => {
    const env = new Envelope();
    // A syllable every 0.6 s (1.67/s): short loud burst, then a gap long enough for the 260 ms release to re-arm.
    for (let s = 0; s < 8; s++) {
      run(env, loud, 0.1);
      run(env, quiet, 0.5);
    }
    expect(env.paceRate).toBeGreaterThanOrEqual(1.4);
    expect(env.paceRate).toBeLessThanOrEqual(2.1);
    expect(env.pace).toBeGreaterThan(0.2);
  });

  it("does not re-arm during a gap shorter than the release allows (as in the prototype)", () => {
    const env = new Envelope();
    for (let s = 0; s < 4; s++) {
      run(env, loud, 0.12);
      run(env, quiet, 0.13);
    }
    expect(env.paceRate).toBe(0.5);
  });

  it("does not count a sustained loud signal more than once", () => {
    const env = new Envelope();
    run(env, loud, 1.5);
    expect(env.paceRate).toBeCloseTo(0.5, 5);
  });

  it("forgets onsets after 2 s", () => {
    const env = new Envelope();
    run(env, loud, 0.2);
    run(env, quiet, 2.2);
    expect(env.paceRate).toBe(0);
  });
});
