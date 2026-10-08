# noui-orb

`<noui-orb>` is the living form of the orange o in the noui mark: a voice surface, a loading and processing indicator, and the place assembled interface comes from. This public repo builds it as a framework-free Web Component, publishes it to npm as `@nouisi/orb`, and deploys an interactive demo to `https://noui.si/lab/orb/` on Cloudflare. The noui website lives in a separate private repo; never copy code from it into this one.

## Sources of truth

- `docs/SPEC.md` is the contract: API, states, numbers, timings, acceptance criteria. If code and spec disagree, fix the code or update the spec in the same commit.
- `prototype/noui-orb-prototype.html` is the reference behaviour. Open it in a browser to see and feel the target. Port from it (the shader is the `FS` string; springs, gestures and intro are in the script). Do not edit it; it's the baseline to compare against.
- `docs/PLAN.md` is the milestone plan. Work through it in order and tick boxes as you go.

## Stack

- TypeScript, Custom Elements v1, Shadow DOM. No runtime dependencies.
- Vite in library mode for the package, and as the dev server and build for the demo.
- Vitest for unit tests (envelope, onset/pace, springs, placement maths, hand-off geometry).
- Playwright for one browser smoke test (states, gestures, intro, throttled frame rate).

## Layout

```
src/            component (structure per SPEC §2)
demo/           interactive demo page, built on the package's public API only
docs/           SPEC.md, PLAN.md, SITE-MIGRATION.md (for the noui repo)
prototype/      reference prototype, read-only
.github/workflows/  ci.yml, release.yml
wrangler.jsonc      Cloudflare Pages config for the demo (pages_build_output_dir)
```

## Package shape

- Two entry points: the default export registers `<noui-orb>` on import; `/element` exports the class without registering it.
- Ship ESM and type declarations. `"sideEffects"` lists only the registering entry (`dist/index.js`, plus `src/index.ts` so the demo build, which imports the source, does not tree-shake the registration away).
- `files` contains only `dist/`, `README.md`, `LICENSE` and `CHANGELOG.md`. Check with `npm pack --dry-run` before every release.
- Size budget: under 25 KB min+gzip. CI fails above it.

## Working rules

- Port the prototype's shader and timings verbatim first; tune only after the side-by-side comparison in PLAN M4 passes.
- Keep the public API exactly as SPEC §3. Additions go in the spec first.
- The demo asks for the microphone only after a click, and works without it (simulated voice, audio file).
- The logo mark is a placeholder until approved artwork is added under `assets/mark.svg`; hand-off geometry is computed from it (SPEC §10.4).
- Orb colours are brand constants and do not change with theme.

## Release safety (always)

- Never run `npm login`, `npm adduser`, `npm token`, or `npm publish` yourself. Never create, read, print or store npm or GitHub tokens.
- Never push tags, create GitHub releases, change repository visibility, change npm package settings, run `wrangler pages deploy` or change Cloudflare routes or DNS without an explicit go-ahead in the current message.
- The first publish is done by the owner by hand (PLAN M5). After that, releases go through `release.yml` with npm trusted publishing (OIDC). No tokens anywhere.
- Never commit secrets, `.npmrc` with auth, `.dev.vars` or `.env` files.

## Commands (create these in M1)

- `npm run dev`: demo with hot reload
- `npm test`: unit tests
- `npm run test:e2e`: Playwright smoke test
- `npm run build`: package to `dist/`
- `npm run build:demo`: demo to `demo-dist/lab/orb/`
- `npm run size`: size check against the budget
