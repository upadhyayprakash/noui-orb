import fragmentSource from "./orb.frag.glsl?raw";

const VERTEX_SOURCE = "attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}";

const UNIFORM_NAMES = [
  "uRes", "uTime", "uFlowT", "uWave", "uAmp", "uBright", "uBass", "uTreble",
  "uSat", "uEnergy", "uGrain", "uScale", "uWaveAmt", "uLean",
] as const;
type UniformName = (typeof UNIFORM_NAMES)[number];

/** SPEC §4.2 uniform contract. `res` comes from the canvas. */
export interface ShaderUniforms {
  time: number;
  flowT: number;
  wave: number;
  amp: number;
  bright: number;
  bass: number;
  treble: number;
  sat: number;
  energy: number;
  grain: number;
  scale: number;
  waveAmt: number;
  /** Already y-flipped for GL. */
  leanX: number;
  leanY: number;
}

export type GLResult = { ok: true; renderer: GLRenderer } | { ok: false; reason: string };

interface Program {
  prog: WebGLProgram;
  u: Record<UniformName, WebGLUniformLocation | null>;
}

export class GLRenderer {
  private current: Program;
  private lowProgram: Program | null = null;
  private low = false;

  private constructor(
    readonly canvas: HTMLCanvasElement,
    private gl: WebGLRenderingContext,
    private readonly base: Program,
  ) {
    this.current = base;
  }

  static create(canvas: HTMLCanvasElement, onLost: () => void): GLResult {
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    } catch {
      gl = null;
    }
    if (!gl) return { ok: false, reason: "webgl-unavailable" };

    const built = buildProgram(gl, fragmentSource);
    if (typeof built === "string") return { ok: false, reason: built };

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); // aPos is bound to location 0 in buildProgram
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);

    canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        onLost();
      },
      { once: true },
    );
    return { ok: true, renderer: new GLRenderer(canvas, gl, built) };
  }

  /** Frame-time guard (SPEC §14): one noise octave instead of two. Compiled on first use. */
  setLowQuality(low: boolean): void {
    if (low === this.low) return;
    if (low && !this.lowProgram) {
      const lowSource = fragmentSource.replace("i<2", "i<1");
      const built = lowSource === fragmentSource ? null : buildProgram(this.gl, lowSource);
      if (!built || typeof built === "string") return;
      this.lowProgram = built;
    }
    this.low = low;
    this.current = low && this.lowProgram ? this.lowProgram : this.base;
    this.gl.useProgram(this.current.prog);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  draw(v: ShaderUniforms): void {
    const { gl, canvas } = this;
    const u = this.current.u;
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, v.time);
    gl.uniform1f(u.uFlowT, v.flowT);
    gl.uniform1f(u.uWave, v.wave);
    gl.uniform1f(u.uAmp, v.amp);
    gl.uniform1f(u.uBright, v.bright);
    gl.uniform1f(u.uBass, v.bass);
    gl.uniform1f(u.uTreble, v.treble);
    gl.uniform1f(u.uSat, v.sat);
    gl.uniform1f(u.uEnergy, v.energy);
    gl.uniform1f(u.uGrain, v.grain);
    gl.uniform1f(u.uScale, v.scale);
    gl.uniform1f(u.uWaveAmt, v.waveAmt);
    gl.uniform2f(u.uLean, v.leanX, v.leanY);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function buildProgram(gl: WebGLRenderingContext, fragment: string): Program | string {
  const compile = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[noui-orb]", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return "shader-compile-failed";
  const prog = gl.createProgram();
  if (!prog) return "link-failed";
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[noui-orb]", gl.getProgramInfoLog(prog));
    return "link-failed";
  }
  gl.useProgram(prog);
  const u = {} as Record<UniformName, WebGLUniformLocation | null>;
  for (const n of UNIFORM_NAMES) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}
