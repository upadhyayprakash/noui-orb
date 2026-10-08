import { clamp, expK } from "./math";
import type { RingMode } from "./states";

export const MAX_SEGMENTS = 8;
const SPIN_ARC = 64;
const SPIN_DEG_PER_S = 290;
const STEP_GAP = 7;
const BROKEN_GAP = 34;

export interface RingInput {
  /** The mode the state asks for. `hidden` fades the ring out and keeps the last visible mode. */
  mode: RingMode;
  /** Known step count (steps mode). */
  steps: number;
  done: number;
  current: number;
  /** Seconds since `done === steps`, or -1 while incomplete. */
  completeFor: number;
  /** Force-hide (before the intro, after the outro). */
  suppress: boolean;
  /** 1, or 0.35 under reduced motion. */
  motion: number;
}

/**
 * SPEC §6 as pure state: opacity, gap and spin angle ease toward their targets, and the number of
 * segments only changes while the gaps are closed (or the ring is invisible).
 */
export class RingModel {
  opacity = 0;
  gap = 0;
  rot = 0;
  mode: RingMode = "spin";
  segments = 3;
  readonly fills = new Float32Array(MAX_SEGMENTS);

  update(dt: number, p: RingInput): void {
    if (p.mode !== "hidden") this.mode = p.mode;

    // The segment count only changes while the gaps are closed or the ring is invisible, so it never pops.
    // This runs before the gap eases so a switch from a closed ring is not missed.
    const want = this.mode === "steps" ? clamp(Math.round(p.steps), 1, MAX_SEGMENTS) : 3;
    if (want !== this.segments && (this.gap < 0.6 || this.opacity < 0.02)) this.segments = want;

    let targetOpacity = p.mode === "hidden" ? 0 : 1;
    let targetGap = this.mode === "steps" ? STEP_GAP : this.mode === "broken" ? BROKEN_GAP : 0;
    if (this.mode === "steps" && p.completeFor >= 0) {
      targetGap = 0;
      if (p.completeFor > 0.5) targetOpacity = 0;
    }
    if (p.suppress) targetOpacity = 0;

    this.gap += (targetGap - this.gap) * expK(dt, 0.12);
    this.opacity += (targetOpacity - this.opacity) * expK(dt, 0.18);
    this.rot = (this.rot + dt * SPIN_DEG_PER_S * p.motion) % 360;

    this.fills.fill(0);
    if (this.mode === "steps") {
      for (let i = 0; i < this.segments; i++) {
        this.fills[i] = p.done > i ? 1 : p.done === i ? clamp(p.current) : 0;
      }
    }
  }
}

const NS = "http://www.w3.org/2000/svg";

/** Draws a RingModel into an SVG with a 100-unit viewBox. */
export class RingView {
  private tracks: SVGCircleElement[] = [];
  private fills: SVGCircleElement[] = [];
  private circ = 0;
  private radius = 45;

  constructor(
    readonly svg: SVGSVGElement,
    tracksGroup: SVGGElement,
    fillsGroup: SVGGElement,
  ) {
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const tr = document.createElementNS(NS, "circle");
      const fl = document.createElementNS(NS, "circle");
      tr.setAttribute("class", "ring-track");
      fl.setAttribute("class", "ring-fill");
      tracksGroup.appendChild(tr);
      fillsGroup.appendChild(fl);
      this.tracks.push(tr);
      this.fills.push(fl);
    }
    this.setGeometry(0.45, 0.005);
  }

  setGeometry(ringRadius: number, stroke: number): void {
    this.radius = ringRadius * 100;
    this.circ = 2 * Math.PI * this.radius;
    for (const c of [...this.tracks, ...this.fills]) {
      c.setAttribute("cx", "50");
      c.setAttribute("cy", "50");
      c.setAttribute("r", String(this.radius));
      c.setAttribute("stroke-width", String(stroke * 100));
    }
  }

  draw(m: RingModel): void {
    const o = m.opacity;
    this.svg.style.opacity = o.toFixed(3);
    this.svg.style.transform = `scale(${(0.94 + 0.06 * o).toFixed(4)})`;
    this.svg.classList.toggle("is-broken", m.mode === "broken");
    if (o < 0.005) return;

    const seg = 360 / m.segments;
    const deg = (d: number) => ((d * this.circ) / 360).toFixed(2);
    const circ = this.circ.toFixed(2);
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const tr = this.tracks[i]!;
      const fl = this.fills[i]!;
      if (i >= m.segments) {
        tr.style.display = fl.style.display = "none";
        continue;
      }
      tr.style.display = fl.style.display = "";
      const span = Math.max(0, seg - m.gap);
      const start = -90 + i * seg + m.gap / 2;
      tr.setAttribute("stroke-dasharray", `${deg(span)} ${circ}`);
      tr.setAttribute("transform", `rotate(${start.toFixed(2)} 50 50)`);

      let len = 0;
      let rot = start;
      if (m.mode === "steps") len = span * m.fills[i]!;
      else if (m.mode === "spin" && i === 0) {
        len = SPIN_ARC;
        rot = m.rot - 90;
      }
      fl.setAttribute("stroke-dasharray", `${deg(len)} ${circ}`);
      fl.setAttribute("transform", `rotate(${rot.toFixed(2)} 50 50)`);
      fl.style.opacity = len > 0.3 ? "1" : "0";
    }
  }
}
