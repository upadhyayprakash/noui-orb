import type { OrbProgress, OrbState } from "./types";

export type RingMode = "hidden" | "spin" | "steps" | "broken";

export interface StateDef {
  flow: number;
  energy: number;
  sat: number;
  /** Wave direction: 1 outward, -1 inward. */
  dir: 1 | -1;
  /** Which audio channel drives the orb, if any. */
  audio: "in" | "out" | null;
  ring: RingMode;
  /** Idle pulse amplitude when there is no audio. */
  pulse: number;
}

/** SPEC §5. */
export const STATES: Record<OrbState, StateDef> = {
  idle: { flow: 0.25, energy: 0, sat: 0.93, dir: 1, audio: null, ring: "hidden", pulse: 0 },
  listening: { flow: 0.5, energy: 0.06, sat: 1, dir: -1, audio: "in", ring: "hidden", pulse: 0 },
  thinking: { flow: 1.3, energy: 0.3, sat: 1, dir: 1, audio: null, ring: "spin", pulse: 0.2 },
  working: { flow: 0.6, energy: 0.12, sat: 0.95, dir: 1, audio: null, ring: "steps", pulse: 0.06 },
  speaking: { flow: 0.6, energy: 0.12, sat: 1, dir: 1, audio: "out", ring: "hidden", pulse: 0 },
  error: { flow: 0.08, energy: -0.12, sat: 0.08, dir: 1, audio: null, ring: "broken", pulse: 0 },
};

export const STATE_NAMES = Object.keys(STATES) as OrbState[];

export function isOrbState(v: unknown): v is OrbState {
  return typeof v === "string" && Object.hasOwn(STATES, v);
}

/** Accessible names from SPEC §5. */
export function accessibleName(state: OrbState, label: string, progress: OrbProgress | null): string {
  switch (state) {
    case "working":
      return progress
        ? `${label} is working, step ${Math.min(progress.done + 1, progress.steps)} of ${progress.steps}`
        : `${label} is working`;
    case "error":
      return `${label} can't connect`;
    default:
      return `${label} is ${state}`;
  }
}
