/**
 * The noui mark (SPEC §10.1). PLACEHOLDER artwork: replace the paths and keep the three named parts
 * and the 120-unit viewBox. The o's radius comes from `config.geometry.oRadius`.
 */
export const MARK = {
  size: 120,
  /** The mark's box as a fraction of the element during the intro. */
  boxFraction: 0.42,
  letters: ["M14 52V31a16 16 0 0 1 32 0v21", "M14 68v21a16 16 0 0 0 32 0V68"],
  stem: { x: 90, y1: 68, y2: 105 },
  dot: { cx: 90, cy: 33 },
} as const;

export interface Handoff {
  /** Translate X, percent of the element. */
  dx: number;
  /** Translate Y, percent of the element. */
  dy: number;
  /** Scale. */
  s: number;
}

/** SPEC §10.4. The orb transform that sits exactly on the o, computed from the mark. */
export function handoff(oRadius: number, orbRadius: number, mark: typeof MARK = MARK): Handoff {
  const f = mark.boxFraction;
  return {
    dx: (mark.dot.cx / mark.size - 0.5) * f * 100,
    dy: (mark.dot.cy / mark.size - 0.5) * f * 100,
    s: ((oRadius / mark.size) * f) / orbRadius,
  };
}

/** Inner SVG markup for the mark. */
export function markMarkup(): string {
  const paths = MARK.letters.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<g class="letters">${paths}</g>` +
    `<line class="stem" x1="${MARK.stem.x}" y1="${MARK.stem.y1}" x2="${MARK.stem.x}" y2="${MARK.stem.y2}"/>` +
    `<circle class="dot" cx="${MARK.dot.cx}" cy="${MARK.dot.cy}" r="20"/>`
  );
}
