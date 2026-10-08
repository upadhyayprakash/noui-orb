import { describe, expect, it } from "vitest";
import { computeFeatures } from "./analyser";

const FFT = 2048;
const RATE = 48000;

function sine(amplitude: number, freq: number) {
  const td = new Float32Array(FFT);
  for (let i = 0; i < FFT; i++) td[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / RATE);
  return td;
}
const out = () => ({ amp: 0, bright: 0, bass: 0, treble: 0 });

describe("computeFeatures", () => {
  it("maps RMS in dB from -58..-18 onto 0..1", () => {
    const fd = new Uint8Array(FFT / 2);
    // sine RMS = A/√2. -38 dB RMS => mid-scale.
    const rms = Math.pow(10, -38 / 20);
    expect(computeFeatures(sine(rms * Math.SQRT2, 440), fd, RATE, FFT, out()).amp).toBeCloseTo(0.5, 2);
    expect(computeFeatures(new Float32Array(FFT), fd, RATE, FFT, out()).amp).toBe(0);
    expect(computeFeatures(sine(1, 440), fd, RATE, FFT, out()).amp).toBe(1);
  });

  it("maps the spectral centroid 600..3800 Hz onto 0..1", () => {
    const td = new Float32Array(FFT);
    const bin = (hz: number) => Math.round(hz / (RATE / FFT));
    const at = (hz: number) => {
      const fd = new Uint8Array(FFT / 2);
      fd[bin(hz)] = 255;
      return computeFeatures(td, fd, RATE, FFT, out()).bright;
    };
    expect(at(600)).toBeLessThan(0.02);
    expect(at(2200)).toBeCloseTo(0.5, 1);
    expect(at(3800)).toBeGreaterThan(0.97);
  });

  it("measures bass under 300 Hz and treble between 2.5 and 8 kHz", () => {
    const td = new Float32Array(FFT);
    const binHz = RATE / FFT;
    const fd = new Uint8Array(FFT / 2);
    for (let k = 1; k * binHz < 300; k++) fd[k] = 128;
    const bassOnly = computeFeatures(td, fd, RATE, FFT, out());
    expect(bassOnly.bass).toBeCloseTo((128 / 255) * 1.4, 2);
    expect(bassOnly.treble).toBe(0);

    fd.fill(0);
    for (let k = 1; k < fd.length; k++) if (k * binHz > 2500 && k * binHz < 8000) fd[k] = 100;
    const trebleOnly = computeFeatures(td, fd, RATE, FFT, out());
    expect(trebleOnly.treble).toBeCloseTo((100 / 255) * 2.2, 2);
    expect(trebleOnly.bass).toBe(0);
  });

  it("writes into the object it is given", () => {
    const o = out();
    expect(computeFeatures(new Float32Array(FFT), new Uint8Array(FFT / 2), RATE, FFT, o)).toBe(o);
  });
});
