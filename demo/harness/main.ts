import "../../src/index";
import type { GestureName, OrbState } from "../../src/index";

// Test harness: a bare page the Playwright tests drive. The real demo is demo/index.html.
const orb = document.querySelector("noui-orb")!;
const log = document.getElementById("log")!;
const say = (s: string) => (log.textContent = s + "\n" + (log.textContent ?? "").split("\n").slice(0, 6).join("\n"));
(window as unknown as { orb: typeof orb }).orb = orb;

const button = (parent: string, label: string, fn: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", fn);
  document.getElementById(parent)!.appendChild(b);
};

for (const s of ["idle", "listening", "thinking", "working", "speaking", "error"] as OrbState[]) {
  button("states", s, () => {
    orb.state = s;
    if (s === "working") orb.progress = { steps: 3, done: 0, current: 0 };
  });
}
for (const g of ["nod", "shake", "huh", "hop", "interrupt", "emit", "point", "wait"] as GestureName[]) {
  button("gestures", g, () =>
    orb.gesture(g, { target: new DOMPoint(window.innerWidth * 0.8, window.innerHeight * 0.3) }).catch((e) => say(`${g}: ${e}`)));
}
button("misc", "intro", () => void orb.intro());
button("misc", "outro", () => void orb.outro());
for (const p of ["center", "room", "aside"] as const) button("misc", p, () => void orb.place(p));
button("misc", "progress +1", () => {
  const p = orb.progress ?? { steps: 3, done: 0 };
  orb.progress = { steps: p.steps, done: Math.min(p.steps, p.done + 1), current: 0 };
});

// Simulated voice through the public setLevels API (opt in with ?sim=1).
let phase = 0;
if (new URLSearchParams(location.search).has("sim")) setInterval(() => {
  phase += 0.05;
  const amp = Math.max(0, Math.sin(phase * 9)) * (0.4 + 0.5 * Math.abs(Math.sin(phase * 1.7)));
  const lv = { amp, bright: 0.5 + 0.3 * Math.sin(phase * 3), bass: amp * 0.8, treble: amp * 0.3 };
  orb.setLevels(lv, "input");
  orb.setLevels(lv, "output");
}, 16);

for (const t of ["orb-statechange", "orb-gesture", "orb-recall", "orb-intro-end", "orb-outro-end", "orb-input-silent", "orb-fallback"] as const) {
  orb.addEventListener(t, (e) => say(`${t} ${JSON.stringify((e as CustomEvent).detail)}`));
}
orb.addEventListener("orb-recall", () => void orb.place("center"));
