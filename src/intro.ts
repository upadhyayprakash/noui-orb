import { clamp, easeBack, easeInOut, easeOut, springy } from "./math";
import { MARK } from "./mark";

/** One frame of the logo/orb transition. */
export interface MarkFrame {
  stemY1: number;
  dotCy: number;
  dotR: number;
  dotOpacity: number;
  lettersOpacity: number;
  stemOpacity: number;
  /** 0 = hidden. */
  orbOpacity: number;
  /** 1 = the orb sits on the o, 0 = full size at the centre. */
  orbK: number;
}

export function newMarkFrame(): MarkFrame {
  return { stemY1: MARK.stem.y1, dotCy: MARK.dot.cy, dotR: 20, dotOpacity: 1, lettersOpacity: 1, stemOpacity: 1, orbOpacity: 0, orbK: 1 };
}

/** The complete logo at rest, orb hidden. */
export function logoFrame(oRadius: number, out: MarkFrame = newMarkFrame()): MarkFrame {
  out.stemY1 = MARK.stem.y1;
  out.dotCy = MARK.dot.cy;
  out.dotR = oRadius;
  out.dotOpacity = out.lettersOpacity = out.stemOpacity = 1;
  out.orbOpacity = 0;
  out.orbK = 1;
  return out;
}

/** The orb alone at full size: mark hidden. */
export function orbFrame(out: MarkFrame = newMarkFrame()): MarkFrame {
  out.dotOpacity = out.lettersOpacity = out.stemOpacity = 0;
  out.orbOpacity = 1;
  out.orbK = 0;
  return out;
}

/** Milliseconds, SPEC §10.2 (about 3.4 s). */
export const INTRO_MS = 3380;
/** Milliseconds, SPEC §10.3 without the optional move to the centre (about 1.3 s). */
export const OUTRO_MS = 1310;
/** Reduced motion crossfade (SPEC §8.3). */
export const CROSSFADE_MS = 200;

const STEM_TOP = MARK.stem.y1;

/** SPEC §10.2. `t` in ms from the start. */
export function introFrame(t: number, oRadius: number, out: MarkFrame = newMarkFrame()): MarkFrame {
  if (t >= INTRO_MS) return orbFrame(out);

  // 0 to 450: hold with the dot resting above the stem.
  let stemY1 = STEM_TOP;
  let dotCy = 55;
  let dotR = 5.5;
  if (t >= 450 && t < 690) {
    const p = easeInOut(clamp((t - 450) / 240));
    stemY1 = STEM_TOP + 11 * p;
    dotCy = 55 + 11 * p;
  } else if (t >= 690) {
    stemY1 = 79 - 11 * easeBack(clamp((t - 690) / 460));
    const p = easeOut(clamp((t - 690) / 420));
    dotCy = 66 - (66 - MARK.dot.cy) * p;
    dotR = 5.5 + 3 * p;
  }
  if (t >= 1150) dotR = 8.5 + (oRadius - 8.5) * easeBack(clamp((t - 1150) / 300));

  out.stemY1 = stemY1;
  out.dotCy = dotCy;
  out.dotR = dotR;
  out.orbOpacity = t >= 2200 ? 1 : 0;
  out.dotOpacity = t < 2200 ? 1 : 1 - clamp((t - 2200) / 180);
  const fade = t < 2380 ? 1 : 1 - clamp((t - 2380) / 300);
  out.lettersOpacity = out.stemOpacity = fade;
  out.orbK = t < 2380 ? 1 : 1 - springy(clamp((t - 2380) / 1000));
  return out;
}

/** SPEC §10.3 steps 3 to 5. `t` in ms from the start of the shrink. */
export function outroFrame(t: number, oRadius: number, out: MarkFrame = newMarkFrame()): MarkFrame {
  if (t >= OUTRO_MS) return logoFrame(oRadius, out);
  out.stemY1 = MARK.stem.y1;
  out.dotCy = MARK.dot.cy;
  out.dotR = oRadius;
  if (t < 750) {
    out.orbOpacity = 1;
    out.orbK = easeInOut(clamp(t / 750));
    out.dotOpacity = out.lettersOpacity = out.stemOpacity = 0;
  } else if (t < 890) {
    out.orbOpacity = 1;
    out.orbK = 1;
    out.dotOpacity = clamp((t - 750) / 140);
    out.lettersOpacity = out.stemOpacity = 0;
  } else {
    out.orbOpacity = 0;
    out.orbK = 1;
    out.dotOpacity = 1;
    out.lettersOpacity = out.stemOpacity = clamp((t - 890) / 420);
  }
  return out;
}

/** Reduced motion: the logo and the centred orb swap over 200 ms. `toOrb` picks the direction. */
export function crossfadeFrame(t: number, oRadius: number, toOrb: boolean, out: MarkFrame = newMarkFrame()): MarkFrame {
  const p = clamp(t / CROSSFADE_MS);
  logoFrame(oRadius, out);
  const mark = toOrb ? 1 - p : p;
  out.dotOpacity = out.lettersOpacity = out.stemOpacity = mark;
  out.orbOpacity = 1 - mark;
  out.orbK = 0;
  return out;
}
