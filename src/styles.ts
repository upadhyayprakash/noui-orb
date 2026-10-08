/**
 * Shadow DOM styles. Colours are CSS custom properties with fallbacks at the point of use, so a page can
 * set them anywhere above the element: --orb-accent, --orb-mark-ink, --orb-ring, --orb-ring-track,
 * --orb-ring-broken. The orb's own colours are brand constants and are not themeable (SPEC §4.2).
 */
export const CSS = /* css */ `
:host {
  display: block;
  position: relative;
  aspect-ratio: 1 / 1;
  pointer-events: none;
  -webkit-tap-highlight-color: transparent;
}
:host(:focus-visible) { outline: none; }
:host([role="button"]:focus-visible) .orb-wrap { outline: 2px solid var(--orb-ring, #e9581c); outline-offset: 2px; border-radius: 50%; }
[hidden] { display: none !important; }
* { box-sizing: border-box; }

.orb-wrap {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
  opacity: 0;
  visibility: hidden;
  pointer-events: auto;
}
:host([role="button"]) .orb-wrap { cursor: pointer; }
.orb-body { position: absolute; inset: 0; transform-origin: 50% 50%; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.fallback {
  position: absolute;
  inset: 11%;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #ffd58c, #ff9055 46%, #ea5a2a 100%);
}

.ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  opacity: 0;
  transform-origin: 50% 50%;
  pointer-events: none;
}
.ring-track { fill: none; stroke: var(--orb-ring-track, rgba(27, 25, 23, 0.12)); stroke-linecap: butt; }
.ring-fill { fill: none; stroke: var(--orb-ring, #e9581c); stroke-linecap: round; }
.ring.is-broken .ring-track { stroke: var(--orb-ring-broken, #6b655f); opacity: 0.7; }

.mark {
  position: absolute;
  left: 29%;
  top: 29%;
  width: 42%;
  height: 42%;
  overflow: visible;
  pointer-events: none;
  visibility: hidden;
}
.mark path, .mark line {
  fill: none;
  stroke: var(--orb-mark-ink, #1b1917);
  stroke-width: 10;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mark .dot { fill: var(--orb-accent, #ff6b1a); }

@media (prefers-color-scheme: dark) {
  .ring-track { stroke: var(--orb-ring-track, rgba(242, 239, 235, 0.14)); }
  .ring-fill { stroke: var(--orb-ring, #ff8a45); }
  .ring.is-broken .ring-track { stroke: var(--orb-ring-broken, #a59e97); }
  .mark path, .mark line { stroke: var(--orb-mark-ink, #f2efeb); }
  .mark .dot { fill: var(--orb-accent, #ff7a2e); }
}
`;
