import type { DeepPartial, OrbConfig } from "./types";

export const DEFAULT_CONFIG: OrbConfig = {
  reactivity: 1.2,
  maxSwellPercent: 5,
  attackMs: 45,
  releaseMs: 260,
  flowSpeed: 1,
  grain: 0.06,
  geometry: { orbRadius: 0.39, ringRadius: 0.45, ringStroke: 0.005, oRadius: 20 },
  placements: {
    center: { dx: 0, dy: 0, s: 1 },
    room: { dx: 0, dy: -16, s: 0.64 },
    aside: { dx: -37, dy: -37, s: 0.2 },
  },
  gestureRateLimitMs: 1200,
  waitDimAfterMs: 8000,
  maxDevicePixelRatio: 1.75,
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function mergeInto(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) {
    if (!(key in target)) continue;
    const next = patch[key];
    const cur = target[key];
    if (isPlainObject(cur) && isPlainObject(next)) mergeInto(cur, next);
    else if (typeof cur === "number" && typeof next === "number" && Number.isFinite(next)) target[key] = next;
  }
}

/** Returns a new config: `base` with `patch` merged over it. Unknown keys and non-finite numbers are ignored. */
export function mergeConfig(base: OrbConfig, patch: DeepPartial<OrbConfig>): OrbConfig {
  const out = structuredClone(base) as unknown as Record<string, unknown>;
  mergeInto(out, patch as Record<string, unknown>);
  return out as unknown as OrbConfig;
}
