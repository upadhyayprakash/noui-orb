import { clamp, expK } from "../math";
import type { Levels } from "../types";

export interface EnvelopeConfig {
  reactivity: number;
  attackMs: number;
  releaseMs: number;
}

const ONSET_HIGH = 0.38;
const ONSET_LOW = 0.22;
const ONSET_MIN_GAP = 0.08;
const PACE_WINDOW = 2;
const MAX_ONSETS = 64;

/** SPEC §7.2: loudness attack/release, brightness/bass/treble smoothing, onset and pace detection. */
export class Envelope {
  amp = 0;
  bright = 0.5;
  bass = 0;
  treble = 0;
  /** 0 to 1, eased. */
  pace = 0;
  /** Onsets per second over the last 2 s. */
  paceRate = 0;

  private clock = 0;
  private above = false;
  private lastOnset = -Infinity;
  private onsets = new Float64Array(MAX_ONSETS);
  private head = 0;
  private count = 0;

  update(dt: number, f: Levels, cfg: EnvelopeConfig): void {
    this.clock += dt;

    const target = clamp(f.amp * cfg.reactivity);
    const tau = (target > this.amp ? cfg.attackMs : cfg.releaseMs) / 1000;
    this.amp += (target - this.amp) * expK(dt, tau);

    const k = expK(dt, 0.12);
    this.bright += (f.bright - this.bright) * k;
    this.bass += (clamp(f.bass * cfg.reactivity) - this.bass) * k;
    this.treble += (clamp(f.treble * cfg.reactivity) - this.treble) * k;

    if (this.amp > ONSET_HIGH && !this.above) {
      this.above = true;
      if (this.clock - this.lastOnset > ONSET_MIN_GAP) this.pushOnset(this.clock);
    } else if (this.amp < ONSET_LOW) {
      this.above = false;
    }
    while (this.count > 0 && this.clock - this.onsets[this.head]! > PACE_WINDOW) {
      this.head = (this.head + 1) % MAX_ONSETS;
      this.count--;
    }
    this.paceRate = this.count / PACE_WINDOW;
    this.pace += (clamp(this.paceRate / 5) - this.pace) * expK(dt, 0.6);
  }

  reset(): void {
    this.amp = this.bass = this.treble = this.pace = this.paceRate = 0;
    this.bright = 0.5;
    this.above = false;
    this.lastOnset = -Infinity;
    this.head = this.count = 0;
  }

  private pushOnset(t: number): void {
    this.lastOnset = t;
    if (this.count === MAX_ONSETS) {
      this.head = (this.head + 1) % MAX_ONSETS;
      this.count--;
    }
    this.onsets[(this.head + this.count) % MAX_ONSETS] = t;
    this.count++;
  }
}
