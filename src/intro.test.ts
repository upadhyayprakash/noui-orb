import { describe, expect, it } from "vitest";
import { CROSSFADE_MS, INTRO_MS, OUTRO_MS, crossfadeFrame, introFrame, logoFrame, outroFrame } from "./intro";
import { MARK, handoff } from "./mark";

describe("handoff (SPEC §10.4)", () => {
  it("matches the spec numbers for the placeholder mark", () => {
    const h = handoff(20, 0.39);
    expect(h.dx).toBeCloseTo(10.5, 6);
    expect(h.dy).toBeCloseTo(-9.45, 6);
    expect(h.s).toBeCloseTo(0.1795, 4);
  });

  it("follows the artwork: a different o moves the hand-off", () => {
    const moved = handoff(24, 0.39, { ...MARK, dot: { cx: 80, cy: 40 } } as unknown as typeof MARK);
    expect(moved.dx).toBeCloseTo((80 / 120 - 0.5) * 42, 6);
    expect(moved.dy).toBeCloseTo((40 / 120 - 0.5) * 42, 6);
    expect(moved.s).toBeCloseTo(((24 / 120) * 0.42) / 0.39, 6);
  });
});

describe("introFrame (SPEC §10.2)", () => {
  it("holds with the dot resting above the stem for 450 ms", () => {
    const f = introFrame(200, 20);
    expect([f.stemY1, f.dotCy, f.dotR]).toEqual([68, 55, 5.5]);
    expect(f.orbOpacity).toBe(0);
  });

  it("pushes the stem down to 79 with the dot riding to 66 at 690 ms", () => {
    const f = introFrame(690, 20);
    expect(f.stemY1).toBeCloseTo(79, 6);
    expect(f.dotCy).toBeCloseTo(66, 6);
  });

  it("springs the stem back and flies the dot to the o, then swells it to r = 20", () => {
    const f = introFrame(1150, 20);
    expect(f.stemY1).toBeCloseTo(68, 6);
    expect(f.dotCy).toBeCloseTo(33, 6);
    expect(f.dotR).toBeCloseTo(8.5, 6);
    expect(introFrame(1450, 20).dotR).toBeCloseTo(20, 6);
  });

  it("holds the complete logo from 1450 to 2200 ms", () => {
    for (const t of [1450, 1800, 2199]) {
      const f = introFrame(t, 20);
      expect([f.stemY1, f.dotCy, f.dotR, f.orbOpacity]).toEqual([68, 33, 20, 0].map((v, i) => (i === 3 ? 0 : v)));
    }
  });

  it("shows the orb on the o at 2200 ms and grows it to the centre by 3380 ms", () => {
    const at = introFrame(2200, 20);
    expect(at.orbOpacity).toBe(1);
    expect(at.orbK).toBe(1);
    expect(introFrame(2380, 20).dotOpacity).toBe(0);
    const end = introFrame(INTRO_MS, 20);
    expect(end.orbK).toBe(0);
    expect(end.orbOpacity).toBe(1);
    expect([end.dotOpacity, end.lettersOpacity, end.stemOpacity]).toEqual([0, 0, 0]);
  });

  it("fades the letters and stem over the first 300 ms of the growth", () => {
    expect(introFrame(2380, 20).lettersOpacity).toBe(1);
    expect(introFrame(2530, 20).lettersOpacity).toBeCloseTo(0.5, 6);
    expect(introFrame(2680, 20).lettersOpacity).toBe(0);
  });

  it("takes about 3.4 s", () => {
    expect(INTRO_MS).toBeGreaterThan(3300);
    expect(INTRO_MS).toBeLessThan(3500);
  });
});

describe("outroFrame (SPEC §10.3)", () => {
  it("shrinks the orb onto the o over 750 ms, then fades the dot in, then the letters", () => {
    expect(outroFrame(0, 20).orbK).toBe(0);
    expect(outroFrame(750, 20).orbK).toBeCloseTo(1, 6);
    expect(outroFrame(820, 20).dotOpacity).toBeCloseTo(0.5, 6);
    const hidden = outroFrame(900, 20);
    expect(hidden.orbOpacity).toBe(0);
    expect(hidden.dotOpacity).toBe(1);
    expect(outroFrame(1100, 20).lettersOpacity).toBeCloseTo((1100 - 890) / 420, 6);
    expect(outroFrame(OUTRO_MS, 20)).toEqual(logoFrame(20));
  });

  it("takes about 1.3 s", () => {
    expect(OUTRO_MS).toBeGreaterThan(1250);
    expect(OUTRO_MS).toBeLessThan(1350);
  });
});

describe("reduced motion crossfade (SPEC §8.3)", () => {
  it("takes 200 ms and swaps the logo for the centred orb", () => {
    expect(CROSSFADE_MS).toBe(200);
    const half = crossfadeFrame(100, 20, true);
    expect(half.lettersOpacity).toBeCloseTo(0.5, 6);
    expect(half.orbOpacity).toBeCloseTo(0.5, 6);
    expect(half.orbK).toBe(0);
    const out = crossfadeFrame(200, 20, false);
    expect(out.lettersOpacity).toBe(1);
    expect(out.orbOpacity).toBe(0);
  });
});
