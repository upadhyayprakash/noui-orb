# Changelog

## Unreleased

## 0.1.1 - 2026-10-08

Docs only: the README and the demo no longer say the package is unpublished. First release made through the tag-triggered workflow.

## 0.1.0 - 2026-10-08

First release. An early, scripted prototype: it draws and reacts to audio, it does not understand speech.

- Project scaffold.
- The `<noui-orb>` component: WebGL orb (shader ported verbatim from the prototype) with CSS fallback, six states, ring, audio analysis and envelope, springs and eight gestures, placements, logo intro and outro, reduced motion, off-screen pausing and the frame-time guard.
- The package can be imported on a server (Next.js and other SSR) without throwing; the element registers in the browser only.
- README: quick start, microphone, and framework notes (React 19 verified).
- Read-only `levels` property: the smoothed signal the orb is showing.
- Interactive demo (`demo/`), built on the public API only, with Cloudflare Pages config (`wrangler.jsonc`, `_redirects`, `_headers`, `404.html`).
- Demo: a "Get started" section with seven copyable code samples. The runnable ones are executed by the tests, so they can't drift from the API.

### Deliberate differences from the prototype

The shader is byte for byte the prototype's, and the springs, envelope, timings and placements use the same numbers. These things are different on purpose:

- **Rate limit:** at most one expressive gesture per 1.2 s (SPEC §8.3). The prototype had none.
- **Gestures are an attribute:** off unless `gestures` is present, and `gesture()` returns a promise that rejects with `"suppressed"` (SPEC §3.4).
- **Reduced motion:** the intro and outro are a 200 ms crossfade and placement moves are a 200 ms ease-out. The prototype skipped the intro.
- **Pointer lean** follows the pointer anywhere on the page, not only over the stage.
- **Pausing:** rendering stops when the orb is off-screen, the tab is hidden or the orb is not shown (SPEC §14), and a frame-time guard drops to one noise octave and half resolution on slow frames. The prototype always ran.
- **Mic warnings are events:** `orb-input-silent` replaces the prototype's inline warning text, and a dead track detaches the input.
- **Ring:** up to 8 steps from `progress` (the prototype had 3), and the segment count only changes while the gaps are closed.
- **`interrupt`** switches `speaking` to `listening` even when the motion is suppressed.
- **Copy settings** in the demo exports the component's own `config` (SPEC §13 shape), which can be pasted back into `orb.config`.
- **The sample card, "Step aside" and "Play a full turn"** are host-side code in the demo, built on the public API (the prototype had them inline in the component page).
