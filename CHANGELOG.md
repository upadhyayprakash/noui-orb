# Changelog

## Unreleased

- Project scaffold.
- The `<noui-orb>` component: WebGL orb (shader ported verbatim from the prototype) with CSS fallback, six states, ring, audio analysis and envelope, springs and eight gestures, placements, logo intro and outro, reduced motion, off-screen pausing and the frame-time guard.
- The package can be imported on a server (Next.js and other SSR) without throwing; the element registers in the browser only.
- README: quick start, microphone, and framework notes (React 19 verified).
- Read-only `levels` property: the smoothed signal the orb is showing.
- Interactive demo (`demo/`), built on the public API only, with Cloudflare Pages config (`wrangler.jsonc`, `_redirects`, `_headers`, `404.html`).
- Demo: a "Get started" section with seven copyable code samples. The runnable ones are executed by the tests, so they can't drift from the API.
