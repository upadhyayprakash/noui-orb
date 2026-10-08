# `<noui-orb>` component spec

Version 0.1 · October 2026 · Status: ready to build

Reference implementation: `prototype/noui-orb-prototype.html` (prototype v7). When this spec and the prototype disagree, this spec wins; when the spec is silent, copy the prototype's behaviour and numbers.

---

## 1. Purpose

`<noui-orb>` is the living form of the orange o in the noui mark. It is the product's voice surface and its loading and processing indicator. It appears from the logo, shows who is talking and how loudly, shows when the user is waiting, brings assembled interface into view, and gets out of the way while the user works.

### Principles

1. **The orb shows energy, the ring shows time.** The orb reacts to voice and activity. The ring appears only when something is being waited on.
2. **One meaning per gesture.** Every motion has exactly one meaning (see §8). Never animate for decoration.
3. **Character through motion, never a face.** No eyes, no mouth, no expressions.
4. **Get out of the way.** When the user is working in the interface, the orb shrinks aside.
5. **Honest progress.** The ring fills only from real progress. Unknown waits use the orbiting arc.

### Non-goals

- Speech-to-text, voice activity detection, or any network calls. The host app owns these and feeds the component signals and states.
- App logic or deciding which gesture to play. A host-side conductor does that (§12).
- Rendering the assembled interface. The host renders cards; the component gives it the geometry to animate from (§9).

---

## 2. Architecture

```
noui-orb/
  index.ts              custom element, public API, events
  renderer/
    gl.ts               WebGL setup, resize, render loop
    orb.frag.glsl       fragment shader (port from prototype FS)
    fallback.ts         CSS-gradient orb when WebGL is unavailable
  ring.ts               SVG progress ring
  character.ts          springs, gestures, lean, placement
  signals/
    analyser.ts         Web Audio feature extraction (§7)
    envelope.ts         attack/release smoothing, onset/pace detection
  intro.ts              logo → orb and orb → logo timelines
  mark.ts               logo mark SVG (replace with approved paths, §10.1)
  config.ts             defaults (§13), merged with user config
```

Layers talk in one direction: **API → state targets → per-frame update → renderer/ring/character**. One `requestAnimationFrame` loop drives everything. No layer reads the DOM in the frame loop except the pointer/target geometry cached on events.

- **Framework:** none. Plain Web Component (Custom Elements v1, Shadow DOM, `mode: "open"`). Works in any host framework and in native web views.
- **Language:** TypeScript, compiled to one ES module. No runtime dependencies.
- **Budget:** under 25 KB min+gzip, excluding the host's audio models.

---

## 3. Public API

### 3.1 Element and attributes

```html
<noui-orb state="idle" gestures placement="center" intro="auto"></noui-orb>
```

| Attribute | Values | Default | Notes |
|---|---|---|---|
| `state` | `idle` `listening` `thinking` `working` `speaking` `error` | `idle` | Reflects the `state` property. |
| `placement` | `center` `room` `aside` | `center` | Where the orb sits inside its own box (§9). |
| `gestures` | boolean | present | Turns character motion on or off (§8). |
| `intro` | `auto` `manual` `none` | `manual` | `auto` plays the logo intro on first connect. `none` starts as the orb. |
| `reduced-motion` | `auto` `on` `off` | `auto` | `auto` follows `prefers-reduced-motion`. |
| `label` | string | `"noui"` | Used in the accessible name (§11). |

The element fills its box. The host sizes it; it should be square. All internal geometry is in percent of the box.

### 3.2 TypeScript interface

```ts
type OrbState = "idle" | "listening" | "thinking" | "working" | "speaking" | "error";
type Placement = "center" | "room" | "aside";
type GestureName = "nod" | "shake" | "huh" | "hop" | "interrupt" | "emit" | "point" | "wait";

interface OrbProgress {
  steps: number;        // number of known steps, 1–8
  done: number;         // completed steps
  current?: number;     // 0–1 progress within the current step
}

interface OrbLevels {   // for hosts that analyse audio themselves (native bridge, server audio)
  amp: number;          // 0–1 loudness
  bright?: number;      // 0–1 spectral brightness
  bass?: number;        // 0–1
  treble?: number;      // 0–1
}

interface NouiOrbElement extends HTMLElement {
  state: OrbState;
  placement: Placement;
  gestures: boolean;

  /** Determinate ring. null = no known progress. Only shown in `working`. */
  progress: OrbProgress | null;

  /** Plays a gesture. Resolves when its motion settles. Rejects with "suppressed" if
   *  gestures are off, reduced motion is on, or the rate limit drops it (§8.3). */
  gesture(name: GestureName, opts?: { target?: Element | DOMPoint; duration?: number }): Promise<void>;
  stopWaiting(): void;

  /** Moves the orb inside its box (§9). Same as setting `placement`, but awaitable. */
  place(p: Placement): Promise<void>;

  /** The orb's current circle in viewport coordinates, for animating host UI from or to it. */
  originRect(): { x: number; y: number; r: number };

  /** Audio sources. The component analyses them (§7). */
  attachInput(source: MediaStream | AudioNode): void;    // the user's voice
  attachOutput(source: HTMLMediaElement | AudioNode): void; // the reply's audio
  detachInput(): void;
  detachOutput(): void;

  /** Push levels directly instead of attaching audio. Call every frame or on each analysis tick. */
  setLevels(levels: OrbLevels, channel: "input" | "output"): void;

  /** Logo ↔ orb transitions (§10). */
  intro(): Promise<void>;
  outro(): Promise<void>;

  /** Tuning. Partial merge over defaults (§13). Same shape as the prototype's Copy settings JSON. */
  config: Partial<OrbConfig>;
}
```

### 3.3 Events

All events bubble, are composed, and carry `detail`.

| Event | Detail | When |
|---|---|---|
| `orb-statechange` | `{ from, to }` | After `state` changes. |
| `orb-gesture` | `{ name, phase: "start" \| "end" }` | Around every gesture, including automatic ones. |
| `orb-recall` | `{}` | The user clicked or tapped the orb while it was `aside`. The host decides whether to bring it back. |
| `orb-intro-end` / `orb-outro-end` | `{}` | Transition finished. |
| `orb-input-silent` | `{ seconds }` | Input attached, state `listening`, loudness under 0.03 for 4 s. Fires once until loudness recovers. |
| `orb-fallback` | `{ reason }` | WebGL unavailable; the CSS fallback is in use. |

### 3.4 Clarifications settled while building (M2)

These resolve places where §3 to §14 were ambiguous. Code and spec agree on all of them.

- **`gestures`** is a plain boolean attribute: present means on, absent means off (§8.3). `document.createElement` users set `el.gestures = true`.
- **`intro`**: `auto` plays the intro on first connect, `none` starts as the orb, `manual` (default) starts as the complete logo with the orb hidden and nothing animating until `intro()` is called. The intro always lands at `center`, then moves to the requested `placement` if it differs.
- **Rejections.** `gesture()` rejects with the string `"suppressed"` (not an `Error`), so hosts should `.catch(() => {})` calls they don't need. An unknown gesture name rejects with a `TypeError`.
- **Effects that don't depend on motion still happen.** `interrupt` switches `speaking` to `listening`, and `emit` moves the orb to `room` (unless `aside`), even when the gesture itself is suppressed (gestures off, reduced motion, rate limit). The promise still rejects. This keeps the host's state machine correct in every mode.
- **`point`** `duration` is in **milliseconds**, default 1800. With no target it reuses the last one, and does nothing if there never was one.
- **Not animating.** If the element can't animate (off-screen, hidden tab), `gesture()` resolves immediately, and `place()` jumps to the placement and resolves.
- **`setLevels`** values older than 300 ms are ignored. Fresh pushed levels take precedence over an attached analyser on the same channel.
- **`orb-input-silent`** applies to an attached input or fresh pushed input levels. It re-arms when loudness rises above 0.15. When a track ends, the input is detached and the event fires with `seconds: 0`.
- **Pointer lean** divides by half the box width times the placement scale (as the prototype does), minimum 40 px, not by the 39% orb radius. The pointer is tracked on `window`, so the orb leans toward the pointer anywhere on the page.
- **Pointer events.** The host has `pointer-events: none` and only the orb itself receives them, so an `aside` orb never blocks the interface under its box. Click, Enter and Space on the `aside` orb fire `orb-recall`.
- **Reduced motion** also turns placement moves into a 200 ms ease-out (no spring overshoot).
- **Ring.** The segment count (up to 8, from `progress.steps`) only changes while the gaps are closed or the ring is invisible, so it never jumps. Without `progress`, `working` shows the spinning arc.
- **Frame-time guard** compiles a one-octave variant of the shader on first use (the loop bound of `fbm` changes from 2 to 1); the shader source is otherwise byte-identical to the prototype's.
- **Colours** come from CSS custom properties with fallbacks, settable anywhere above the element: `--orb-accent`, `--orb-mark-ink`, `--orb-ring`, `--orb-ring-track`, `--orb-ring-broken`. The orb's own colours are not themeable.
- **The `config` getter** returns a copy; assign a partial to change it. Unknown keys and non-finite numbers are ignored.

---

## 4. Visual spec

### 4.1 Geometry (percent of the element's box)

| Part | Value |
|---|---|
| Orb radius at rest | 39% (shader: 0.78 of the half-box) |
| Ring radius | 45% |
| Ring stroke | 0.5% (raise to 0.8% below 120 px box size) |
| Logo mark box during intro | 42%, centred |
| Logo o | filled circle, radius 20 in the mark's 120-unit viewBox (optical size, 87% of a full-height disc) |

### 4.2 Orb surface (fragment shader)

Port the prototype's `FS` string unchanged, then make these uniforms the contract:

| Uniform | Range | Source |
|---|---|---|
| `uRes` | px | canvas size |
| `uTime` | s | wall clock since start |
| `uFlowT` | s | accumulated flow time (§6.2) |
| `uWave` | rad | accumulated wave phase (§6.2) |
| `uAmp`, `uBright`, `uBass`, `uTreble` | 0–1 | smoothed signal (§7) |
| `uSat` | 0–1 | state saturation × wait dim (§8.2) |
| `uEnergy` | −0.2–0.8 | state energy + completion flash × 0.5 |
| `uGrain` | 0–0.14 | config |
| `uScale` | ~0.9–1.1 | §6.2 |
| `uWaveAmt` | 0.3 or 1 | 0.3 with reduced motion |
| `uLean` | vec2, unit disc | lean vector, y flipped for GL (§8.2) |

Surface recipe, for reference: two-octave domain-warped 3D simplex noise sampled on the sphere normal at 0.62 frequency, plus a diagonal band term, radial waves (`sin(8r − uWave)`), treble ripple and bass swell. The result is mapped through four colour stops, lit softly from the upper left, darkened slightly at the rim, and finished with per-pixel grain refreshed at 14 Hz.

| Stop | Shader RGB | Approx. hex |
|---|---|---|
| Deep | 0.95, 0.36, 0.15 | `#F25C26` |
| Mid | 1.00, 0.54, 0.27 | `#FF8A45` |
| Light | 1.00, 0.68, 0.38 | `#FFAD61` |
| Pale | 1.00, 0.84, 0.52 | `#FFD685` |

The orb colours are brand constants and do not change with light or dark theme.

### 4.3 Fallback

When WebGL fails to compile or link, render a CSS radial gradient (pale → mid → deep) at the same radius. Scale and saturation still follow §6. Fire `orb-fallback`.

---

## 5. States

All parameters ease toward their state targets with a 0.35 s time constant (`k = 1 − e^(−dt/0.35)`). Never snap.

| State | Flow | Energy | Saturation | Waves | Ring | Driven by | Idle pulse |
|---|---|---|---|---|---|---|---|
| `idle` | 0.25 | 0 | 0.93 | outward | hidden | time | — |
| `listening` | 0.50 | 0.06 | 1.00 | **inward** | hidden | input audio | — |
| `thinking` | 1.30 | 0.30 | 1.00 | outward | orbiting arc | time | 0.20 |
| `working` | 0.60 | 0.12 | 0.95 | outward | steps | `progress` | 0.06 |
| `speaking` | 0.60 | 0.12 | 1.00 | outward | hidden | output audio | — |
| `error` | 0.08 | −0.12 | 0.08 | outward | broken | time | — |

Idle pulse, when there's no audio: `amp = pulse × (0.55 + 0.45·sin(3.4t))`.

**Accessible names:** "noui is idle", "noui is listening", "noui is thinking", "noui is working, step 2 of 3", "noui is speaking", "noui can't connect".

---

## 6. Ring

### 6.1 Modes

| Mode | Used in | Drawing |
|---|---|---|
| hidden | idle, listening, speaking | opacity → 0 |
| spin | thinking | full track; one 64° arc rotating at 290°/s |
| steps | working | `progress.steps` segments with 7° gaps; each fills with its step |
| broken | error | 3 segments with 34° gaps, track in the muted colour, no fill |

- **Opacity:** eases with a 0.18 s time constant. Scale goes from 0.94 to 1 with opacity.
- **Gaps:** ease with a 0.12 s time constant.
- **Linecaps:** the track uses butt caps so segments meet cleanly at a 0° gap. The fill uses round caps.
- **Completion:** when `done === steps`, the gaps close to 0°, the orb gets a completion flash (§6.2), then the ring fades out after 0.5 s. The `hop` gesture fires automatically (§8.1).
- **Colours:** `--orb-ring` (light `#E9581C`, dark `#FF8A45`), `--orb-ring-track` (12–14% of the foreground colour), `--orb-ring-broken` (the muted text colour).
- **Without `progress`:** if `state = working` and `progress` is null, show the spin mode. Never fake determinate progress.

### 6.2 Per-frame motion

```
flowT  += dt · flow · config.flow · (1 + 0.8·pace) · motion · hesitate · waitFactor
wave   += dt · waveDir · (1.2 + 5·amp) · motion
scale   = 1 + (swell/100)·amp + breathing + 0.035·flash + gestureScale
breathing = 0.012·sin(1.35t) in idle, 0.004·sin(1.35t) otherwise
flash  decays with τ = 0.45 s; set to 1 on task completion, ≥ 0.6 on emit
motion  = 0.35 with reduced motion, else 1
```

---

## 7. Audio signals

### 7.1 Analysis

- `AnalyserNode`, `fftSize` 2048, `smoothingTimeConstant` 0.5.
- **Loudness:** RMS of the time-domain samples in dB, mapped −58…−18 dB to 0…1, then multiplied by `config.reactivity` and clamped.
- **Brightness:** spectral centroid, mapped 600…3800 Hz to 0…1.
- **Bass:** mean magnitude under 300 Hz × 1.4, clamped.
- **Treble:** mean magnitude between 2.5 and 8 kHz × 2.2, clamped.

### 7.2 Smoothing

- **Loudness envelope:** attack 45 ms, release 260 ms (`τ` switches on direction). This is the single most important feel parameter.
- **Brightness, bass, treble:** 0.12 s time constant.
- **Pace:** an onset is counted when loudness rises above 0.38 (re-armed below 0.22, at least 80 ms after the previous onset). Pace = onsets in the last 2 s ÷ 2 ÷ 5, clamped to 0–1 and eased with a 0.6 s time constant.

### 7.3 Microphone handling (bugs found in the prototype)

1. **Keep references** to the `MediaStream` and its source node for the life of the attachment. Some browsers garbage-collect an unreferenced live input.
2. **Route the analyser to the output** through a gain node set to 0. Safari does not process nodes that have no path to `destination`, so the analyser reads silence.
3. **Call `audioContext.resume()`** after `getUserMedia` resolves. The permission prompt can leave the context suspended.
4. The component does not call `getUserMedia` itself; the host passes the stream. Recommend that hosts request `{ echoCancellation: false, noiseSuppression: false, autoGainControl: true }` when the stream feeds only the orb and voice detection.
5. Watch the track's `ended` event: detach and fire `orb-input-silent`.

### 7.4 Which channel drives the orb

`listening` reads the input channel. `speaking` reads the output channel, except during the first 0.55 s after entering `speaking` (the breath, §8.1). All other states ignore audio.

---

## 8. Character and gestures

### 8.1 Gesture vocabulary

Every gesture is a set of impulses on four damped springs (§8.2) plus, for some, a timed effect. Times are from gesture start.

| Gesture | Means | Motion | Auto trigger (in component) |
|---|---|---|---|
| `nod` | Got it, yes | squash +1.9, y +22 | `listening → thinking` |
| `shake` | No, can't do that | x +34, −52 at 110 ms, +40 at 230 ms, −20 at 350 ms; flow stalls 0.35 s | — |
| `huh` | I didn't understand | rot +95, x +18, flow stalls 0.5 s; at 240 ms rot −140, x −26 | — |
| `hop` | Done | y −60, squash −1.4 (stretch); squash +1.9 at 300 ms | `working` progress completes |
| `interrupt` | Go ahead | scale −0.07·(1−e^(−t/0.06))·e^(−t/0.45), y −10, squash +0.8; if `speaking`, switch to `listening` | — (host calls it on barge-in) |
| `emit` | Here's what you need | flash ≥ 0.6, squash +1.3; placement → `room` unless `aside` | — |
| `point` | Look here | lean toward `opts.target` at gain 4.5% for `opts.duration` (default 1.8 s); jab x,y += dir × 16 | — |
| `wait` | Take your time | see below; continues until stopped | — |
| breath (internal) | About to speak | scale +0.035·sin(πt/0.6) for 0.6 s; output audio ignored for the first 0.55 s | entering `speaking` |
| lean (internal) | I'm listening | lean toward the pointer, or (0, 0.55) when there is none; gain 1.6% | while `listening` |

**`wait` in detail:**

- **Breath:** `0.018·sin(1.15t)`.
- **Glances:** a glance (`point` with no jab, 0.9 s) at the last `point` target every 3.2 s, the first after 1.2 s.
- **Dimming:** from 8 s to 10 s, dim ramps 0 → 1 with a 0.5 s time constant. Saturation × (1 − 0.55·dim), opacity × (1 − 0.3·dim), flow × (0.6 − 0.3·dim).
- **Ends on:** any state change, any other gesture, any pointer down inside the element, or `stopWaiting()`.

### 8.2 Springs and lean

Semi-implicit Euler, sub-stepped at 240 Hz so motion is identical at any frame rate. **This matters:** at 13 fps the unsub-stepped version flattened the nod to almost nothing.

| Spring | Stiffness k | Damping c | Output |
|---|---|---|---|
| squash `sq` | 170 | 11 | `scale(1 + 0.55·sq, 1 − sq)` |
| y | 150 | 10 | translate Y, % of box |
| x | 140 | 11 | translate X, % of box |
| rot | 160 | 10 | rotate, degrees |

- **Lean vector:** eased with a 0.28 s time constant. Gain eases between 1.6 and 4.5 at the same rate.
- **Transform order** on the orb body: `translate(lean·gain + x, lean·gain + y) rotate(rot) scale(…)`.
- **Shader lean:** `uLean` = lean vector with y negated. The shader shifts the noise origin by 0.22·lean, moves the light by 0.7·lean, and adds a warm spot at 0.45·lean.
- **Pointer:** pointer position relative to the orb's current centre, divided by its current radius (minimum 40 px), clamped to the unit disc.

### 8.3 Rules

- **Rate limit:** at most one expressive gesture (nod, shake, huh, hop, emit, point) per 1.2 s. A dropped gesture rejects with `"suppressed"`. `interrupt` is never rate-limited and cancels any running gesture.
- **Confidence:** hosts should only send backend gestures at confidence ≥ 0.7. A wrong nod is worse than no nod. This is enforced in the conductor, not the component.
- **Gestures off:** the attribute removed means no springs, no lean, no breath, no wait dimming. States, audio and ring still work. Placement still works.
- **Reduced motion:** gestures are off, the intro and outro become 200 ms crossfades, flow runs at 0.35×, and wave amplitude at 0.3×.

---

## 9. Placement and assembled interface

The orb moves inside its own box. The host lays out its interface around the element and can read `originRect()` at any time.

| Placement | Translate | Scale | Use |
|---|---|---|---|
| `center` | 0, 0 | 1 | conversation |
| `room` | 0, −16% | 0.64 | interface shown below the orb |
| `aside` | −37%, −37% | 0.20 | user working in the interface; orb at roughly logo-o size, top left |

- **Transitions:** 650 ms with the springy curve `1 − e^(−6x)·cos(9x)`. A new placement interrupts a running transition from the current position.
- **In `aside`:** the orb becomes a button: `role="button"`, `tabindex="0"`, accessible name "Bring back noui". Click, Enter or Space fires `orb-recall`.

**How the host animates a card out of the orb (the `emit` contract):**

1. Call `orb.gesture("emit")`. This moves the orb to `room` and pulses it.
2. Read `orb.originRect()` immediately.
3. Animate the card from the orb's centre: 720 ms springy, scale 0.15 → 1, translate from the orb's centre to the card's slot, opacity reaching 1 at 45% of the way.
4. To dismiss into the orb: 380 ms cubic ease-in back to the orb's centre, scale → 0.15, fade out. Then `place("center")` and `gesture("hop")`.

---

## 10. Logo intro and outro

### 10.1 The mark

The component ships with the mark inline. Replace the placeholder paths with the approved artwork, keeping these named parts and the 120-unit viewBox:

| Part | Placeholder | Requirement |
|---|---|---|
| `letters` group | n: `M14 52V31a16 16 0 0 1 32 0v21`; u: `M14 68v21a16 16 0 0 0 32 0V68` | everything except the i stem and o |
| `stem` | line x 90, y 68 → 105 | the dotless i, animatable `y1` |
| `dot` | circle cx 90, cy 33, r 20 | the orange o; its centre and radius define the hand-off (§10.4) |

Stroke 10, round caps, ink colour `--orb-mark-ink`; the o uses the brand orange (`--orb-accent`).

### 10.2 Intro (≈ 3.4 s)

| t (ms) | Duration | What | Easing |
|---|---|---|---|
| 0 | 450 | hold the mark with the dot resting above the stem (cy 55, r 5.5) | — |
| 450 | 240 | stem top 68 → 79; dot rides down 55 → 66 | cubic in-out |
| 690 | 460 / 420 | stem springs back 79 → 68 (back easing, c1 = 2.2); dot flies 66 → 33, r 5.5 → 8.5 | back / cubic out |
| 1150 | 300 | dot swells r 8.5 → 20 | back |
| 1450 | 750 | hold: the complete logo | — |
| 2200 | 180 | orb appears on the o; dot fades | linear |
| 2380 | 1000 | orb grows to `center`; letters and stem fade over the first 300 ms | springy |

### 10.3 Outro (≈ 1.3 s)

1. If a card is shown, dismiss it (§9).
2. If not at `center`, place center (450 ms).
3. Orb shrinks onto the o (750 ms, cubic in-out).
4. Dot fades in (140 ms) and the orb hides.
5. Letters and stem fade in (420 ms).

### 10.4 Hand-off geometry

With the mark box at 42% of the element, o centre `(ox, oy)` and o radius `r` in viewBox units, the orb transform that sits exactly on the o is:

```
dx = (ox/120 − 0.5) · 42%      → 10.5% for ox = 90
dy = (oy/120 − 0.5) · 42%      → −9.45% for oy = 33
s  = (r/120 · 0.42) / 0.39     → 0.1795 for r = 20
```

Compute these from the mark at runtime so new artwork stays aligned.

---

## 11. Accessibility

- **Accessible name:** the host element has `role="img"` and a name that tracks the state (§5). Name changes are not announced; the host owns announcements and must show reply text or captions. The orb never carries information alone.
- **Reduced motion:** see §8.3. Also respected when the OS setting changes while the page is open.
- **Contrast:** the orb is not text and needs no contrast ratio, but the ring must reach 3:1 against the page background in both themes.
- **Keyboard:** the element is not focusable except in `aside` (§9).
- **No flashing:** the completion flash is a brightness change of under 20%, and nothing flickers faster than 3 Hz.

---

## 12. Integrating with the voice pipeline

The component stays dumb. A host-side **conductor** maps app events to component calls.

```ts
vad.on("speechStart", () => {
  if (orb.state === "speaking") { tts.stop(); orb.gesture("interrupt"); }
  else orb.state = "listening";
});
vad.on("speechEnd", () => { orb.state = "thinking"; });          // auto nod fires
stt.on("final", text => backend.send(text));
backend.on("progress", p => { orb.state = "working"; orb.progress = p; });
backend.on("reply", r => {
  if (r.gesture && r.confidence >= 0.7) orb.gesture(r.gesture, { target: r.targetEl });
  if (r.ui) { orb.gesture("emit"); renderCardFrom(orb.originRect(), r.ui); }
  if (r.audio) { orb.attachOutput(r.audio); orb.state = "speaking"; }
});
tts.on("ended", () => { orb.state = cardShown ? "idle" : "listening"; if (cardShown) orb.gesture("wait"); });
userStartsEditingCard(() => orb.place("aside"));
orb.addEventListener("orb-recall", () => orb.place(cardShown ? "room" : "center"));
```

**Backend reply contract** (suggested):

```json
{ "ui": { "...": "..." }, "speech": "...", "gesture": "nod", "confidence": 0.86, "target": "confirm" }
```

The gesture is a side output of the same model call that builds the reply; there is no separate gesture model.

**Model download:** while an on-device speech model downloads, use `state = "working"` with `progress = { steps: 1, done: 0, current: bytes/total }`. The ring is the progress bar.

---

## 13. Configuration defaults

```json
{
  "reactivity": 1.2,
  "maxSwellPercent": 5,
  "attackMs": 45,
  "releaseMs": 260,
  "flowSpeed": 1,
  "grain": 0.06,
  "geometry": { "orbRadius": 0.39, "ringRadius": 0.45, "ringStroke": 0.005, "oRadius": 20 },
  "placements": {
    "center": { "dx": 0, "dy": 0, "s": 1 },
    "room":   { "dx": 0, "dy": -16, "s": 0.64 },
    "aside":  { "dx": -37, "dy": -37, "s": 0.2 }
  },
  "gestureRateLimitMs": 1200,
  "waitDimAfterMs": 8000,
  "maxDevicePixelRatio": 1.75
}
```

The prototype's **Copy settings** button exports the tuned values in a compatible shape.

---

## 14. Performance

- **Lazy start:** compile shaders on first connect, not at import.
- **Pause** rendering when the element is off-screen (IntersectionObserver), the tab is hidden, or the orb is fully transparent (before the intro and after the outro).
- **Resolution:** cap the device pixel ratio at 1.75 on desktop and 1.5 on phones. Below a 160 px box, render at 1×.
- **Frame-time guard:** if the average frame takes longer than 20 ms over 2 s, reduce the noise to one octave and halve the resolution. Restore after 10 s of good frames.
- **Budget:** under 2 ms GPU per frame at 400 px on a mid-range phone.
- **No allocation in the frame loop** (reuse typed arrays for audio analysis).

---

## 15. Native apps

Keep §5–§10 as the shared contract. Port the shader to Metal (iOS) and AGSL (Android), and use the same spring constants and timings. Native hosts compute levels from their own audio buffers and call the equivalent of `setLevels`. Export §13 as a JSON file shared by web and native.

---

## 16. Acceptance criteria

- [ ] All six states match the prototype side by side at 60 fps and at a throttled 15 fps.
- [ ] Gesture peaks at 15 fps are within 10% of those at 60 fps (springs sub-stepped).
- [ ] With a live microphone in Chrome and Safari (macOS and iOS), listening reacts within 50 ms of speech onset.
- [ ] Revoking microphone permission or unplugging the device fires `orb-input-silent` and doesn't throw.
- [ ] `interrupt` during `speaking` switches to `listening` within one frame.
- [ ] The ring never shows determinate fill without `progress`.
- [ ] Intro and outro land the orb exactly on the o (within 1 px at 640 px box size) with the approved artwork.
- [ ] Reduced motion: no springs, no lean, crossfade intro, no motion faster than 0.35×.
- [ ] Off-screen and hidden-tab rendering uses no GPU time.
- [ ] The CSS fallback works with WebGL disabled.
- [ ] Light and dark themes: the ring and mark ink adapt; the orb colours stay constant.

---

## 17. Open questions

1. **Approved logo paths.** Swap in the final artwork and confirm the o's centre and radius (§10.1).
2. ~~**`aside` position on phones.**~~ Decided 8 Oct 2026: top left, as specified.
3. ~~**Gesture set for v1.**~~ Decided 8 Oct 2026: all eight.
4. **Hinglish speech recognition.** This is outside the component, but it decides how often `huh` fires.
5. **Idle frame rate.** Consider dropping to 30 fps in `idle` and `wait` to save battery.
