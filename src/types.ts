export type OrbState = "idle" | "listening" | "thinking" | "working" | "speaking" | "error";
export type Placement = "center" | "room" | "aside";
export type GestureName = "nod" | "shake" | "huh" | "hop" | "interrupt" | "emit" | "point" | "wait";

export interface OrbProgress {
  /** Number of known steps, 1 to 8. */
  steps: number;
  /** Completed steps. */
  done: number;
  /** 0 to 1 progress within the current step. */
  current?: number;
}

export interface OrbLevels {
  /** 0 to 1 loudness. */
  amp: number;
  /** 0 to 1 spectral brightness. */
  bright?: number;
  /** 0 to 1. */
  bass?: number;
  /** 0 to 1. */
  treble?: number;
}

export interface PlacementPose {
  /** Translate X, percent of the box. */
  dx: number;
  /** Translate Y, percent of the box. */
  dy: number;
  /** Scale. */
  s: number;
}

export interface OrbConfig {
  reactivity: number;
  maxSwellPercent: number;
  attackMs: number;
  releaseMs: number;
  flowSpeed: number;
  grain: number;
  geometry: { orbRadius: number; ringRadius: number; ringStroke: number; oRadius: number };
  placements: Record<Placement, PlacementPose>;
  gestureRateLimitMs: number;
  waitDimAfterMs: number;
  maxDevicePixelRatio: number;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type AudioChannelName = "input" | "output";

export interface OrbEventDetails {
  "orb-statechange": { from: OrbState; to: OrbState };
  "orb-gesture": { name: GestureName; phase: "start" | "end" };
  "orb-recall": Record<string, never>;
  "orb-intro-end": Record<string, never>;
  "orb-outro-end": Record<string, never>;
  "orb-input-silent": { seconds: number };
  "orb-fallback": { reason: string };
}

/** Internal: the smoothed or raw audio features, all 0 to 1. */
export interface Levels {
  amp: number;
  bright: number;
  bass: number;
  treble: number;
}
