import { clamp } from "../math";
import type { Levels } from "../types";

/**
 * SPEC §7.1. Pure feature extraction from an analyser's time-domain samples and byte spectrum.
 * Writes into `out` so the frame loop allocates nothing.
 */
export function computeFeatures(
  td: Float32Array,
  fd: Uint8Array,
  sampleRate: number,
  fftSize: number,
  out: Levels,
): Levels {
  let sum = 0;
  for (let i = 0; i < fftSize; i++) sum += td[i]! * td[i]!;
  const rms = Math.sqrt(sum / fftSize);
  const db = 20 * Math.log10(rms + 1e-8);

  const binHz = sampleRate / fftSize;
  let total = 0;
  let weighted = 0;
  let bass = 0;
  let bassN = 0;
  let treble = 0;
  let trebleN = 0;
  for (let k = 1; k < fd.length; k++) {
    const m = fd[k]! / 255;
    const f = k * binHz;
    total += m;
    weighted += m * f;
    if (f < 300) {
      bass += m;
      bassN++;
    } else if (f > 2500 && f < 8000) {
      treble += m;
      trebleN++;
    }
  }
  const centroid = total > 0 ? weighted / total : 0;

  out.amp = clamp((db + 58) / 40);
  out.bright = clamp((centroid - 600) / 3200);
  out.bass = clamp(bassN ? (bass / bassN) * 1.4 : 0);
  out.treble = clamp(trebleN ? (treble / trebleN) * 2.2 : 0);
  return out;
}

let shared: AudioContext | null = null;

/** One lazily created context for streams and media elements the component analyses itself. */
function sharedContext(): AudioContext | null {
  if (shared) return shared;
  const AC =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  shared = new AC();
  return shared;
}

const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export type AttachSource = MediaStream | AudioNode | HTMLMediaElement;

/**
 * One analysed audio channel (the user's voice or the reply). Holds strong references to every node it
 * creates for as long as it is attached (SPEC §7.3, fix 1), routes the analyser to the destination
 * through a silent gain (fix 2) and resumes the context (fix 3).
 */
export class AudioChannel {
  private analyser: AnalyserNode | null = null;
  private sink: GainNode | null = null;
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private ctx: BaseAudioContext | null = null;
  private cleanups: Array<() => void> = [];
  private td = new Float32Array(2048);
  private fd = new Uint8Array(1024);

  get attached(): boolean {
    return this.analyser !== null;
  }

  /** `onEnded` fires if a track of an attached stream ends (device unplugged, permission revoked). */
  attach(source: AttachSource, onEnded?: () => void): boolean {
    this.detach();
    try {
      if (typeof MediaStream !== "undefined" && source instanceof MediaStream) return this.attachStream(source, onEnded);
      if (typeof HTMLMediaElement !== "undefined" && source instanceof HTMLMediaElement) return this.attachElement(source);
      return this.attachNode(source as AudioNode);
    } catch (err) {
      console.warn("[noui-orb] could not attach audio source:", err);
      this.detach();
      return false;
    }
  }

  detach(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    this.analyser = this.sink = this.source = this.stream = this.ctx = null;
  }

  /** Reads the current features into `out`. Returns false (and zeroes `out`) when nothing is attached. */
  read(out: Levels): boolean {
    const an = this.analyser;
    const ctx = this.ctx;
    if (!an || !ctx) {
      out.amp = out.bass = out.treble = 0;
      out.bright = 0.5;
      return false;
    }
    an.getFloatTimeDomainData(this.td);
    an.getByteFrequencyData(this.fd);
    computeFeatures(this.td, this.fd, ctx.sampleRate, an.fftSize, out);
    return true;
  }

  private build(ctx: BaseAudioContext, source: AudioNode): void {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;
    const sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(analyser);
    analyser.connect(sink);
    sink.connect(ctx.destination);
    this.ctx = ctx;
    this.source = source;
    this.analyser = analyser;
    this.sink = sink;
    this.cleanups.push(() => {
      try {
        source.disconnect(analyser);
      } catch {
        /* already disconnected */
      }
      analyser.disconnect();
      sink.disconnect();
    });
    if ("resume" in ctx) void (ctx as AudioContext).resume().catch(() => {});
  }

  private attachStream(stream: MediaStream, onEnded?: () => void): boolean {
    const ctx = sharedContext();
    if (!ctx) return false;
    this.stream = stream;
    this.build(ctx, ctx.createMediaStreamSource(stream));
    if (onEnded) {
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", onEnded);
        this.cleanups.push(() => track.removeEventListener("ended", onEnded));
      }
    }
    return true;
  }

  private attachNode(node: AudioNode): boolean {
    this.build(node.context, node);
    return true;
  }

  private attachElement(el: HTMLMediaElement): boolean {
    const ctx = sharedContext();
    if (!ctx) return false;
    let src = elementSources.get(el);
    if (!src) {
      src = ctx.createMediaElementSource(el);
      // Taking over an element reroutes its audio into the graph, so it has to reach the speakers again.
      src.connect(ctx.destination);
      elementSources.set(el, src);
    }
    this.build(ctx, src);
    const resume = () => void ctx.resume().catch(() => {});
    el.addEventListener("play", resume);
    this.cleanups.push(() => el.removeEventListener("play", resume));
    return true;
  }
}
