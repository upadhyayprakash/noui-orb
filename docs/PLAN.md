# noui-orb plan

Work top to bottom. Stop at the end of each milestone, summarise what changed, and wait for the owner's review. Steps marked **Owner** are done by Prakash, not Claude.

## M0 · Decisions

Agreed on 8 Oct 2026 unless marked "confirm".

| Decision | Answer |
|---|---|
| Package name | `@nouisi/orb` (npm org `nouisi` exists; name was unpublished on 8 Oct 2026) |
| Repos | This repo, `noui-orb`, is **public** and holds only the component and its demo. The website repo `noui` stays separate and becomes **private** (see `docs/SITE-MIGRATION.md`). Nothing from `noui` is copied here. |
| GitHub owner | Agreed: personal account `upadhyayprakash` |
| Licence | Agreed 8 Oct 2026: MIT for the code, with a README note that the noui name and mark are not licensed |
| Demo URL | `https://noui.si/lab/orb/` (agreed; `/lab/` leaves room for future experiments) |
| Hosting | Cloudflare **Pages** (not Workers; decided 8 Oct 2026) for both noui.si and the demo; no GitHub Pages. Pages projects can't be mounted on a sub-path of another project's domain, so how `/lab/orb/` is served is decided: option (a), the site's Pages project proxies `/lab/orb/*` to the demo project via a Pages Function (keeps `noui.si/lab/orb/`). Option (b), a subdomain such as `orb.noui.si`, was not chosen |
| `aside` position on phones | Agreed: top left, as spec |
| v1 gestures | Agreed: all eight |

## M1 · Scaffold

- [x] `git init`, `.gitignore` (node_modules, dist, demo-dist, .env, .npmrc), `README.md` stub, `LICENSE`, `CHANGELOG.md`.
- [ ] `package.json`: name, `version: 0.0.0`, `type: module`, `exports` for `.` and `./element`, `types`, `files`, `sideEffects`, `engines.node >= 22.14`, `publishConfig.access: public`, `repository`, `homepage` (the demo URL), `keywords`, `license`.
- [ ] TypeScript strict, Vite library config, Vitest, Playwright, size check.
- [ ] `ci.yml`: on push and pull request, run install, typecheck, unit tests, build, size check, Playwright smoke test.
- [ ] Create the **public** GitHub repo `noui-orb` with `gh repo create` (confirm the owner first) and push `main`.

## M2 · Component

Port in this order, each with unit tests where the logic is pure:

- [x] `renderer/`: WebGL setup and the shader from the prototype, unchanged; resize with the DPR caps; CSS fallback with `orb-fallback`.
- [x] `signals/`: analyser features and envelope (SPEC §7), including the three microphone fixes in §7.3; `attachInput`, `attachOutput`, `setLevels`.
- [x] `ring.ts`: four modes, steps from `progress`, completion behaviour (SPEC §6).
- [x] State targets and easing (SPEC §5); accessible names.
- [x] `character.ts`: sub-stepped springs, lean, pointer, all gestures, wait, rate limit, events (SPEC §8).
- [x] Placement and `originRect()` (SPEC §9); `aside` as a button firing `orb-recall`.
- [x] `intro.ts` and `mark.ts`: timeline from SPEC §10, hand-off geometry computed from the mark.
- [x] Reduced motion and off-screen/hidden pausing (SPEC §8.3, §14).

Done 8 Oct 2026. Notes:

- Shader ported byte for byte (extracted by script from the prototype). Ambiguities in the spec are resolved in SPEC §3.4.
- 66 unit tests (springs at 15 and 60 fps follow the same trajectory, envelope, features, ring, placement, intro frames, hand-off numbers, frame guard) and 22 Playwright tests (events, rate limit, interrupt, aside and recall, reduced motion, fallback, silence detection, off-screen pausing, hand-off within 1 px at 640 px).
- Bundle: about 16 KB min+gzip of the 25 KB budget.
- `demo/` holds only a small dev harness. The control panel is M3. For the meters it will need the live levels; the public API has no getter for them, so M3 either computes them in the demo or adds a read-only `levels` property to SPEC §3 first.
- Not verified here: Safari and Firefox, a real microphone, a real GPU (all rendering was in headless Chromium with software GL).

## M3 · Demo at noui.si/lab/orb

- [ ] Rebuild the prototype's control panel in `demo/` on the public API only: states, full turn, signal sources (simulated, audio file, microphone), meters, tuning sliders with Copy settings, character gestures, the sample card, the vocabulary table.
- [ ] Build with Vite `base: "/lab/orb/"` into `demo-dist/lab/orb/`, so asset paths match the URL path when served from a route.
- [ ] Deploy the demo as its own Cloudflare Pages project (`wrangler.jsonc` with `pages_build_output_dir: "demo-dist"` in this repo). Serve it at `noui.si/lab/orb/` using option (a) from M0.
  - Before writing config, check the current Cloudflare docs for: Pages Git integration, `_redirects` and `_headers`, Pages Functions, and custom domains. Prefer Pages Git integration (Cloudflare pulls from GitHub; no secret in this repo). Fall back to a GitHub Action with `wrangler pages deploy` and a `CLOUDFLARE_API_TOKEN` secret scoped to "Cloudflare Pages: Edit" on this account only.
  - Add a `/lab/orb` → `/lab/orb/` redirect (`_redirects`) and a 404 that links back to the demo.
- [ ] **Owner:** connect this repo in the Cloudflare dashboard (or create the scoped token), after noui.si is on Cloudflare (`docs/SITE-MIGRATION.md`).
- [ ] Until the noui.si move is done, preview the demo on its `*.pages.dev` URL.
- [ ] Open the deployed demo over HTTPS and confirm the microphone works in Chrome and Safari.

## M4 · Acceptance

- [ ] Work through SPEC §16 and tick each item here with a short note.
- [ ] Side-by-side with `prototype/noui-orb-prototype.html`: same states, same feel. Record any deliberate differences in CHANGELOG.
- [ ] Playwright: gesture peaks at a throttled 15 fps within 10% of 60 fps.
- [ ] README: install (`npm i @nouisi/orb`), quick start, API table, events, the conductor example from SPEC §12, a link to https://noui.si/lab/orb/, a short GIF or video of the orb.

## M5 · First release

- [ ] Set the version to `0.1.0`, update CHANGELOG, commit.
- [ ] Run `npm pack --dry-run` and show the owner the file list and size.
- [ ] **Owner:** in this folder, run `npm login`, then `npm publish --access public` and enter the one-time password. The package has to exist on npm before trusted publishing can be configured, so this first publish is manual.
- [ ] **Owner:** on npmjs.com, open the package → Settings → Trusted publishing → GitHub Actions. Enter the GitHub owner, repository and workflow filename `release.yml`. A new trusted-publisher setup expires if it isn't used within about two days, so do the next step promptly.
- [ ] Claude writes `release.yml`:

  ```yaml
  name: release
  on:
    push:
      tags: ["v*"]
  permissions:
    contents: read
    id-token: write
  jobs:
    publish:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22.14
            registry-url: https://registry.npmjs.org
        - run: npm install -g npm@^11.5.1
        - run: npm ci
        - run: npm test
        - run: npm run build
        - run: npm publish
  ```

  Trusted publishing needs npm CLI 11.5.1 or later, Node 22.14 or later, `id-token: write`, and a GitHub-hosted runner. Provenance is added automatically for a public repo and public package. No `NODE_AUTH_TOKEN`.
- [ ] Bump to `0.1.1` (a docs or README change is enough), commit, and ask the owner to approve pushing the `v0.1.1` tag.
- [ ] Confirm the release workflow published `0.1.1` and that the npm page shows provenance.
- [ ] **Owner:** npm package → Settings → Publishing access → "Require two-factor authentication and disallow tokens".

## M6 · Adopt in noui.si

- [ ] In the noui.si repo: `npm install <package>`, place `<noui-orb>` where the voice surface goes, and hand off from the existing A5 loading animation to the orb's intro.
- [ ] Wire the conductor from SPEC §12 to whatever voice pipeline exists; until then drive states from the app's loading and processing events.
- [ ] Replace the placeholder mark with the approved artwork and recheck the hand-off alignment.
