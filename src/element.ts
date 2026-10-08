import { Character, EXPRESSIVE, IMPULSE_GESTURES, type Pointer } from "./character";
import { DEFAULT_CONFIG, mergeConfig } from "./config";
import {
  CROSSFADE_MS, INTRO_MS, OUTRO_MS, crossfadeFrame, introFrame, logoFrame, newMarkFrame, outroFrame, type MarkFrame,
} from "./intro";
import { handoff, markMarkup, type Handoff } from "./mark";
import { clamp, easeOut, expK } from "./math";
import { FrameGuard } from "./perf";
import { PlacementTween, orbCircle } from "./placement";
import { GLRenderer } from "./renderer/gl";
import { RingModel, RingView } from "./ring";
import { AudioChannel, type AttachSource } from "./signals/analyser";
import { Envelope } from "./signals/envelope";
import { STATES, accessibleName, isOrbState } from "./states";
import { CSS } from "./styles";
import type {
  AudioChannelName, DeepPartial, GestureName, Levels, OrbConfig, OrbEventDetails, OrbLevels, OrbProgress, OrbState, Placement,
} from "./types";

const GESTURE_NAMES: readonly GestureName[] = ["nod", "shake", "huh", "hop", "interrupt", "emit", "point", "wait"];
const PLACEMENTS: readonly Placement[] = ["center", "room", "aside"];
const LEVELS_FRESH_MS = 300;
const SILENT_LEVEL = 0.03;
const SILENT_REARM_LEVEL = 0.15;
const SILENT_AFTER_S = 4;
const SETTLE_TIMEOUT_S = 2.5;
const PLACE_MS = 650;
const noop = (): void => {};

type Phase = "logo" | "intro" | "orb" | "outro";
type TimelineKind = "intro" | "outro" | "fade-in" | "fade-out";

interface Timeline {
  kind: TimelineKind;
  t: number;
  done: () => void;
}

interface Run {
  name: GestureName;
  kind: "impulse" | "point" | "wait";
  doneAt: number;
  startedAt: number;
  finish: () => void;
}

interface Pushed extends Levels {
  at: number;
}

const TEMPLATE = `
<style>${CSS}</style>
<div class="orb-wrap">
  <div class="orb-body">
    <canvas aria-hidden="true"></canvas>
    <div class="fallback" hidden></div>
  </div>
  <svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><g class="tracks"></g><g class="fills"></g></svg>
</div>
<svg class="mark" viewBox="0 0 120 120" aria-hidden="true">${markMarkup()}</svg>
`;

/** On a server there is no HTMLElement; the class still has to be definable so the module can be imported. */
const Base = (typeof HTMLElement !== "undefined" ? HTMLElement : class {}) as typeof HTMLElement;

/**
 * `<noui-orb>`: the living form of the orange o in the noui mark (see docs/SPEC.md).
 * Importing this file does not register the element; `@nouisi/orb` (the default entry) does.
 */
export class NouiOrbElement extends Base {
  static observedAttributes = ["state", "placement", "gestures", "reduced-motion", "label"];

  // ---- DOM ----
  private readonly wrap: HTMLElement;
  private readonly body: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly fallbackEl: HTMLElement;
  private readonly markSvg: SVGSVGElement;
  private readonly markLetters: SVGGElement;
  private readonly markStem: SVGLineElement;
  private readonly markDot: SVGCircleElement;
  private readonly ringView: RingView;

  // ---- public-facing state ----
  private _state: OrbState = "idle";
  private _placement: Placement = "center";
  private _progress: OrbProgress | null = null;
  private _config: OrbConfig = structuredClone(DEFAULT_CONFIG);
  private _label = "noui";

  // ---- engine ----
  private readonly char = new Character();
  private readonly env = new Envelope();
  private readonly ring = new RingModel();
  private readonly tween = new PlacementTween();
  private readonly guard = new FrameGuard();
  private readonly inputChannel = new AudioChannel();
  private readonly outputChannel = new AudioChannel();
  private readonly pushed: Record<AudioChannelName, Pushed | null> = { input: null, output: null };
  private readonly features: Levels = { amp: 0, bright: 0.5, bass: 0, treble: 0 };

  private gl: GLRenderer | null = null;
  private glTried = false;
  private handoffPose: Handoff = handoff(20, 0.39);

  private phase: Phase = "orb";
  private timeline: Timeline | null = null;
  private phasePromise: Promise<void> | null = null;
  private readonly frame: MarkFrame = newMarkFrame();
  private orbOpacity = 1;
  private orbK = 0;

  private clock = 0;
  private flowT = 0;
  private wave = 0;
  private scale = 1;
  private flash = 0;
  private curFlow = STATES.idle.flow;
  private curEnergy = STATES.idle.energy;
  private curSat = STATES.idle.sat;
  private curDir: number = STATES.idle.dir;
  private completeAt = -1;

  private runs: Run[] = [];
  private lastPointTarget: Element | DOMPoint | undefined;
  private charWasActive = false;
  private readonly pointer: Pointer = { x: 0, y: 0 };
  private hasPointer = false;

  private silentT = 0;
  private silentFired = false;

  // ---- scheduling / observers ----
  private raf = 0;
  private last = 0;
  private inView = true;
  private boxW = 0;
  private boxH = 0;
  private introDone = false;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private motionQuery: MediaQueryList | null = null;
  private coarseQuery: MediaQueryList | null = null;

  // ---- write caches ----
  private lastBodyTransform = "";
  private lastWrapTransform = "";
  private lastWrapOpacity = -1;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = TEMPLATE;
    this.wrap = root.querySelector(".orb-wrap")!;
    this.body = root.querySelector(".orb-body")!;
    this.canvas = root.querySelector("canvas")!;
    this.fallbackEl = root.querySelector(".fallback")!;
    this.markSvg = root.querySelector(".mark")!;
    this.markLetters = root.querySelector(".letters")!;
    this.markStem = root.querySelector(".stem")!;
    this.markDot = root.querySelector(".dot")!;
    this.ringView = new RingView(root.querySelector(".ring")!, root.querySelector(".tracks")!, root.querySelector(".fills")!);

    this.char.onGlance = () => {
      const dir = this.directionTo(this.lastPointTarget);
      if (dir) this.char.pointAt(dir.x, dir.y, 0.9, false);
    };
    this.wrap.addEventListener("click", () => {
      if (this.phase === "orb" && this._placement === "aside") this.fire("orb-recall", {});
    });
    this.addEventListener("keydown", (e) => {
      if (this.getAttribute("role") === "button" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        this.fire("orb-recall", {});
      }
    });
    this.addEventListener("pointerdown", () => this.stopWaiting());
    this.applyConfig();
  }

  // =====================================================================================================
  // Attributes and properties
  // =====================================================================================================

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case "state":
        if (isOrbState(value)) this.applyState(value);
        break;
      case "placement":
        if (value && (PLACEMENTS as readonly string[]).includes(value)) void this.place(value as Placement);
        break;
      case "label":
        this._label = value || "noui";
        this.updateA11y();
        break;
      case "gestures":
      case "reduced-motion":
        this.wake();
        break;
    }
  }

  get state(): OrbState {
    return this._state;
  }
  set state(v: OrbState) {
    if (isOrbState(v)) this.setAttribute("state", v);
  }

  get placement(): Placement {
    return this._placement;
  }
  set placement(v: Placement) {
    void this.place(v);
  }

  get gestures(): boolean {
    return this.hasAttribute("gestures");
  }
  set gestures(v: boolean) {
    this.toggleAttribute("gestures", !!v);
  }

  get progress(): OrbProgress | null {
    return this._progress ? { ...this._progress } : null;
  }
  set progress(p: OrbProgress | null) {
    if (!p) {
      this._progress = null;
    } else {
      const steps = clamp(Math.round(p.steps), 1, 8);
      this._progress = { steps, done: clamp(Math.round(p.done), 0, steps), current: clamp(p.current ?? 0) };
    }
    this.checkCompletion();
    this.updateA11y();
    this.wake();
  }

  get config(): OrbConfig {
    return structuredClone(this._config);
  }
  set config(v: DeepPartial<OrbConfig>) {
    this._config = mergeConfig(this._config, v);
    this.applyConfig();
  }

  // =====================================================================================================
  // Lifecycle
  // =====================================================================================================

  connectedCallback(): void {
    // Properties set before the element was upgraded would shadow the accessors above.
    for (const prop of ["state", "placement", "gestures", "progress", "config"] as const) {
      if (Object.prototype.hasOwnProperty.call(this, prop)) {
        const value = (this as unknown as Record<string, unknown>)[prop];
        delete (this as unknown as Record<string, unknown>)[prop];
        (this as unknown as Record<string, unknown>)[prop] = value;
      }
    }

    this.motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    this.coarseQuery = matchMedia("(pointer: coarse)");
    this.motionQuery.addEventListener("change", this.onMotionChange);

    this.resizeObserver = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1]?.contentRect;
      if (!r) return;
      this.boxW = r.width;
      this.boxH = r.height;
      this.applyCanvasSize();
      this.wake();
    });
    this.resizeObserver.observe(this);
    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.inView = entries[entries.length - 1]?.isIntersecting ?? true;
        if (this.inView) this.wake();
      });
      this.intersectionObserver.observe(this);
    }
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    document.addEventListener("visibilitychange", this.onVisibility);

    if (!this.glTried) this.initRenderer();

    if (!this.introDone) {
      this.introDone = true;
      const mode = this.getAttribute("intro");
      if (mode === "none") {
        this.setPhase("orb");
      } else {
        this.setPhase("logo");
        if (mode === "auto") void this.intro();
      }
    }
    this.updateA11y();
    this.wake();
  }

  disconnectedCallback(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.motionQuery?.removeEventListener("change", this.onMotionChange);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.inputChannel.detach();
    this.outputChannel.detach();
  }

  // =====================================================================================================
  // Public methods
  // =====================================================================================================

  gesture(name: GestureName, opts: { target?: Element | DOMPoint; duration?: number } = {}): Promise<void> {
    if (!GESTURE_NAMES.includes(name)) return Promise.reject(new TypeError(`Unknown gesture "${name}"`));

    // These two do real work for the host, so they happen even when the motion itself is suppressed.
    if (name === "interrupt" && this._state === "speaking") this.state = "listening";
    if (name === "emit" && this._placement !== "aside") void this.place("room");

    if (!this.gesturesActive()) return Promise.reject("suppressed");
    const expressive = EXPRESSIVE.has(name);
    const nowMs = performance.now();
    if (expressive && !this.char.rateOk(nowMs, this._config.gestureRateLimitMs)) return Promise.reject("suppressed");
    if (expressive) this.char.markExpressive(nowMs);

    if (name === "interrupt") this.endRuns();
    else if (name !== "wait") this.stopWaiting();

    return new Promise<void>((resolve) => {
      this.fire("orb-gesture", { name, phase: "start" });
      const finish = () => {
        this.fire("orb-gesture", { name, phase: "end" });
        resolve();
      };
      if (!this.shouldRun()) {
        finish();
        return;
      }

      const run: Run = { name, kind: "impulse", doneAt: this.clock, startedAt: this.clock, finish };
      switch (name) {
        case "interrupt":
          this.char.startInterrupt();
          run.doneAt = this.clock + 1.5;
          break;
        case "point": {
          const seconds = (opts.duration ?? 1800) / 1000;
          if (opts.target) this.lastPointTarget = opts.target;
          const dir = this.directionTo(opts.target ?? this.lastPointTarget);
          if (dir) this.char.pointAt(dir.x, dir.y, seconds, true);
          run.kind = "point";
          run.doneAt = this.clock + (dir ? seconds : 0);
          break;
        }
        case "wait":
          this.char.startWait();
          run.kind = "wait";
          run.doneAt = Infinity;
          break;
        default: {
          const def = IMPULSE_GESTURES[name]!;
          run.doneAt = this.clock + this.char.schedule(def.impulses);
          if (def.hesitate) this.char.hesitate = def.hesitate;
          if (def.flash) this.flash = Math.max(this.flash, def.flash);
        }
      }
      this.runs.push(run);
      this.wake();
    });
  }

  stopWaiting(): void {
    if (!this.char.waiting) return;
    this.char.stopWait();
    for (let i = this.runs.length - 1; i >= 0; i--) {
      if (this.runs[i]!.kind === "wait") this.runs.splice(i, 1)[0]!.finish();
    }
  }

  place(p: Placement): Promise<void> {
    return this.placeFor(p, PLACE_MS);
  }

  originRect(): { x: number; y: number; r: number } {
    return orbCircle(this.getBoundingClientRect(), this.tween.pose, this._config.geometry.orbRadius);
  }

  attachInput(source: MediaStream | AudioNode): void {
    this.inputChannel.attach(source, () => {
      this.detachInput();
      this.fire("orb-input-silent", { seconds: 0 });
    });
    this.silentT = 0;
    this.silentFired = false;
  }
  attachOutput(source: HTMLMediaElement | AudioNode): void {
    this.outputChannel.attach(source as AttachSource);
  }
  detachInput(): void {
    this.inputChannel.detach();
  }
  detachOutput(): void {
    this.outputChannel.detach();
  }

  setLevels(levels: OrbLevels, channel: AudioChannelName): void {
    if (channel !== "input" && channel !== "output") return;
    const p = (this.pushed[channel] ??= { amp: 0, bright: 0.5, bass: 0, treble: 0, at: 0 });
    p.amp = clamp(levels.amp);
    p.bright = clamp(levels.bright ?? 0.5);
    p.bass = clamp(levels.bass ?? 0);
    p.treble = clamp(levels.treble ?? 0);
    p.at = performance.now();
  }

  intro(): Promise<void> {
    if (this.phase === "intro") return this.phasePromise ?? Promise.resolve();
    if (this.phase === "outro") return (this.phasePromise ?? Promise.resolve()).then(() => this.intro());
    if (this.phase === "orb") return Promise.resolve();

    this.resetMotion();
    this.tween.jump(this._config.placements.center);
    this.setPhase("intro");
    this.updateA11y();
    const reduced = this.reducedMotion();
    this.phasePromise = new Promise<void>((resolve) => {
      this.timeline = {
        kind: reduced ? "fade-in" : "intro",
        t: 0,
        done: () => {
          this.setPhase("orb");
          this.fire("orb-intro-end", {});
          resolve();
        },
      };
    });
    this.wake();
    return this.phasePromise;
  }

  outro(): Promise<void> {
    if (this.phase === "outro") return this.phasePromise ?? Promise.resolve();
    if (this.phase === "intro") return (this.phasePromise ?? Promise.resolve()).then(() => this.outro());
    if (this.phase === "logo") return Promise.resolve();

    this.resetMotion();
    this.setPhase("outro");
    this.updateA11y();
    const reduced = this.reducedMotion();
    this.phasePromise = new Promise<void>((resolve) => {
      const start = () => {
        this.timeline = {
          kind: reduced ? "fade-out" : "outro",
          t: 0,
          done: () => {
            this.setPhase("logo");
            this.fire("orb-outro-end", {});
            resolve();
          },
        };
        this.wake();
      };
      if (this._placement !== "center") void this.placeFor("center", 450).then(start);
      else start();
    });
    return this.phasePromise;
  }

  // =====================================================================================================
  // State
  // =====================================================================================================

  private applyState(next: OrbState): void {
    if (next === this._state) return;
    const prev = this._state;
    this._state = next;
    this.stopWaiting();
    this.silentT = 0;
    this.silentFired = false;
    this.completeAt = -1;
    this.updateA11y();
    this.fire("orb-statechange", { from: prev, to: next });

    if (next === "speaking") this.char.startBreath();
    if (prev === "listening" && next === "thinking") this.gesture("nod").catch(noop);
    this.checkCompletion();
    this.wake();
  }

  private checkCompletion(): void {
    const p = this._progress;
    const complete = this._state === "working" && !!p && p.done >= p.steps;
    if (complete && this.completeAt < 0) {
      this.completeAt = this.clock;
      this.flash = 1;
      this.gesture("hop").catch(noop);
    } else if (!complete) {
      this.completeAt = -1;
    }
  }

  private updateA11y(): void {
    if (this.phase === "orb" && this._placement === "aside") {
      this.setAttribute("role", "button");
      this.setAttribute("tabindex", "0");
      this.setAttribute("aria-label", `Bring back ${this._label}`);
    } else {
      this.setAttribute("role", "img");
      this.removeAttribute("tabindex");
      this.setAttribute("aria-label", accessibleName(this._state, this._label, this._progress));
    }
  }

  private reducedMotion(): boolean {
    const mode = this.getAttribute("reduced-motion");
    if (mode === "on") return true;
    if (mode === "off") return false;
    return this.motionQuery?.matches ?? (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  private gesturesActive(): boolean {
    return this.gestures && !this.reducedMotion() && this.phase === "orb";
  }

  private fire<K extends keyof OrbEventDetails>(type: K, detail: OrbEventDetails[K]): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  // =====================================================================================================
  // Placement
  // =====================================================================================================

  private placeFor(p: Placement, ms: number): Promise<void> {
    if (!PLACEMENTS.includes(p)) return Promise.reject(new TypeError(`Unknown placement "${p}"`));
    this._placement = p;
    this.updateA11y();
    const pose = this._config.placements[p];
    if (this.phase !== "orb" && this.phase !== "outro") {
      this.tween.jump(pose);
      return Promise.resolve();
    }
    if (!this.shouldRun()) {
      this.tween.jump(pose);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const reduced = this.reducedMotion();
      this.tween.start(pose, reduced ? 200 : ms, resolve, reduced ? easeOut : undefined);
      this.wake();
    });
  }

  // =====================================================================================================
  // Config, size, renderer
  // =====================================================================================================

  private applyConfig(): void {
    const c = this._config;
    this.char.waitDimAfterMs = c.waitDimAfterMs;
    this.handoffPose = handoff(c.geometry.oRadius, c.geometry.orbRadius);
    this.updateRingGeometry();
    if (!this.tween.active) this.tween.jump(c.placements[this._placement]);
    this.applyCanvasSize();
    this.wake();
  }

  private updateRingGeometry(): void {
    const g = this._config.geometry;
    const small = this.boxW > 0 && Math.min(this.boxW, this.boxH) < 120;
    this.ringView.setGeometry(g.ringRadius, small ? Math.max(g.ringStroke, 0.008) : g.ringStroke);
  }

  private initRenderer(): void {
    this.glTried = true;
    const result = GLRenderer.create(this.canvas, () => this.useFallback("context-lost"));
    if (result.ok) {
      this.gl = result.renderer;
      this.applyCanvasSize();
    } else {
      this.useFallback(result.reason);
    }
  }

  private useFallback(reason: string): void {
    this.gl = null;
    this.canvas.hidden = true;
    this.fallbackEl.hidden = false;
    setTimeout(() => this.fire("orb-fallback", { reason }), 0);
  }

  private dpr(): number {
    const cap = this.coarseQuery?.matches ? Math.min(1.5, this._config.maxDevicePixelRatio) : this._config.maxDevicePixelRatio;
    let d = Math.min(window.devicePixelRatio || 1, cap);
    if (Math.min(this.boxW, this.boxH) < 160) d = 1;
    if (this.guard.low) d = Math.max(0.5, d * 0.5);
    return d;
  }

  private applyCanvasSize(): void {
    this.updateRingGeometry();
    if (!this.gl || this.boxW <= 0) return;
    const d = this.dpr();
    this.gl.resize(this.boxW * d, this.boxH * d);
  }

  // =====================================================================================================
  // Pointer and geometry
  // =====================================================================================================

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.gesturesActive()) return;
    const o = this.originRect();
    const half = Math.max(0.5 * Math.min(this.boxW, this.boxH) * this.tween.pose.s, 40);
    this.pointer.x = (e.clientX - o.x) / half;
    this.pointer.y = (e.clientY - o.y) / half;
    this.hasPointer = true;
  };

  private readonly onPointerLeave = (): void => {
    this.hasPointer = false;
  };

  private readonly onVisibility = (): void => this.wake();
  private readonly onMotionChange = (): void => {
    this.updateA11y();
    this.wake();
  };

  private directionTo(target: Element | DOMPoint | undefined): { x: number; y: number } | null {
    if (!target) return null;
    let tx: number;
    let ty: number;
    if (typeof Element !== "undefined" && target instanceof Element) {
      const r = target.getBoundingClientRect();
      tx = r.left + r.width / 2;
      ty = r.top + r.height / 2;
    } else {
      tx = (target as DOMPoint).x;
      ty = (target as DOMPoint).y;
    }
    const o = this.originRect();
    const x = tx - o.x;
    const y = ty - o.y;
    return Math.hypot(x, y) < 1e-6 ? null : { x, y };
  }

  // =====================================================================================================
  // Phases (logo / intro / orb / outro)
  // =====================================================================================================

  private setPhase(phase: Phase): void {
    this.phase = phase;
    if (phase === "logo") {
      this.timeline = null;
      this.applyFrame(logoFrame(this._config.geometry.oRadius, this.frame));
    } else if (phase === "orb") {
      this.timeline = null;
      this.frame.orbOpacity = 1;
      this.orbOpacity = 1;
      this.orbK = 0;
      this.markSvg.style.visibility = "hidden";
    } else {
      this.markSvg.style.visibility = "visible";
    }
    this.updateA11y();
  }

  private applyFrame(f: MarkFrame): void {
    this.markSvg.style.visibility = f.dotOpacity > 0 || f.lettersOpacity > 0 ? "visible" : "hidden";
    this.markStem.setAttribute("y1", f.stemY1.toFixed(3));
    this.markDot.setAttribute("cy", f.dotCy.toFixed(3));
    this.markDot.setAttribute("r", f.dotR.toFixed(3));
    this.markDot.style.opacity = f.dotOpacity.toFixed(3);
    this.markLetters.style.opacity = f.lettersOpacity.toFixed(3);
    this.markStem.style.opacity = f.stemOpacity.toFixed(3);
    this.orbOpacity = f.orbOpacity;
    this.orbK = f.orbK;
  }

  private advanceTimeline(dt: number): void {
    const tl = this.timeline;
    if (!tl) return;
    tl.t += dt * 1000;
    const o = this._config.geometry.oRadius;
    let total: number;
    switch (tl.kind) {
      case "intro":
        total = INTRO_MS;
        introFrame(tl.t, o, this.frame);
        break;
      case "outro":
        total = OUTRO_MS;
        outroFrame(tl.t, o, this.frame);
        break;
      default:
        total = CROSSFADE_MS;
        crossfadeFrame(tl.t, o, tl.kind === "fade-in", this.frame);
    }
    this.applyFrame(this.frame);
    if (tl.t >= total) {
      this.timeline = null;
      tl.done();
      if (tl.kind === "intro" || tl.kind === "fade-in") {
        // The intro lands at the centre; move on to the placement the host asked for.
        if (this._placement !== "center") void this.placeFor(this._placement, PLACE_MS);
      }
    }
  }

  private resetMotion(): void {
    this.char.reset();
    this.charWasActive = false;
    this.endRuns();
  }

  private endRuns(): void {
    const runs = this.runs;
    this.runs = [];
    for (const r of runs) r.finish();
  }

  // =====================================================================================================
  // Frame loop
  // =====================================================================================================

  private shouldRun(): boolean {
    if (!this.isConnected || document.hidden) return false;
    if (this.phase === "intro" || this.phase === "outro") return true;
    return this.phase === "orb" && this.inView;
  }

  private wake(): void {
    if (this.raf || !this.shouldRun()) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    const rawDt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    if (this.guard.push(rawDt * 1000)) {
      this.gl?.setLowQuality(this.guard.low);
      this.applyCanvasSize();
    }
    this.update(Math.min(0.05, rawDt));
    this.render();
    if (this.shouldRun()) this.raf = requestAnimationFrame(this.tick);
  };

  private readChannel(channel: AudioChannelName, out: Levels): void {
    const p = this.pushed[channel];
    if (p && performance.now() - p.at < LEVELS_FRESH_MS) {
      out.amp = p.amp;
      out.bright = p.bright;
      out.bass = p.bass;
      out.treble = p.treble;
      return;
    }
    (channel === "input" ? this.inputChannel : this.outputChannel).read(out);
  }

  private update(dt: number): void {
    const cfg = this._config;
    const S = STATES[this._state];
    const reduced = this.reducedMotion();
    const motion = reduced ? 0.35 : 1;
    this.clock += dt;

    const k = expK(dt, 0.35);
    this.curFlow += (S.flow - this.curFlow) * k;
    this.curEnergy += (S.energy - this.curEnergy) * k;
    this.curSat += (S.sat - this.curSat) * k;
    this.curDir += (S.dir - this.curDir) * k;

    // Character
    const char = this.char;
    const gestures = this.gesturesActive();
    if (gestures) {
      char.step(dt, this._state === "listening", this.hasPointer ? this.pointer : null);
      this.charWasActive = true;
      this.finishRuns();
    } else if (this.charWasActive) {
      this.resetMotion();
    }

    // Signal
    const f = this.features;
    const inhaling = gestures && this._state === "speaking" && char.breathT < 0.55;
    if (S.audio && this.phase === "orb" && !inhaling) {
      this.readChannel(S.audio === "in" ? "input" : "output", f);
    } else if (S.pulse) {
      const pulse = S.pulse * (0.55 + 0.45 * Math.sin(this.clock * 3.4));
      f.amp = pulse;
      f.bright = 0.6;
      f.bass = pulse * 0.5;
      f.treble = 0.04;
    } else {
      f.amp = f.bass = f.treble = 0;
      f.bright = 0.5;
    }
    this.env.update(dt, f, cfg);
    this.checkSilence(dt, S.audio === "in", f.amp);

    // Motion
    this.flash *= Math.exp(-dt / 0.45);
    this.flowT += dt * this.curFlow * cfg.flowSpeed * (1 + 0.8 * this.env.pace) * motion *
      (char.hesitate > 0 ? 0.25 : 1) * (char.waiting ? 0.6 - 0.3 * char.dim : 1);
    this.wave += dt * this.curDir * (1.2 + 5 * this.env.amp) * motion;
    const breathing = (this._state === "idle" ? 0.012 : 0.004) * Math.sin(this.clock * 1.35) * motion;
    this.scale = 1 + (cfg.maxSwellPercent / 100) * this.env.amp + breathing + 0.035 * this.flash +
      (gestures ? char.scaleOffset(this._state) : 0);

    // Ring
    const p = this._progress;
    this.ring.update(dt, {
      mode: this._state === "working" && !p ? "spin" : S.ring,
      steps: p?.steps ?? 3,
      done: p?.done ?? 0,
      current: p?.current ?? 0,
      completeFor: this.completeAt >= 0 ? this.clock - this.completeAt : -1,
      suppress: this.phase !== "orb",
      motion,
    });

    // Placement and logo/orb transition
    if (this.tween.active) this.tween.step(dt * 1000);
    this.advanceTimeline(dt);
  }

  private finishRuns(): void {
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i]!;
      if (r.kind === "wait") continue;
      const expired = this.clock >= r.doneAt;
      const settled = r.kind === "point" || this.char.atRest() || this.clock - r.doneAt > SETTLE_TIMEOUT_S;
      if (expired && settled) {
        this.runs.splice(i, 1);
        r.finish();
      }
    }
  }

  private checkSilence(dt: number, listening: boolean, rawAmp: number): void {
    const hasInput = this.inputChannel.attached || this.pushedFresh("input");
    if (!listening || !hasInput || this.phase !== "orb") {
      this.silentT = 0;
      return;
    }
    if (rawAmp >= SILENT_LEVEL) this.silentT = 0;
    else this.silentT += dt;
    if (rawAmp > SILENT_REARM_LEVEL) this.silentFired = false;
    if (this.silentT >= SILENT_AFTER_S && !this.silentFired) {
      this.silentFired = true;
      this.fire("orb-input-silent", { seconds: this.silentT });
    }
  }

  private pushedFresh(channel: AudioChannelName): boolean {
    const p = this.pushed[channel];
    return !!p && performance.now() - p.at < LEVELS_FRESH_MS;
  }

  private render(): void {
    // Wrap: placement, or the logo hand-off while a transition runs
    const inTransition = this.timeline !== null;
    const opacity = this.phase === "logo" ? 0 : inTransition ? this.orbOpacity : 1;
    let transform: string;
    if (inTransition) {
      const h = this.handoffPose;
      const kk = this.orbK;
      transform = `translate(${(h.dx * kk).toFixed(3)}%,${(h.dy * kk).toFixed(3)}%) scale(${(1 + (h.s - 1) * kk).toFixed(4)})`;
    } else {
      const pose = this.tween.pose;
      transform = `translate(${pose.dx.toFixed(3)}%,${pose.dy.toFixed(3)}%) scale(${pose.s.toFixed(4)})`;
    }
    if (transform !== this.lastWrapTransform) {
      this.wrap.style.transform = transform;
      this.lastWrapTransform = transform;
    }
    if (opacity !== this.lastWrapOpacity) {
      this.wrap.style.opacity = String(opacity);
      this.wrap.style.visibility = opacity > 0 ? "visible" : "hidden";
      this.lastWrapOpacity = opacity;
    }
    if (opacity <= 0) return;

    const char = this.char;
    const bodyTransform = char.transform();
    if (bodyTransform !== this.lastBodyTransform) {
      this.body.style.transform = bodyTransform;
      this.lastBodyTransform = bodyTransform;
    }
    this.body.style.opacity = (1 - 0.3 * char.dim).toFixed(3);
    this.ringView.draw(this.ring);

    const cfg = this._config;
    const sat = this.curSat * (1 - 0.55 * char.dim);
    const scale = this.scale * (cfg.geometry.orbRadius / 0.39);
    if (this.gl) {
      this.gl.draw({
        time: this.clock,
        flowT: this.flowT,
        wave: this.wave,
        amp: this.env.amp,
        bright: this.env.bright,
        bass: this.env.bass,
        treble: this.env.treble,
        sat,
        energy: this.curEnergy + this.flash * 0.5,
        grain: cfg.grain,
        scale,
        waveAmt: this.reducedMotion() ? 0.3 : 1,
        leanX: char.leanX,
        leanY: -char.leanY,
      });
    } else {
      this.fallbackEl.style.transform = `scale(${scale.toFixed(4)})`;
      this.fallbackEl.style.filter = `saturate(${sat.toFixed(2)})`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "noui-orb": NouiOrbElement;
  }
  interface HTMLElementEventMap {
    "orb-statechange": CustomEvent<OrbEventDetails["orb-statechange"]>;
    "orb-gesture": CustomEvent<OrbEventDetails["orb-gesture"]>;
    "orb-recall": CustomEvent<OrbEventDetails["orb-recall"]>;
    "orb-intro-end": CustomEvent<OrbEventDetails["orb-intro-end"]>;
    "orb-outro-end": CustomEvent<OrbEventDetails["orb-outro-end"]>;
    "orb-input-silent": CustomEvent<OrbEventDetails["orb-input-silent"]>;
    "orb-fallback": CustomEvent<OrbEventDetails["orb-fallback"]>;
  }
}
