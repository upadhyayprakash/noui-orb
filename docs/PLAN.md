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

Status 9 Oct 2026: every decision is implemented. The orb repo is public, the site repo is private, hosting is Cloudflare Pages, and the demo is live at `https://noui.si/lab/orb/`.

## M1 · Scaffold

- [x] `git init`, `.gitignore` (node_modules, dist, demo-dist, .env, .npmrc), `README.md` stub, `LICENSE`, `CHANGELOG.md`.
- [x] `package.json`: name, `version: 0.0.0`, `type: module`, `exports` for `.` and `./element`, `types`, `files`, `sideEffects`, `engines.node >= 22.14`, `publishConfig.access: public`, `repository`, `homepage` (the demo URL), `keywords`, `license`. *(The `engines` field was dropped later, see M5.)*
- [x] TypeScript strict, Vite library config, Vitest, Playwright, size check.
- [x] `ci.yml`: on push and pull request, run install, typecheck, unit tests, build, size check, Playwright smoke test.
- [x] Create the **public** GitHub repo `noui-orb` with `gh repo create` (confirm the owner first) and push `main`.

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
- At the end of M2: 66 unit tests (springs at 15 and 60 fps follow the same trajectory, envelope, features, ring, placement, intro frames, hand-off numbers, frame guard) and 22 Playwright tests (events, rate limit, interrupt, aside and recall, reduced motion, fallback, silence detection, off-screen pausing, hand-off within 1 px at 640 px). **Now (9 Oct 2026): 69 unit tests and 42 Playwright tests** (behaviour 22, demo 13, acceptance 5, plus the two retried comparison tests inside acceptance).
- Bundle: about 16 KB min+gzip of the 25 KB budget.
- `demo/` holds only a small dev harness. The control panel is M3. For the meters it will need the live levels; the public API has no getter for them, so M3 either computes them in the demo or adds a read-only `levels` property to SPEC §3 first.
- Not verified at the time: Safari and Firefox, a real microphone, a real GPU (all rendering was in headless Chromium with software GL). Since then the owner confirmed Chrome and Safari with a real microphone on the deployed demo. Firefox is still untested.

## M3 · Demo at noui.si/lab/orb

- [x] Rebuild the prototype's control panel in `demo/` on the public API only: states, full turn, signal sources (simulated, audio file, microphone), meters, tuning sliders with Copy settings, character gestures, the sample card, the vocabulary table.
- [x] Build with Vite `base: "/lab/orb/"` into `demo-dist/lab/orb/`, so asset paths match the URL path when served from a route.
- [x] Config for the demo as its own Cloudflare Pages project (`wrangler.jsonc`, `pages/_redirects`, `pages/_headers`, `pages/404.html`, copied into `demo-dist/` by `npm run build:demo`). Live at `noui.si/lab/orb/` since 8 Oct 2026 through the site's Pages Function proxy (option a), verified on a preview and on the live domain. See `docs/DEPLOY-DEMO.md` and `docs/OPERATIONS.md`.
  - Done 8 Oct 2026: checked the current Cloudflare docs for: Pages Git integration, `_redirects` and `_headers`, Pages Functions, and custom domains. Prefer Pages Git integration (Cloudflare pulls from GitHub; no secret in this repo). Fall back to a GitHub Action with `wrangler pages deploy` and a `CLOUDFLARE_API_TOKEN` secret scoped to "Cloudflare Pages: Edit" on this account only.
  - Add a `/lab/orb` → `/lab/orb/` redirect (`_redirects`) and a 404 that links back to the demo.
- [x] **Owner:** connect this repo in the Cloudflare dashboard (or create the scoped token), after noui.si is on Cloudflare (`docs/SITE-MIGRATION.md`). *(Done via Pages Git integration on 8 Oct 2026 as `noui-orb-demo`; it did not need noui.si on Cloudflare.)*
- [x] Until the noui.si move is done, preview the demo on its `*.pages.dev` URL.
- [x] Open the deployed demo over HTTPS and confirm the microphone works in Chrome and Safari.


Done so far (8 Oct 2026):

- `demo/index.html` is built only on the public API (also the first customer of the new read-only `levels` property, SPEC §3.2). Copy settings exports the component's own `config` (SPEC §13 shape), not the prototype's ad hoc JSON, so it can be pasted back into `orb.config`.
- The old bare page the tests drive now lives at `demo/harness/` and is not part of the demo build.
- `build:demo` fails if the bundle doesn't register `<noui-orb>`. This caught a real bug: the demo's source import was tree-shaken away because `sideEffects` only listed `dist/index.js`.
- 13 demo tests (states, a full turn with the card, step aside and recall, tuning and Copy settings, simulated voice, an audio file, a fake microphone device, ending and restarting the session, the Get started samples, the Copy button, and the link-preview tags).
- Added beyond the original list: a **Get started** section on the demo page (seven copyable samples; the runnable ones are executed by the tests), Open Graph and Twitter tags, and a generated share image `demo/public/og.png` (`scripts/make-og-image.mjs`, `STYLE=voice`).

M3 complete (8 Oct 2026): the owner connected the repo to Cloudflare Pages, checked the real microphone on Chrome and Safari, and the demo is live at `noui.si/lab/orb/` through the site's proxy (the move of noui.si to Cloudflare is recorded in `docs/SITE-MIGRATION.md` and `docs/OPERATIONS.md`). Firefox is untested.

## M4 · Acceptance

- [x] Work through SPEC §16 and tick each item here with a short note.
- [x] Side-by-side with `prototype/noui-orb-prototype.html`: same states, same feel. Record any deliberate differences in CHANGELOG.
- [x] Playwright: gesture peaks at a throttled 15 fps within 10% of 60 fps.
- [x] README: install (`npm i @nouisi/orb`), quick start, API table, events, the conductor example from SPEC §12, a link to https://noui.si/lab/orb/, a short GIF or video of the orb.


Done 8 Oct 2026. Notes:

- SPEC §16 has a status line per item. Two are **not** ticked: the live-microphone latency and platforms (works in Chrome and Safari per the owner, 50 ms unmeasured, iOS unconfirmed), and the hand-off with the approved artwork (waits for M6).
- The side-by-side is a statistical comparison, not a pixel diff. Deliberate differences from the prototype are listed in CHANGELOG.
- README: install, quick start, attributes, properties, methods, events, theming, accessibility, microphone, the conductor example, framework notes, the live demo link and an animated GIF (`docs/media/orb.gif`, regenerate with `node scripts/record-gif.mjs`).
- Writing the acceptance tests found two bugs in the tests themselves (not the component): a measurement read after the state had changed, and a ring angle wrapping at 360.

## M5 · First release

- [x] Set the version to `0.1.0`, update CHANGELOG, commit.
- [x] Run `npm pack --dry-run` and show the owner the file list and size.
- [x] **Owner:** in this folder, run `npm login`, then `npm publish --access public` and enter the one-time password. The package has to exist on npm before trusted publishing can be configured, so this first publish is manual.
- [x] **Owner:** on npmjs.com, open the package → Settings → Trusted publishing → GitHub Actions. Enter the GitHub owner, repository and workflow filename `release.yml`. A new trusted-publisher setup expires if it isn't used within about two days, so do the next step promptly.
- [x] Claude writes `release.yml`. The original plan used `npm publish`; the real file, `.github/workflows/release.yml`, runs `npm stage publish` because this package's publishes are staged (see the notes below). It also checks that the tag matches `package.json` and runs typecheck, tests, build and the size check first. Trusted publishing needs npm CLI 11.5.1 or later, Node 22.14 or later, `id-token: write` and a GitHub-hosted runner; no `NODE_AUTH_TOKEN` is used.
- [x] Bump to `0.1.1` (a docs or README change is enough), commit, and ask the owner to approve pushing the `v0.1.1` tag.
- [x] Confirm the release workflow published `0.1.1` and that the npm page shows provenance.
- [x] **Owner:** npm package → Settings → Publishing access → "Require two-factor authentication and disallow tokens".

Notes (8 Oct 2026):

- **0.1.0 is published** (approved by the owner) and verified from the registry in a clean project: imports in Node, types compile, a Vite bundle runs in Chromium. A `0.0.0-stage` placeholder version also exists on npm; `latest` is 0.1.0.
- **Staged publishing.** npm held the first publish until the owner approved it with 2FA (`npm stage approve`). Per the npm docs a trusted publisher's allowed actions always include `npm stage publish`, while plain `npm publish` has to be allowed separately. So `release.yml` runs `npm stage publish`, and each release waits for the owner's approval. Steps are in `docs/RELEASING.md`. (Provenance turned out to be recorded for staged publishes; see the 0.1.1 note below.)
- The `engines` field was dropped (a browser component should not restrict consumers' Node version).
- **0.1.1 is published** (8 Oct 2026). The `v0.1.1` tag ran `release.yml` first time (27 s): typecheck, tests, build, size, then `npm stage publish` via trusted publishing. The version was staged (id `7609d9bc-b993-4628-b7ea-71fb8abd10d6`), the owner approved it with 2FA, and it is on npm with a verified SLSA provenance attestation (`npm audit signatures` reports 1 verified attestation). **Staged publishing does record provenance.** A fresh install shows the corrected README.
- M5 complete: Publishing access is set to "Require two-factor authentication and disallow bypass 2fa tokens".


## Domain move · noui.si on Cloudflare (added during the work, not in the original plan)

Runbook and inventory: `docs/SITE-MIGRATION.md`. The overall picture, debugging playbook and lessons: `docs/OPERATIONS.md`.

- [x] Read-only inventory: registrar OpusDNS (Hostinger panel), no email records, no DNSSEC, GitHub Pages as origin.
- [x] **Owner:** add the `noui.si` zone to Cloudflare; create the `noui-site` Pages project from the site repo.
- [x] Site repo: `functions/lab/orb/[[path]].js` (proxy to the demo project), `public/_headers`, `public/_redirects`, and a branded `404.html` as a Vite entry (no visit ping, absolute asset URLs).
- [x] Fix the Cloudflare GitHub connection for both Pages projects (they had silently disconnected; the demo was stale until fixed).
- [x] **Owner:** change the nameservers at the registrar; the `.si` registry published them after about an hour.
- [x] **Owner:** attach `noui.si` and `www.noui.si` to `noui-site`. HTTP redirects to HTTPS.
- [x] Verify the live domain: home, `/lab/`, `/lab/orb/`, 404, microphone (real Chromium, the owner's Mac and phone).
- [x] Remove `deploy.yml` and `CNAME` from the site repo; delete the merged `cloudflare-pages` branch.
- [x] **Owner:** remove the custom domain from GitHub Pages and unpublish it; make the `noui` repo private (9 Oct 2026).
- [x] End-to-end flow test from the private repo: branch preview, pull request and merge, production deploy, and cleanup deploy all worked.
- [ ] Watch the tail of the stale-DNS window. Some resolvers (the owner's home router at the last check) still hand out the old GitHub address, and with GitHub Pages gone that is a 404 for those users until they refresh, expected by about 20:00 UTC on 8 Oct 2026. Re-check `https://noui.si/cdn-cgi/trace` from a second network.
- [ ] Optional: a Cloudflare Redirect Rule so `www.noui.si` redirects to the apex (it serves the same site today; pages declare `noui.si` as canonical).
- [ ] Optional: an uptime check for `noui.si` and `noui.si/lab/orb/`.

## M6 · Adopt in noui.si

- [ ] In the noui.si repo: `npm install <package>`, place `<noui-orb>` where the voice surface goes, and hand off from the existing A5 loading animation to the orb's intro.
- [ ] Wire the conductor from SPEC §12 to whatever voice pipeline exists; until then drive states from the app's loading and processing events.
- [ ] Replace the placeholder mark with the approved artwork and recheck the hand-off alignment.

Before M6 can start (needs the owner): the **approved logo SVG** (probably in the site repo's `brand/logo/svg/`), and a decision on **where the orb goes** on the site (replace the load splash, or live in the experiment where the intent is typed). Nothing is changed in the site repo for M6 yet.

## Backlog (not scheduled)

- **CI time.** `ci` takes about 10 minutes and runs twice on a tag push. Options: skip `ci` on tags, and run the two prototype-comparison tests only on `main`.
- **Release 0.1.2.** The npm page still shows the README from 0.1.1 (which links to the pages.dev demo); a patch release would refresh it, with the share-image and link updates.
- **SPEC §16 open items.** Microphone reaction time (50 ms, unmeasured) and iOS confirmation; the hand-off with the approved artwork (comes with M6).
- **Firefox** is untested for the component.
- **GitHub Actions** warns that the Node 20 based `checkout@v4` and `setup-node@v4` are deprecated; bump when convenient.
- **`*.pages.dev` addresses.** Keep both: the demo address is what the site's proxy fetches, and branch previews live on the site's. Possible hardening: `noindex` headers on the `pages.dev` hostnames and protecting previews with Cloudflare Access.
- **Rollback in Cloudflare Pages** has not been exercised.

