// The demo is the component's first customer: everything here goes through the public API
// (properties, methods, events). Nothing is imported from the component's internals.
import "../src/index";
import type { GestureName, NouiOrbElement, OrbState } from "../src/index";
import { SNIPPETS } from "./snippets";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const noop = () => {};
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const springy = (x: number) => 1 - Math.exp(-6 * x) * Math.cos(9 * x);

const orb = $<NouiOrbElement>("orb");
(window as unknown as { orb: NouiOrbElement }).orb = orb; // for poking at it from the console

// ---------------------------------------------------------------------------------------------
// Copy for the caption
// ---------------------------------------------------------------------------------------------
const STATE_ORDER: OrbState[] = ["idle", "listening", "thinking", "working", "speaking", "error"];
const STATE_COPY: Record<OrbState, { label: string; text: string; audio: "in" | "out" | null }> = {
  idle: { label: "Idle", audio: null, text: "Waiting. Slow drift and a gentle breath. No ring, because nothing is pending." },
  listening: { label: "Listening", audio: "in", text: "Hearing you. Waves travel inward, and the swell follows your voice." },
  thinking: { label: "Thinking", audio: null, text: "Working it out. Faster swirl and a warmer core. The ring orbits because the wait has no known end." },
  working: { label: "Working", audio: null, text: "Running known steps. Each segment fills as its step finishes, then the gaps close." },
  speaking: { label: "Speaking", audio: "out", text: "Talking back. Waves travel outward from the centre, driven by the reply's audio." },
  error: { label: "Error", audio: null, text: "Can't reach the service. Colour drains, motion slows and the ring breaks." },
};
const GESTURE_LABEL: Partial<Record<GestureName, string>> = {
  nod: "Got it", shake: "No", huh: "Didn't understand", hop: "Done", interrupt: "Go ahead", emit: "Here you go", point: "Look here",
};
const SEQ: Array<[OrbState, number | null]> = [["idle", 1.2], ["listening", 3.8], ["thinking", 2.4], ["working", null], ["speaking", 4.4], ["idle", 0]];

// ---------------------------------------------------------------------------------------------
// Get started: render the code samples with copy buttons
// ---------------------------------------------------------------------------------------------
document.querySelectorAll<HTMLElement>(".code[data-snippet]").forEach((el) => {
  const text = SNIPPETS[el.dataset.snippet!] ?? "";
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = text;
  pre.appendChild(code);
  pre.tabIndex = 0; // long lines scroll; let keyboard users reach them
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy";
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", `Copy the ${el.dataset.snippet} example`);
  copy.addEventListener("click", () => {
    const done = () => {
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1400);
    };
    try {
      navigator.clipboard.writeText(text).then(done, () => selectText(code));
    } catch {
      selectText(code);
    }
  });
  el.append(pre, copy);
});
function selectText(node: Node): void {
  const r = document.createRange();
  r.selectNodeContents(node);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

// ---------------------------------------------------------------------------------------------
// Session: intro, outro, enabled controls
// ---------------------------------------------------------------------------------------------
let sessionOn = false;
let busy = true;
let seq: { i: number; t: number; emitted: boolean } | null = null;
let stepLabel = { text: "", until: 0 };
let clock = 0;

const stateBtns = new Map<OrbState, HTMLButtonElement>();
STATE_ORDER.forEach((k, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn state-btn";
  b.setAttribute("aria-pressed", "false");
  b.innerHTML = `<span>${STATE_COPY[k].label}</span><kbd>${i + 1}</kbd>`;
  b.addEventListener("click", () => sessionOn && !busy && setState(k));
  $("stateGrid").appendChild(b);
  stateBtns.set(k, b);
});

function controlsOn(): boolean {
  return sessionOn && !busy;
}
function updateControls(): void {
  const on = controlsOn();
  stateBtns.forEach((b) => (b.disabled = !on));
  $<HTMLButtonElement>("seqBtn").disabled = !on;
  $<HTMLButtonElement>("sessionBtn").disabled = busy;
  const gestures = orb.gestures && on && !reduceMotion;
  document.querySelectorAll<HTMLButtonElement>("#gestureRow button").forEach((b) => (b.disabled = !gestures));
}

async function startSession(): Promise<void> {
  busy = true;
  updateControls();
  hideCardNow();
  $("capTitle").textContent = "Intro";
  $("capText").textContent = "The i flings its dot up, it becomes the o, and the o becomes the orb.";
  await orb.intro();
  sessionOn = true;
  busy = false;
  $("sessionBtn").textContent = "End session";
  setState(orb.state, true);
  updateControls();
}

async function endSession(): Promise<void> {
  busy = true;
  seq = null;
  updateSeqBtn();
  updateControls();
  orb.stopWaiting();
  if (cardOn) await dismissCard();
  $("capTitle").textContent = "Session ended";
  $("capText").textContent = "The orb settles back into the o.";
  await orb.outro();
  sessionOn = false;
  busy = false;
  $("sessionBtn").textContent = "Start session";
  $("capText").textContent = "Start a session to replay the intro.";
  updateControls();
  syncPlayback();
}
$("sessionBtn").addEventListener("click", () => {
  if (busy) return;
  void (sessionOn ? endSession() : startSession());
});

// ---------------------------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------------------------
const working = { done: 0, t: 0, completed: false, completedFor: 0 };
const STEPS = 3;
const STEP_SECONDS = 1.45;

function setState(k: OrbState, quiet = false): void {
  if (!quiet && seq) {
    seq = null;
    updateSeqBtn();
  }
  if (k === "working") {
    working.done = 0;
    working.t = 0;
    working.completed = false;
    working.completedFor = 0;
    orb.progress = { steps: STEPS, done: 0, current: 0 };
  } else {
    orb.progress = null;
  }
  orb.state = k;
  stateBtns.forEach((b, s) => b.setAttribute("aria-pressed", String(s === k)));
  $("capTitle").textContent = STATE_COPY[k].label;
  $("capText").textContent = STATE_COPY[k].text;
  syncPlayback();
}

function updateSeqBtn(): void {
  $("seqBtn").textContent = seq ? "Stop the turn" : "Play a full turn";
}
$("seqBtn").addEventListener("click", () => {
  if (seq) {
    seq = null;
    updateSeqBtn();
    setState("idle");
    return;
  }
  if (!controlsOn()) return;
  hideCardNow();
  orb.stopWaiting();
  if (orb.placement !== "center") void orb.place("center");
  seq = { i: 0, t: 0, emitted: false };
  setState(SEQ[0]![0], true);
  updateSeqBtn();
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const el = e.target as HTMLElement;
  if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range")) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 6 && controlsOn()) setState(STATE_ORDER[n - 1]!);
});

orb.addEventListener("orb-statechange", (e) => {
  // The component may change state itself (interrupt switches speaking to listening).
  const to = e.detail.to;
  stateBtns.forEach((b, s) => b.setAttribute("aria-pressed", String(s === to)));
  $("capTitle").textContent = STATE_COPY[to].label;
  $("capText").textContent = STATE_COPY[to].text;
  syncPlayback();
});

// ---------------------------------------------------------------------------------------------
// Gestures and the sample card (the emit contract, SPEC §9)
// ---------------------------------------------------------------------------------------------
const cardSlot = $("cardSlot");
const uiCard = $("uiCard");
let cardOn = false;
let waitingSince = -1;

function flashLabel(text: string, seconds = 1.6): void {
  stepLabel = { text, until: clock + seconds };
}
orb.addEventListener("orb-gesture", (e) => {
  const { name, phase } = e.detail;
  if (name === "wait") waitingSince = phase === "start" ? clock : -1;
  else if (phase === "start" && GESTURE_LABEL[name]) flashLabel(GESTURE_LABEL[name]!);
});

function tween(ms: number, fn: (p: number) => void, ease: (x: number) => number = (x) => x): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      fn(ease(p));
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

async function emitCard(): Promise<void> {
  cardOn = true;
  cardSlot.hidden = false;
  cardSlot.classList.toggle("is-centered", orb.placement === "aside");
  orb.gesture("emit").catch(noop); // moves the orb to room (unless aside) and pulses it
  const o = orb.originRect(); // read immediately, as the contract says
  const r = cardSlot.getBoundingClientRect();
  const dx = o.x - (r.left + r.width / 2);
  const dy = o.y - (r.top + r.height / 2);
  uiCard.style.opacity = "0";
  await tween(720, (p) => {
    const k = 1 - p;
    uiCard.style.transform = `translate(${(dx * k).toFixed(1)}px,${(dy * k).toFixed(1)}px) scale(${(0.15 + 0.85 * p).toFixed(3)})`;
    uiCard.style.opacity = Math.min(1, p * 2.2).toFixed(3);
  }, springy);
}

async function dismissCard(): Promise<void> {
  if (!cardOn) return;
  const o = orb.originRect();
  const r = uiCard.getBoundingClientRect();
  const dx = o.x - (r.left + r.width / 2);
  const dy = o.y - (r.top + r.height / 2);
  await tween(380, (p) => {
    uiCard.style.transform = `translate(${(dx * p).toFixed(1)}px,${(dy * p).toFixed(1)}px) scale(${(1 - 0.85 * p).toFixed(3)})`;
    uiCard.style.opacity = (1 - p).toFixed(3);
  }, (x) => x * x * x);
  hideCardNow();
}

function hideCardNow(): void {
  cardOn = false;
  cardSlot.hidden = true;
  cardSlot.classList.remove("is-centered");
  uiCard.style.transform = "";
  uiCard.style.opacity = "";
  $("cardConfirm").classList.remove("is-pointed");
}

let pointedTimer = 0;
function pointAtConfirm(): void {
  const btn = $("cardConfirm");
  orb.gesture("point", { target: btn, duration: 1800 }).catch(noop);
  btn.classList.add("is-pointed");
  clearTimeout(pointedTimer);
  pointedTimer = window.setTimeout(() => btn.classList.remove("is-pointed"), 1800);
}

function comeBack(): void {
  void orb.place(cardOn ? "room" : "center");
  cardSlot.classList.remove("is-centered");
  $("asideBtn").textContent = "Step aside";
}

async function runGesture(name: string): Promise<void> {
  if (!controlsOn()) return;
  switch (name) {
    case "emit":
      await emitCard();
      break;
    case "point":
      if (!cardOn) {
        void emitCard();
        setTimeout(pointAtConfirm, 750);
      } else pointAtConfirm();
      break;
    case "aside":
      if (orb.placement === "aside") comeBack();
      else {
        void orb.place("aside");
        if (cardOn) cardSlot.classList.add("is-centered");
        $("asideBtn").textContent = "Come back";
        flashLabel("Your turn");
      }
      break;
    default:
      orb.gesture(name as GestureName).catch(noop);
  }
}
document.querySelectorAll<HTMLButtonElement>("#gestureRow button").forEach((b) =>
  b.addEventListener("click", () => void runGesture(b.dataset.g!)),
);

orb.addEventListener("orb-recall", () => comeBack());

$("cardConfirm").addEventListener("click", async () => {
  if (!controlsOn()) return;
  orb.stopWaiting();
  $("cardConfirm").classList.remove("is-pointed");
  await dismissCard();
  await orb.place("center");
  orb.gesture("hop").catch(noop);
});
$("cardChange").addEventListener("click", () => {
  if (!controlsOn()) return;
  orb.stopWaiting();
  if (orb.placement === "aside") comeBack();
  setState("listening");
  flashLabel("Listening for a new time");
});

$<HTMLInputElement>("charOn").addEventListener("change", (e) => {
  orb.gestures = (e.target as HTMLInputElement).checked;
  $("charNote").textContent = orb.gestures
    ? "Leans toward your pointer while listening, nods before thinking, breathes in before speaking and hops when a task finishes."
    : "Gestures are off. The orb only reacts to sound and state.";
  updateControls();
});
if (reduceMotion) {
  $("charNote").textContent = "Reduced motion is on, so gestures are paused.";
  $("rmNote").hidden = false;
}

// ---------------------------------------------------------------------------------------------
// Signal sources: simulated, audio file, microphone
// ---------------------------------------------------------------------------------------------
type Source = "sim" | "file" | "mic";
let source: Source = "sim";
let simPace = 1;
const sim = { syl: null as null | { dur: number; t: number; peak: number; bright: number; cons: boolean }, gap: 0.3, count: 0, phrase: 7 };

function simStep(dt: number, flavour: number) {
  const quiet = { amp: 0.02, bright: 0.4, bass: 0.04, treble: 0.02 };
  if (sim.gap > 0) {
    sim.gap -= dt;
    return quiet;
  }
  sim.syl ??= { dur: rand(0.09, 0.24) / simPace, t: 0, peak: rand(0.45, 1), bright: rand(0.25, 0.8) + flavour, cons: Math.random() < 0.5 };
  const y = sim.syl;
  y.t += dt;
  const ph = y.t / y.dur;
  if (ph >= 1) {
    sim.syl = null;
    sim.count++;
    if (sim.count >= sim.phrase) {
      sim.count = 0;
      sim.phrase = 4 + Math.floor(Math.random() * 9);
      sim.gap = rand(0.35, 0.9);
    } else sim.gap = Math.random() < 0.35 ? rand(0.04, 0.14) / simPace : 0;
    return quiet;
  }
  const e = Math.pow(Math.sin(Math.PI * ph), 0.7);
  const amp = y.peak * e;
  const onset = y.cons && ph < 0.22;
  return { amp, bright: clamp(y.bright * (0.6 + 0.4 * e) + (onset ? 0.2 : 0)), bass: amp * 0.8, treble: onset ? 0.75 * (1 - ph / 0.22) : 0.15 * e };
}

let ctx: AudioContext | null = null;
let fileEl: HTMLAudioElement | null = null;
let fileNode: MediaElementAudioSourceNode | null = null;
let fileName = "";
let micStream: MediaStream | null = null;
let micNode: MediaStreamAudioSourceNode | null = null;

const srcButtons: Record<Source, HTMLButtonElement> = { sim: $("srcSim"), file: $("srcFile"), mic: $("srcMic") };
const note = $("srcNote");

function audioContext(): AudioContext | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  void ctx.resume();
  return ctx;
}

function warn(msg: string): void {
  note.textContent = msg;
  note.classList.add("warn");
}

function setSource(s: Source): void {
  source = s;
  orb.detachInput();
  orb.detachOutput();
  if (s === "file" && fileNode) {
    orb.attachInput(fileNode);
    orb.attachOutput(fileNode);
  }
  if (s === "mic" && micStream && ctx) {
    micNode ??= ctx.createMediaStreamSource(micStream);
    orb.attachInput(micStream);
    orb.attachOutput(micNode);
  }
  (Object.keys(srcButtons) as Source[]).forEach((k) => srcButtons[k].setAttribute("aria-checked", String(k === s)));
  $("paceRow").hidden = s !== "sim";
  note.classList.remove("warn");
  if (s === "sim") note.textContent = "A synthetic voice envelope: syllables, word gaps and phrase pauses.";
  if (s === "file") {
    note.textContent = `Playing ${fileName} on loop during listening and speaking. `;
    const c = document.createElement("button");
    c.type = "button";
    c.className = "linkish";
    c.textContent = "Change file";
    c.addEventListener("click", () => $("fileInput").click());
    note.appendChild(c);
  }
  if (s === "mic") note.textContent = "Live microphone. It drives the orb in Listening and Speaking. Nothing is recorded or sent anywhere.";
  syncPlayback();
}

function syncPlayback(): void {
  if (!fileEl) return;
  const want = source === "file" && controlsOn() && STATE_COPY[orb.state].audio !== null;
  if (want && fileEl.paused) {
    void audioContext()?.resume();
    fileEl.play().catch(noop);
  }
  if (!want && !fileEl.paused) fileEl.pause();
}

srcButtons.sim.addEventListener("click", () => setSource("sim"));
srcButtons.file.addEventListener("click", () => (fileNode ? setSource("file") : $("fileInput").click()));
srcButtons.mic.addEventListener("click", () => (micStream ? setSource("mic") : void startMic()));

$<HTMLInputElement>("fileInput").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  const c = audioContext();
  if (!c) return warn("This browser can't analyse audio files.");
  if (!fileEl) {
    fileEl = new Audio();
    fileEl.loop = true;
    fileNode = c.createMediaElementSource(fileEl);
    fileNode.connect(c.destination); // so it is audible; the orb taps the same node
  }
  if (fileEl.src) URL.revokeObjectURL(fileEl.src);
  fileEl.src = URL.createObjectURL(f);
  fileName = f.name;
  setSource("file");
  if (controlsOn() && !STATE_COPY[orb.state].audio) setState("speaking");
  input.value = "";
});

async function startMic(): Promise<void> {
  const c = audioContext();
  const fail = (err?: unknown) => {
    setSource(source);
    srcButtons.mic.textContent = "Microphone";
    const name = (err as { name?: string } | undefined)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") warn("The microphone is blocked here. Allow it in your browser's site settings and try again, or load an audio file instead.");
    else if (name === "NotFoundError") warn("No microphone was found. Plug one in or pick an input device in your system settings, then try again.");
    else warn(`The microphone couldn't start${name ? ` (${name})` : ""}. Close other apps using it and try again.`);
  };
  if (!c || !navigator.mediaDevices?.getUserMedia) return fail();
  srcButtons.mic.textContent = "Starting…";
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    micNode = null;
    srcButtons.mic.textContent = "Microphone";
    setSource("mic");
    if (controlsOn() && !STATE_COPY[orb.state].audio) setState("listening");
  } catch (err) {
    micStream = null;
    fail(err);
  }
}

orb.addEventListener("orb-input-silent", (e) => {
  if (source === "mic") {
    if (e.detail.seconds === 0) {
      micStream = null;
      micNode = null;
      warn("The microphone stopped. Click Microphone to start it again.");
    } else warn("The page is getting silence from the microphone. Check that the right input device is selected in your browser's site settings, and that it isn't muted.");
  }
});

$<HTMLInputElement>("pace").addEventListener("input", (e) => {
  simPace = parseFloat((e.target as HTMLInputElement).value);
  $("paceOut").textContent = `${simPace.toFixed(1)}×`;
});

// ---------------------------------------------------------------------------------------------
// Meters and tuning
// ---------------------------------------------------------------------------------------------
const METERS = [["amp", "Loudness"], ["bright", "Brightness"], ["bass", "Bass"], ["treble", "Treble"], ["pace", "Pace"]] as const;
const meterEls: Record<string, { bar: HTMLElement; out: HTMLElement }> = {};
for (const [key, label] of METERS) {
  const row = document.createElement("div");
  row.className = "meter";
  row.innerHTML = `<span>${label}</span><div class="bar"><i></i></div><output class="mono">0.00</output>`;
  $("meters").appendChild(row);
  meterEls[key] = { bar: row.querySelector("i")!, out: row.querySelector("output")! };
}

type Tunable = "reactivity" | "maxSwellPercent" | "attackMs" | "releaseMs" | "flowSpeed" | "grain";
const SLIDERS: Array<{ key: Tunable; label: string; min: number; max: number; step: number; fmt: (v: number) => string }> = [
  { key: "reactivity", label: "Reactivity", min: 0.4, max: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
  { key: "maxSwellPercent", label: "Max swell", min: 0, max: 10, step: 0.5, fmt: (v) => `${v}%` },
  { key: "attackMs", label: "Attack", min: 10, max: 200, step: 5, fmt: (v) => `${v} ms` },
  { key: "releaseMs", label: "Release", min: 60, max: 700, step: 10, fmt: (v) => `${v} ms` },
  { key: "flowSpeed", label: "Flow speed", min: 0.3, max: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
  { key: "grain", label: "Grain", min: 0, max: 0.14, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
];
const initial = orb.config;
for (const s of SLIDERS) {
  const wrap = document.createElement("div");
  wrap.className = "slider";
  wrap.innerHTML =
    `<div class="slider-head"><label for="t-${s.key}">${s.label}</label><output class="mono"></output></div>` +
    `<input type="range" id="t-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${initial[s.key]}">`;
  const out = wrap.querySelector("output")!;
  const input = wrap.querySelector("input")!;
  out.textContent = s.fmt(initial[s.key]);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    orb.config = { [s.key]: v };
    out.textContent = s.fmt(v);
  });
  $("sliders").appendChild(wrap);
}

$("copyBtn").addEventListener("click", () => {
  // The component's own config object, in the SPEC §13 shape: paste it back with `orb.config = {...}`.
  const json = JSON.stringify(orb.config, null, 2);
  const btn = $("copyBtn");
  const ta = $<HTMLTextAreaElement>("copyFallback");
  const done = () => {
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy settings"), 1600);
  };
  const fallback = () => {
    ta.hidden = false;
    ta.value = json;
    ta.focus();
    ta.select();
    btn.textContent = "Select and copy below";
  };
  try {
    navigator.clipboard.writeText(json).then(done, fallback);
  } catch {
    fallback();
  }
});

// ---------------------------------------------------------------------------------------------
// The demo's own frame loop: simulated voice, the working steps, the sequence, meters, caption
// ---------------------------------------------------------------------------------------------
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  const state = orb.state;

  if (source === "sim") {
    const f = simStep(dt, STATE_COPY[state].audio === "out" ? 0.08 : 0);
    orb.setLevels(f, "input");
    orb.setLevels(f, "output");
  }

  if (controlsOn() && state === "working") {
    if (!working.completed) {
      working.t += dt;
      working.done = Math.min(STEPS, Math.floor(working.t / STEP_SECONDS));
      const current = working.done >= STEPS ? 0 : (working.t % STEP_SECONDS) / STEP_SECONDS;
      orb.progress = { steps: STEPS, done: working.done, current };
      if (working.done >= STEPS) {
        working.completed = true;
        working.completedFor = 0;
      }
    } else {
      working.completedFor += dt;
      if (!seq && working.completedFor > 2.4) setState("working", true);
    }
    $("capStep").textContent = working.completed ? "3 of 3 done" : `Step ${working.done + 1} of 3`;
  } else {
    const waiting = waitingSince >= 0;
    const label = waiting ? (clock - waitingSince > 9 ? "Waiting · dimmed" : "Waiting for you") : clock < stepLabel.until ? stepLabel.text : "";
    if ($("capStep").textContent !== label) $("capStep").textContent = label;
  }

  if (seq) {
    seq.t += dt;
    const [name, dur] = SEQ[seq.i]!;
    if (name === "speaking" && !seq.emitted && seq.t > 1.6) {
      seq.emitted = true;
      void emitCard();
    }
    const done = dur === null ? working.completed && working.completedFor > 0.9 : seq.t >= dur;
    if (done) {
      seq.i++;
      seq.t = 0;
      if (seq.i >= SEQ.length) {
        seq = null;
        updateSeqBtn();
        setTimeout(() => {
          if (seq || !cardOn) return;
          pointAtConfirm();
          setTimeout(() => !seq && cardOn && orb.gesture("wait").catch(noop), 2200);
        }, 400);
      } else setState(SEQ[seq.i]![0], true);
    }
  }

  const lv = orb.levels;
  const v: Record<string, number> = { amp: lv.amp, bright: lv.bright, bass: lv.bass, treble: lv.treble, pace: lv.pace };
  for (const key in meterEls) {
    meterEls[key]!.bar.style.width = `${(clamp(v[key]!) * 100).toFixed(1)}%`;
    meterEls[key]!.out.textContent = key === "pace" ? `${lv.paceRate.toFixed(1)}/s` : v[key]!.toFixed(2);
  }
  requestAnimationFrame(frame);
}

setSource("sim");
updateControls();
requestAnimationFrame(frame);
void startSession();
