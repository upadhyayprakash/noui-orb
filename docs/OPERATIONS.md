# noui operations guide

How **noui.si**, the **noui-orb** component and the **@nouisi/orb** npm package are hosted, built, deployed and released, written so a junior engineer can read it top to bottom, then come back later to fix something in production.

- **Last updated:** 8 Oct 2026.
- **Status of the domain move:** in progress. The nameservers were changed to Cloudflare and we are waiting for the `.si` registry to publish the change. Sections marked **(pending)** describe the target state and must be re-checked once the move is finished. See [10. The domain move, step by step](#10-the-domain-move-step-by-step).
- **No secrets in this file.** Nothing here is a password, token or key, and none are stored in either repo (we checked: both repos have zero GitHub secrets and zero variables). Keep it that way.

**How to read this.** If you are new: read sections 1 to 3 once, skim 4 to 9, and keep 11 (debugging) and 12 (cookbook) open when something breaks. Statements are marked **Verified** when we actually observed them in this project, and **Per docs** when they come from official documentation we read but did not try ourselves.

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Glossary](#2-glossary)
3. [Accounts and who owns what](#3-accounts-and-who-owns-what)
4. [The domain and DNS](#4-the-domain-and-dns)
5. [Hosting on Cloudflare Pages](#5-hosting-on-cloudflare-pages)
6. [The site repo (noui)](#6-the-site-repo-noui)
7. [The orb repo (noui-orb)](#7-the-orb-repo-noui-orb)
8. [CI/CD: how a change reaches users](#8-cicd-how-a-change-reaches-users)
9. [Releasing the npm package](#9-releasing-the-npm-package)
10. [The domain move, step by step](#10-the-domain-move-step-by-step)
11. [Debugging playbook](#11-debugging-playbook)
12. [Change cookbook](#12-change-cookbook)
13. [Safety rules and gotchas](#13-safety-rules-and-gotchas)
14. [Command cheat sheet](#14-command-cheat-sheet)
15. [Known gaps and open items](#15-known-gaps-and-open-items)
16. [Where to read more](#16-where-to-read-more)

---

## 1. The big picture

There are **two GitHub repositories**, **one npm package**, **two Cloudflare Pages projects** and **one domain**.

| Thing | What it is | Where it lives |
|---|---|---|
| **noui** (the site repo) | The landing site and experiment at noui.si. React + Vite. Static files, no backend of its own. | GitHub `upadhyayprakash/noui` (public today, to become private) |
| **noui-orb** (the orb repo) | `<noui-orb>`, a Web Component (the living orange o), its tests, its demo page, and its docs. | GitHub `upadhyayprakash/noui-orb` (public, MIT) |
| **@nouisi/orb** | The npm package built from noui-orb. Other developers install it. | npm, scope (organisation) `nouisi` |
| **noui-site** | Cloudflare Pages project that builds and serves the site repo. | Cloudflare dashboard |
| **noui-orb-demo** | Cloudflare Pages project that builds and serves the orb demo page. | Cloudflare dashboard |
| **noui.si** | The domain name. | Registered at OpusDNS (managed through the Hostinger panel); DNS moving to Cloudflare |

### How a visitor gets a page (target state, pending)

```
 visitor's browser
        |  https://noui.si/...
        v
 +--------------------------------------------------------------+
 |  Cloudflare  (DNS for noui.si + the "noui-site" Pages project) |
 |                                                                |
 |   /            -> static files built from the "noui" repo      |
 |   /lab/        -> static files built from the "noui" repo      |
 |   /lab/orb/*   -> a small function that fetches the same path  |
 |                   from the "noui-orb-demo" Pages project  ---+ |
 +----------------------------------------------------------|---+
                                                            v
                                  noui-orb-demo.pages.dev/lab/orb/*
                                  (built from the "noui-orb" repo)
```

### How code gets to production

```
 SITE:    git push main (noui)  -->  Cloudflare builds "noui-site"  -->  live
                                     (GitHub Pages also builds it until we switch it off)

 DEMO:    git push main (noui-orb) --> Cloudflare builds "noui-orb-demo" --> live
                                       (and GitHub Actions "ci" runs the tests)

 PACKAGE: git tag v0.1.2 + push the tag (noui-orb)
              --> GitHub Actions "release" stages the version on npm   (about 30 s)
              --> the OWNER approves it with 2FA                       (the only manual step)
              --> npm install @nouisi/orb now gives the new version
```

### Today versus after the move

| | Today (8 Oct 2026) | After the domain move |
|---|---|---|
| noui.si served by | GitHub Pages | Cloudflare Pages (`noui-site`) |
| DNS for noui.si | OpusDNS parking DNS, switching to Cloudflare | Cloudflare |
| `noui.si/lab/orb/` | does not exist yet | proxied to the demo project |
| Demo link people use | `https://noui-orb-demo.pages.dev/lab/orb/` | `https://noui.si/lab/orb/` |
| Site repo visibility | public | private |

---

## 2. Glossary

Words you will meet in this guide, in plain language.

**The internet side**

- **Domain name / registrar.** `noui.si` is a name you rent (here until 2 Oct 2027). The registrar is the company you rent it through. Here: OpusDNS, managed through the Hostinger panel.
- **DNS (Domain Name System).** The phone book of the internet. It turns `noui.si` into the address of a server.
- **Nameserver (NS).** The server that holds the phone book entries for your domain. Changing a domain's nameservers means "ask this other company for my records from now on". Always use **one** provider's nameservers, never a mix.
- **Zone.** The set of DNS records for one domain at one provider. "Adding noui.si to Cloudflare" creates a zone there.
- **DNS record.** One entry in the zone. Common types: **A** (name to an IPv4 address), **CNAME** (name is an alias of another name), **NS** (who the nameservers are), **MX** (where email goes), **TXT** (free text, used for verification and email security).
- **TTL (time to live).** How long, in seconds, other computers may remember an answer before asking again. Short TTL means changes spread faster.
- **Propagation.** The wait while caches around the world expire and pick up a change.
- **Proxied vs DNS only (Cloudflare).** DNS only (grey cloud): Cloudflare just answers the DNS question and traffic goes straight to your server. Proxied (orange cloud): traffic goes through Cloudflare first, which can cache, secure and speed it up.
- **HTTPS / certificate.** The padlock. A certificate proves the site really is noui.si and encrypts the traffic. Cloudflare issues one for you ("Universal SSL") once the zone is active.
- **CDN.** A network of servers around the world that keep copies of your files close to visitors. Cloudflare Pages is hosting plus a CDN.
- **Soft 404.** A page that does not exist but answers "200 OK" with some content. Search engines dislike it. A real "not found" answers status 404.

**The code side**

- **Static site.** Plain files (HTML, CSS, JS, images) with no server code running per request. Hosting it just means putting the files where a web server can hand them out.
- **Build.** Turning the source code into the final files. For both repos: `vite build`.
- **Vite.** The build tool. **Vitest** runs unit tests. **Playwright** drives a real browser for end-to-end tests.
- **Web Component / custom element.** A browser-native way to make your own HTML tag, here `<noui-orb>`. It works in any framework or none.
- **Tree-shaking.** The build removes code it thinks nothing uses. Dangerous when an import exists only for its side effect (like registering a tag). See [11. Debugging playbook](#11-debugging-playbook).
- **SSR (server-side rendering).** Running page code on a server. Importing browser-only code there crashes unless it is guarded. `@nouisi/orb` is guarded.
- **SPA fallback.** If a hosting platform has no `404.html`, it may answer every unknown URL with the home page. We ship a real `404.html` so unknown URLs get a real 404.

**Delivery**

- **CI (continuous integration).** A robot that runs your checks on every push. Here: GitHub Actions.
- **CD (continuous delivery/deployment).** A robot that ships the result. Here: Cloudflare builds and publishes on push, and GitHub Actions stages npm releases.
- **Workflow.** One GitHub Actions file in `.github/workflows/`. **Runner:** the temporary machine that runs it. **Trigger:** what starts it (a push, a tag).
- **Git tag.** A permanent label on one commit, like `v0.1.1`. We use tags to start releases.
- **Semver (semantic versioning).** `MAJOR.MINOR.PATCH`. While the first number is 0 (`0.1.1`) the API may still change. A bug fix or docs change bumps PATCH.
- **npm registry / package / scope.** npm hosts packages. `@nouisi/orb` is the package `orb` in the scope (organisation) `nouisi`.
- **Tarball.** The `.tgz` archive npm stores for each version. You can inspect it before publishing with `npm pack --dry-run`.
- **2FA / OTP.** Two-factor authentication. The OTP is the one-time code from your authenticator app.
- **OIDC and trusted publishing.** A way for a GitHub Actions job to prove "I am workflow `release.yml` of repo `upadhyayprakash/noui-orb`" to npm, so no password or token needs to be stored anywhere.
- **Provenance.** A signed statement on the npm page saying "this exact package was built from this commit by this workflow". Verified for 0.1.1.
- **Staged publishing.** npm holds a new version in a non-public "staged" state until a maintainer approves it with 2FA. Until then a placeholder version `0.0.0-stage` may be what the package page shows.
- **Preview deployment.** Cloudflare builds every non-production branch to its own temporary URL so you can test before merging.
- **Pages Function.** A small piece of server-side JavaScript that Cloudflare runs for certain URL paths. We use one as a proxy.
- **Flaky test.** A test that sometimes fails for reasons unrelated to a real bug (timing, load).

---

## 3. Accounts and who owns what

You need access to these places. Ask the owner to add you; never share passwords. Every account should have 2FA on.

| System | What for | Notes |
|---|---|---|
| **GitHub** (user `upadhyayprakash`) | Both repos, GitHub Actions, GitHub Pages (until switched off) | Admin on both repos. The "Cloudflare Workers and Pages" GitHub app must have access to **both** repos (see the incident in [5](#5-hosting-on-cloudflare-pages)). |
| **npm** (scope `nouisi`) | The `@nouisi/orb` package | Publishing access is set to "Require two-factor authentication and disallow bypass 2fa tokens". A trusted publisher is configured (see [9](#9-releasing-the-npm-package)). |
| **Cloudflare** | DNS zone `noui.si`, Pages projects `noui-site` and `noui-orb-demo` | Free plan. |
| **Hostinger panel** (registrar OpusDNS) | Where the domain's nameservers are set | Domain expires 2 Oct 2027. |
| **Google** (Apps Script + one Google Sheet) | Where the site's experiment, signup and visit data is stored | See `apps-script/README.md` in the site repo. This is **live data**: see [13](#13-safety-rules-and-gotchas). |

**Secrets policy.** No tokens or passwords are stored in GitHub, in Cloudflare build settings or in the repos. Releases use OIDC instead of an npm token. If you ever find a token somewhere, treat it as a mistake: revoke it.

---

## 4. The domain and DNS

### What exists

- **Domain:** `noui.si`. Registrar OpusDNS, managed through the Hostinger panel. Expires 2 Oct 2027. A `.si` domain: the registry is the Slovenian one, which publishes changes on its own schedule (see below).
- **Before the move:** the nameservers were OpusDNS's `atlas.dns-parking.com` and `hyperion.dns-parking.com`. Their records were four `A` records (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`, all GitHub Pages) and a `www` CNAME to `upadhyayprakash.github.io`.
- **No email on this domain.** We queried the authoritative servers: no MX, TXT, CAA or DMARC records. If you ever add email, add the MX/SPF/DKIM records in **Cloudflare**, not at the registrar.
- **No DNSSEC** was enabled (no DS record), so changing nameservers was safe on that front. If DNSSEC is ever enabled, remove the DS record at the registrar before changing nameservers, or the site breaks.
- **After the move (pending):** the nameservers are Cloudflare's. The records live in the Cloudflare dashboard, DNS, Records.

### How to look at DNS yourself

```bash
dig +short NS noui.si                 # who runs DNS for the domain right now
dig +short A noui.si                  # the IP addresses it points to
dig +short CNAME www.noui.si
dig +short NS noui.si @1.1.1.1        # ask a specific public resolver (Cloudflare's)
dig +short NS noui.si @8.8.8.8        # ...and Google's
whois noui.si | grep -i nameserver    # what the registry database says
curl -sI https://noui.si | head -5    # the "server:" header tells you who answered
```

`server: GitHub.com` means the old setup. `server: cloudflare` means the new one.

### Why a nameserver change takes time

Three caches stand between you and the world, and two of them can be slow:

1. **The registrar** passes your change to the registry. (Quick.)
2. **The registry** (for `.si`) updates its database (WHOIS shows it) and then **publishes its DNS zone on a schedule**. Verified: on 8 Oct 2026 WHOIS showed the Cloudflare nameservers while the live `.si` servers still listed the old ones. Its zone refresh interval is 3,600 seconds, so allow up to about an hour, sometimes longer.
3. **Resolvers** around the world remember the old answer until its TTL expires (the registry's NS answer had a TTL of 7,200 s).

While this happens the site keeps working through the old setup. Nothing is down.

### Rollback

Until the final steps of [10](#10-the-domain-move-step-by-step), setting the nameservers back to `atlas.dns-parking.com` and `hyperion.dns-parking.com` at the registrar restores the old setup. The old records still exist there.

---

## 5. Hosting on Cloudflare Pages

**Decision (8 Oct 2026):** we host on Cloudflare **Pages**, not Workers, and not GitHub Pages. Pages gives free static hosting, a CDN, free HTTPS, preview URLs per branch, custom response headers and optional server functions. It also builds from private GitHub repos, which GitHub Pages on the free plan cannot publish.

### The two projects

| | `noui-site` | `noui-orb-demo` |
|---|---|---|
| Built from | GitHub `upadhyayprakash/noui`, branch `main` | GitHub `upadhyayprakash/noui-orb`, branch `main` |
| Build command | `npm ci && npm run build` | `npm ci && npm run build:demo` |
| Output directory | `dist` | `demo-dist` |
| Environment variable | `NODE_VERSION` = `22` | `NODE_VERSION` = `22` |
| Config file in repo | none (dashboard settings) | `wrangler.jsonc` (name, output dir, compatibility date) |
| Default URL | `https://noui-site.pages.dev` | `https://noui-orb-demo.pages.dev` |
| Custom domain | `noui.si`, `www.noui.si` **(pending)** | none (reached through the site's proxy) |

**`NODE_VERSION`.** The site uses Vite 8, which needs Node 20.19+ or 22.12+. Set `NODE_VERSION=22` in the project's Settings, Environment variables. (We also keep `.node-version` containing `22` in noui-orb; we could not confirm from the docs that Pages reads it, the variable is the safe route.)

**`wrangler.jsonc`.** Per docs: once a Pages project has this file, the file is the source of truth for the fields it contains (project name, output directory, compatibility date), and the dashboard can no longer edit them. Keep them in the file.

### Production versus preview

- A push to **`main`** builds **production** (`<project>.pages.dev`, and the custom domain once attached).
- A push to **any other branch** builds a **preview** at `https://<branch>.<project>.pages.dev`. Verified example: `https://cloudflare-pages.noui-site.pages.dev`. Use it to test before merging. (We expect slashes in a branch name to become hyphens in the URL; check the build log for the exact address.)
- Each build and its logs are under the project's **Deployments** tab.

### Special files Pages reads from the output directory

| File | Purpose | Where we keep it |
|---|---|---|
| `_headers` | Add response headers per path pattern | site: `public/_headers`; orb: `pages/_headers` (copied into `demo-dist/` by `scripts/copy-pages-files.mjs`) |
| `_redirects` | Redirect rules, e.g. `/lab/orb /lab/orb/ 301` | site: `public/_redirects`; orb: `pages/_redirects` |
| `404.html` | The page for unknown URLs. **If there is no root `404.html`, Pages treats the project as a single-page app and answers every unknown URL with the home page and status 200.** | site: `404.html` (a real Vite page); orb: `pages/404.html` |
| `functions/` (repo root) | Server-side code for chosen paths | site: `functions/lab/orb/[[path]].js` |

Limits (per docs): `_redirects` 2,000 static and 100 dynamic rules; `_headers` 100 rules. `_headers` do not apply to responses produced by Functions.

### The proxy that puts the demo at `noui.si/lab/orb/`

A Pages project cannot be mounted on a sub-path of another project's domain, so the **site** project contains a Pages Function, `functions/lab/orb/[[path]].js`, that forwards any `GET` or `HEAD` request for `/lab/orb/...` to `https://noui-orb-demo.pages.dev` with the same path. Why this works without rewriting: the demo is built with Vite `base: "/lab/orb/"` and its files sit at `demo-dist/lab/orb/`, so the path is identical on both sides. The function uses `redirect: "manual"` so the demo's own redirect (`/lab/orb` to `/lab/orb/`) is handed back to the visitor, and it refuses other methods with 405. **Verified** on the preview build: HTML, JS and CSS pass through with their headers, 404s pass through, POST gives 405.

### Incident worth remembering: "disconnected from your Git account"

Symptom: pushes did not build, a branch preview showed "Deployment Not Found" and the live demo still served its very first build. The Cloudflare project showed an orange banner "This project is disconnected from your Git account". Cause: the Cloudflare GitHub app had lost access to the repo. Fix: on GitHub, Settings, Applications, "Cloudflare Workers and Pages", Configure, make sure the repo is in "Repository access"; in Cloudflare, reconnect if offered; then **push a new commit** (an empty one is fine: `git commit --allow-empty -m "Trigger build" && git push`). A push that happened while disconnected is never retried. Check also the **Deployments** tab and, on GitHub, the commit's check runs.

### Other Cloudflare settings we touched

- **AI crawler policy** (Search, Agent, Training) and **Bot Preference Sync** were chosen during zone onboarding. Bot Preference Sync prepends your choices to the `robots.txt` Cloudflare serves; your own `public/robots.txt` stays below them. These are polite requests, not protection.
- **The orange triangle "not covered by a certificate"** on DNS records is normal while the zone is Pending; the free certificate is issued once the zone is Active.
- Imported DNS records were set to **DNS only** (grey cloud) so nothing changes behaviour during the move.

---

## 6. The site repo (noui)

GitHub `upadhyayprakash/noui`. Read its own `CLAUDE.md` for the full set of project rules; this section is the operational summary.

**What it is.** A static landing site for an experiment about interfaces that assemble themselves around the visitor. It is deliberately honest that it is a scripted prototype: no model runs, and all prices, restaurants and pantry contents are invented. Keep copy honest.

**Stack.** Vite 8, React 19 (no router), Tailwind v4, plain JavaScript. Brand colours, type and spacing come only from the token roles in `brand/tokens/noui-tokens.css`; never raw hex values in components.

### Layout

| Path | What |
|---|---|
| `index.html`, `src/main.jsx`, `src/App.jsx`, `src/Experiment.jsx` | The main page and the experiment engine |
| `lab/index.html`, `src/Lab.jsx` | The older scenarios page at `/lab/` |
| `404.html`, `src/not-found.css` | The branded not-found page |
| `src/experiment/scenarios/*.jsx` | The scripted scenarios (kyoto, ride, food) |
| `src/components/` | `NouiMark`, the load `Splash`, etc. |
| `src/themes/`, `brand/tokens/` | Palettes and brand tokens |
| `public/` | Files copied as-is into the build: favicon, `og.png`, `robots.txt`, `sitemap.xml`, `_headers`, `_redirects`, and `CNAME` (only needed by GitHub Pages) |
| `functions/lab/orb/[[path]].js` | The demo proxy |
| `apps-script/` | The Google Apps Script that receives submissions (see below) |
| `.github/workflows/deploy.yml` | GitHub Pages deploy (to be removed after the move) |
| `video/`, `brand/`, `cover/` | Demo video recorders and brand assets, not part of the site build |

### Commands

```bash
npm run dev       # dev server at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve dist/ to check the real bundle
SITE_THEME=light npm run build   # system (default) | brand | light | legacy
```

### How the build is wired (vite.config.js)

- `base: './'` so the build works at `noui.si` and at `upadhyayprakash.github.io/noui/`. Use relative URLs between pages (`lab/`, not `/lab/`).
- **Every new HTML page must be added to `build.rollupOptions.input`**, otherwise it is silently not built.
- Three small plugins:
  - **visitPing** injects `src/visit-entry.js` into every page so no page forgets to count visits. It skips `404.html` on purpose, because that page is served for every unknown URL and would log a "visit" for every bot.
  - **siteTheme** stamps `data-theme` on `<html>` from the `SITE_THEME` environment variable (default `system`, which follows the visitor's OS).
  - **absoluteAssetsOn404** rewrites `./assets/...` to `/assets/...` in `404.html` only, because that page is served at any depth (`/a/b/c`) where relative URLs would break.

### Data capture, with no backend of its own

`src/capture.js` and `src/visit.js` post to one Google Apps Script web app whose URL is `SUBMIT_URL` in `src/config.js`; it appends rows to one Google Sheet (tabs `Submissions`, `Subscribers`, `Visits`). **This points at the real sheet even under `npm run dev`.** The experiment, the subscribe popup, the footer form and the visit ping all write real rows. The visit ping counts once per path per fresh tab after 10 s of visible time and skips Do Not Track, Global Privacy Control and automated browsers. Editing `apps-script/Code.gs` changes nothing until pasted into Apps Script and deployed as a **new version of the existing deployment** (a new deployment gets a new URL). Full details: `apps-script/README.md`.

### SEO and sharing

Titles, descriptions, canonical URLs and Open Graph tags are hand-written in each page's `<head>` and point at `https://noui.si`. A new page needs its own, plus a line in `public/sitemap.xml`.

---

## 7. The orb repo (noui-orb)

GitHub `upadhyayprakash/noui-orb`, public, MIT licence (the noui name and mark are not licensed for reuse). Read its `CLAUDE.md` and `docs/SPEC.md`.

**What it is.** `<noui-orb>`: a framework-free Web Component, no runtime dependencies, about 16 KB gzipped (budget 25 KB). It is the living form of the orange o in the noui logo: a voice surface and loading indicator. `docs/SPEC.md` is the contract (API, states, numbers, timings, acceptance criteria). `prototype/noui-orb-prototype.html` is the original reference, never edited.

### Layout

| Path | What |
|---|---|
| `src/element.ts` | The custom element: ties everything together |
| `src/renderer/` | WebGL renderer, the shader `orb.frag.glsl` (byte for byte from the prototype) |
| `src/signals/` | Audio analysis (`analyser.ts`) and smoothing (`envelope.ts`) |
| `src/character.ts`, `ring.ts`, `placement.ts`, `intro.ts`, `mark.ts`, `states.ts`, `config.ts`, `perf.ts` | Springs and gestures, progress ring, positions, logo intro, the logo mark, state table, defaults, frame-time guard |
| `src/*.test.ts` | Unit tests (Vitest) |
| `tests/e2e/` | Browser tests (Playwright): `behaviour.spec.ts`, `demo.spec.ts`, `acceptance.spec.ts` |
| `tests/support/` | Helpers (image comparison, a test tone) |
| `demo/` | The public demo page (`index.html`, `main.ts`, `snippets.ts`, `style.css`) and `demo/harness/`, a bare page the tests drive |
| `pages/` | Cloudflare Pages files for the demo (`_headers`, `_redirects`, `404.html`) |
| `scripts/` | `size.mjs` (size budget), `copy-pages-files.mjs` (post-build check and copy), `record-gif.mjs` (regenerates `docs/media/orb.gif`) |
| `vite.config.ts` | Library build (outputs `dist/`) |
| `vite.demo.config.ts` | Demo build (`base: "/lab/orb/"`, outputs `demo-dist/lab/orb/`) |
| `wrangler.jsonc` | Cloudflare Pages settings for the demo |
| `docs/` | `SPEC.md`, `PLAN.md`, `SITE-MIGRATION.md`, `DEPLOY-DEMO.md`, `RELEASING.md`, this file |

### Commands

```bash
npm run dev          # the demo with hot reload (http://localhost:5173/lab/orb/)
npm run typecheck    # TypeScript, strict
npm test             # unit tests (fast, no browser)
npm run test:e2e     # Playwright (starts the dev server itself); about 3 minutes locally
npm run build        # the package into dist/ (ESM + type declarations)
npm run size         # fail if dist/*.js is over 25 KB min+gzip
npm run build:demo   # the demo into demo-dist/, then checks it registers the element and copies pages/
```

### The three kinds of tests

1. **Unit tests** (`src/*.test.ts`): pure logic like springs, envelope, ring state, intro frames and the hand-off geometry. They run in Node, so they also prove the package imports on a server (`ssr.test.ts`).
2. **Behaviour e2e** (`tests/e2e/behaviour.spec.ts`): drives `demo/harness/` in Chromium. These run with `?nogl` (the CSS fallback, no WebGL) so they are fast and deterministic even on slow CI machines.
3. **Demo and acceptance e2e** (`demo.spec.ts`, `acceptance.spec.ts`): the real demo with real WebGL, plus the SPEC section 16 checks. The acceptance spec compares the component with the prototype side by side (mean colour, orb width, ring presence) at 60 fps and at a throttled 15 fps. That comparison is statistical, so those two tests are allowed up to 2 retries; a real regression fails every time.

**Rule for writing e2e tests here:** never "sleep then assert" on animation. CI runners render WebGL in software and run several times slower than a laptop, and the animation clock lags the wall clock. Poll for the condition with a generous timeout instead.

### Two things in the package setup that bite

- **`sideEffects` in `package.json`** lists `./dist/index.js` and `./src/index.ts`. `index.ts` registers the tag as a side effect of importing it. Without the flag, a bundler may delete a bare `import "@nouisi/orb"` as unused, and the element silently never registers. (This happened to the demo build; the fix and a build-time check are in `scripts/copy-pages-files.mjs`.)
- **Server-side safety.** `element.ts` and `index.ts` only touch `HTMLElement` and `customElements` when they exist, so importing the package in Node or Next.js does not crash.

### Package shape

Two entry points: `@nouisi/orb` (registers `<noui-orb>` on import) and `@nouisi/orb/element` (the class without registering). ESM only, type declarations included. `files` ships only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`.

---

## 8. CI/CD: how a change reaches users

There are four pipelines. Read their logs on GitHub: repo, **Actions** tab. Or from a terminal: `gh run list`, `gh run view <id> --log-failed`.

### A. orb repo: `ci` (GitHub Actions, `.github/workflows/ci.yml`)

- **Trigger:** every push (any branch **and any tag**) and every pull request.
- **Machine:** `ubuntu-latest`, Node 22.14.
- **Steps, in order:** `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run size`, `npm run build:demo`, install Chromium, `npm run test:e2e`.
- **Duration:** about 10 minutes (the two prototype-comparison tests dominate). A tag push triggers a second, redundant run on the same commit.
- **It does not deploy anything.** It only says whether the commit is healthy.

### B. orb demo: Cloudflare builds `noui-orb-demo`

- **Trigger:** a push to `main` of `noui-orb` (requires the Cloudflare GitHub connection to be healthy, see [5](#5-hosting-on-cloudflare-pages)).
- **What runs:** `npm ci && npm run build:demo`, then Cloudflare publishes `demo-dist/`. About a minute.
- **Independent of `ci`.** Cloudflare does not wait for the tests. A broken commit can reach the demo even if `ci` goes red, so look at both.

### C. site: Cloudflare builds `noui-site` (and GitHub Pages, for now)

- **Trigger:** a push to `main` of `noui` builds production; any other branch builds a preview.
- **Until the move is finished,** `.github/workflows/deploy.yml` also builds the site and deploys it to GitHub Pages, which is what noui.si serves today. Both deploy from the same push.
- **After the move,** delete `deploy.yml` and `public/CNAME`, and disable GitHub Pages (Settings, Pages).

### D. package release: `release` (GitHub Actions, `.github/workflows/release.yml`)

- **Trigger:** pushing a tag that starts with `v` (for example `v0.1.2`).
- **Permissions:** `id-token: write` (needed for OIDC trusted publishing) and read-only contents.
- **Steps:** Node 22, upgrade npm to the latest, **check the tag matches the version in `package.json`** (fails otherwise), `npm ci`, typecheck, tests, build, size, then **`npm stage publish`**.
- **Result:** the version is **staged** on npm, not public. The owner approves it (see [9](#9-releasing-the-npm-package)). About 30 seconds.
- **No token is stored anywhere.** npm trusts the workflow by its identity (owner, repo, workflow filename).

### What counts as "green"

Before telling anyone something shipped: `ci` green on that commit, the Cloudflare deployment shows success (Deployments tab), and you looked at the live URL. For a release: `npm view @nouisi/orb version` prints the new number.

---

## 9. Releasing the npm package

Full checklist: `docs/RELEASING.md`. The idea, with the reasons:

### How npm is set up (Verified on 0.1.0 and 0.1.1)

- **Publishes are staged.** Per docs, a trusted publisher is always allowed to run `npm stage publish`; plain `npm publish` has to be allowed separately. We deliberately did **not** allow it, so every release waits for a human with 2FA. The approval cannot be done with a CI token: `npm stage list/view/approve/reject` cannot use OIDC tokens.
- **Trusted publisher** is configured on npmjs.com (package, Settings, Trusted publishing, GitHub Actions) with: owner `upadhyayprakash`, repository `noui-orb`, workflow filename `release.yml`, environment empty. **Any mismatch fails at publish time**; npm does not validate it when you save it. A new configuration **expires if it has no successful publish within 2 days** and must be recreated. `package.json`'s `repository.url` must match the repo exactly.
- **Publishing access** is "Require two-factor authentication and disallow bypass 2fa tokens". Per docs this does not affect trusted publishers.
- **Provenance** is recorded automatically for a staged publish from GitHub Actions. Check with `npm audit signatures` in a project that installed it ("1 package has a verified attestation").
- **`0.0.0-stage`** is a placeholder npm creates when a first version is staged. It stays in the version list forever and is harmless; `latest` points at the real release.

### To release a new version

1. Update `CHANGELOG.md` and bump the version without tagging: `npm version <x.y.z> --no-git-tag-version`.
2. Commit, push to `main`, and wait for `ci` to be green.
3. Tag and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag must equal `v` plus the version in `package.json`.
4. Watch the `release` run. It should end with "staged with id ...". The run log prints the stage id.
5. Approve as the owner: either on npmjs.com, or in a terminal with Node 22.14+ and a recent npm (`npm i -g npm@latest`): `npm stage list @nouisi/orb`, `npm stage view <id>` (check version and file list), `npm stage approve <id>` and enter the one-time code.
6. Verify: `npm view @nouisi/orb version`, install it in a scratch folder, import it, and look for the provenance badge on the package page.

### If you published something bad

npm normally does not let you reuse a version number. Publish a new patch version and mark the bad one with `npm deprecate @nouisi/orb@x.y.z "reason"` (the reason shows to anyone installing it). Unpublishing is restricted by npm's own rules; do not count on it.

### Versioning habits

`0.x` while the API can still change; bump PATCH for fixes and docs; list every user-visible change in `CHANGELOG.md`; update `docs/SPEC.md` in the same commit as any API change.

---

## 10. The domain move, step by step

Goal: serve noui.si from Cloudflare Pages, put the demo at `noui.si/lab/orb/`, then make the `noui` repo private. **Order matters**: the repo goes private **last**, because GitHub Pages on the free plan stops publishing from a private repo and would take the site offline.

| # | Step | Who | Status (8 Oct 2026) |
|---|---|---|---|
| 1 | Add `noui.si` to Cloudflare (Free plan); it imports the five existing records | Owner | Done. Records set to DNS only. |
| 2 | Create the `noui-site` Pages project from the `noui` repo | Owner | Done. Works on `noui-site.pages.dev`. |
| 3 | Check the project on `pages.dev` (pages, splash, fonts, share image) | Owner | Done. |
| 4 | Push branch `cloudflare-pages`; test the demo proxy on the preview URL | Claude + Owner | Done. Fixed the Git connection incident on the way. |
| 5 | Merge `cloudflare-pages` into `main` (proxy, headers, redirects, 404 page) | Claude | Done. |
| 6a | At the registrar, replace the nameservers with Cloudflare's two | Owner | Done on 8 Oct. WHOIS shows them. |
| 6b | Wait for the `.si` zone to publish the change; Cloudflare shows the zone **Active** | Wait | **Waiting.** |
| 6c | In Cloudflare DNS delete the four old `A` records and the `www` CNAME, then in the Pages project, Custom domains, add `noui.si` and `www.noui.si` (do these two back to back; in between the domain does not resolve) | Owner | Pending |
| 7 | Check `https://noui.si` (header `server: cloudflare`), then `/lab/orb/` including the microphone | Claude + Owner | Pending |
| 8 | Optional: redirect `www` to the apex with a Cloudflare Redirect Rule (pages already declare `noui.si` as canonical) | Owner | Pending |
| 9 | Remove `.github/workflows/deploy.yml` and `public/CNAME` from the site repo; disable GitHub Pages (Settings, Pages) | Claude + Owner | Pending |
| 10 | Make the `noui` repo private (Settings, Danger zone). The Cloudflare GitHub app keeps its access | Owner | Pending |
| 11 | Update `homepage`/links to the final `noui.si/lab/orb/` URL and re-check everything | Claude | Pending |

**Rollback (until step 9):** set the nameservers back to the OpusDNS ones at the registrar. It restores the old setup within the record TTL.

**After step 10, verify:** a push to `noui` `main` still builds on Cloudflare; the `noui-orb` repo is still public and unaffected.

---

## 11. Debugging playbook

Rule of thumb: **work from the visitor inwards.** Is the name resolving? Who answered? Is the latest deploy healthy? What does the build log say? Change one thing at a time.

### "The site is down or wrong" (noui.si)

1. **Does the name resolve?** `dig +short A noui.si`. Nothing back during the move can mean the old records were deleted before the custom domain was attached (step 6c). Attach the domain, or restore the records.
2. **Who answers?** `curl -sI https://noui.si | head`. `server: GitHub.com` or `server: cloudflare`? A wrong answer means DNS still points elsewhere.
3. **Is the nameserver change in effect?** `dig +short NS noui.si @1.1.1.1` and `whois noui.si | grep -i nameserver`. Compare with [4](#4-the-domain-and-dns).
4. **Is the latest deploy healthy?** Cloudflare, Workers & Pages, `noui-site`, Deployments. Failed build? Read the log.
5. **Roll back.** On Cloudflare Pages you can roll production back to a previous successful deployment from the Deployments tab (check the current UI; we have not needed it yet). Or revert the bad commit on `main` and push.
6. **Last resort during the move:** switch the nameservers back (see Rollback in [10](#10-the-domain-move-step-by-step)).

### Symptom tables

Incidents marked **seen** actually happened in this project.

**Hosting and DNS**

| Symptom | Likely cause | How to check | Fix |
|---|---|---|---|
| Pushing does not build; branch preview says "Deployment Not Found"; live demo is stale (**seen**) | Cloudflare lost its GitHub connection | Orange "disconnected from your Git account" banner on the Pages project; no Cloudflare check on the commit | See the incident in [5](#5-hosting-on-cloudflare-pages); then push a new commit |
| Build fails with a Node or syntax error | Pages is using an older Node | Build log shows the Node version | Set `NODE_VERSION=22` in Settings, Environment variables |
| Unknown URL shows the home page with status 200 (**seen**) | No root `404.html`, so Pages treats it as a single-page app | `curl -s -o /dev/null -w '%{http_code}' https://noui.si/zzz` | Keep `404.html` as a Vite page (site) or in `pages/` (demo) |
| `noui.si/lab/orb/` gives 404 or old content | The demo project is stale or the proxy function is missing | Open `noui-orb-demo.pages.dev/lab/orb/`; compare | Fix the demo deploy first; check `functions/lab/orb/[[path]].js` exists on `main` |
| Nameserver change "not working" for an hour (**seen**) | The `.si` registry has not yet published its zone | `whois` shows the new NS but `dig NS noui.si @1.1.1.1` shows the old | Wait; do not change it again |
| Orange triangle "not covered by a certificate" | Zone still Pending | Zone status in Cloudflare | Ignore until Active |
| Microphone blocked on the live demo | Not HTTPS, a missing permission header, or the page is in an iframe | `curl -sI` the page and look for `Permissions-Policy: microphone=(self)` | Serve over HTTPS; keep `_headers`; the user must allow the site |

**Build and tests**

| Symptom | Likely cause | How to check | Fix |
|---|---|---|---|
| Demo loads but `<noui-orb>` is an empty box and nothing is registered (**seen**) | Tree-shaking removed the registering import | `npm run build:demo` fails its bundle check | Keep `sideEffects` listing the registering entries (see [7](#7-the-orb-repo-noui-orb)) |
| `HTMLElement is not defined` when importing the package on a server (**seen**) | A browser global is used at import time | `node -e "import('./dist/index.js')"` | Guard with `typeof HTMLElement !== "undefined"` as `element.ts` does; `ssr.test.ts` guards this |
| e2e tests pass locally, fail on CI with timing errors (**seen**) | CI is slow (software WebGL); a test sleeps then asserts | Compare durations in the log | Poll for the condition; run logic tests with `?nogl` |
| `all six states match the prototype` fails once, passes on rerun (**seen**) | Statistical test on a moving noise field | Read the printed numbers in the failure | It already retries twice. If it fails 3 times, a real difference exists: compare the screenshots |
| CI runs twice on a release | `ci` also triggers on tags | Actions tab | Harmless. Could be limited to branches |
| Random-URL bots create "visits" in the Google Sheet | The visit ping is on the 404 page | Check `dist/404.html` for `visit-entry` | It must stay excluded (see [6](#6-the-site-repo-noui)) |
| New page missing from the build | Not added to `rollupOptions.input` | `ls dist` | Add it to `vite.config.js` |

**npm and releases**

| Symptom | Likely cause | How to check | Fix |
|---|---|---|---|
| `release` workflow fails at "tag must match" | Tag and `package.json` version differ | Run log | Bump the version, delete and recreate the tag (ask first; tags are shared) |
| `release` fails at publish with a trusted-publisher or 404/403 error | Owner/repo/workflow filename mismatch, the setup expired (2 days), or `repository.url` differs | Compare npmjs.com trusted-publisher settings with the workflow | Delete and recreate the trusted publisher; the first publish must happen within 2 days |
| `npm i @nouisi/orb` gives an empty package (**seen**) | You installed the `0.0.0-stage` placeholder; your version is still staged | `npm view @nouisi/orb versions dist-tags` | Approve the staged version |
| `Unknown command: "stage"` (**seen**) | npm or Node too old | `npm -v`, `node -v` | Node 22.14+, `npm i -g npm@latest`; or approve on npmjs.com |
| npm page shows an out-of-date README | The README is frozen into each published version | Compare with the repo | Publish a new patch version |
| No provenance on a version | Published by hand, not by the workflow | `npm audit signatures` | Release through the tag workflow |

---

## 12. Change cookbook

**Change text or styling on the site.** Edit in the `noui` repo (keep copy honest: scripted prototype, invented data). `npm run dev` to look. Push a branch, check its Cloudflare preview URL, merge to `main`. Use tokens only, never raw colours.

**Add a page to the site.** Create `yourpage/index.html`; add it to `build.rollupOptions.input` in `vite.config.js`; give it its own `<head>` (title, description, canonical, Open Graph); add the URL to `public/sitemap.xml`; use relative links. The visit ping is added automatically.

**Add a header or a redirect.** Site: edit `public/_headers` or `public/_redirects`. Demo: `pages/_headers` or `pages/_redirects` in noui-orb. Push, then verify with `curl -sI <url>`. Headers do not apply to responses produced by Functions.

**Release a new orb version.** See [9](#9-releasing-the-npm-package).

**Fix a bug in the orb.** Branch, fix, add or adjust a test, `npm run typecheck && npm test && npm run test:e2e`, update `docs/SPEC.md` if behaviour changed, update `CHANGELOG.md`, open a PR (`ci` runs), merge. The demo redeploys on merge. Release only if package users need the fix.

**Serve another project under noui.si.** Same pattern as the demo: a separate Pages project built with Vite `base: "/lab/<name>/"` and output under `<name>/` so its paths match; a function `functions/lab/<name>/[[path]].js` in the site repo copied from the orb one with the new origin; test on a preview first.

**Change a DNS record.** Cloudflare dashboard, the zone `noui.si`, DNS, Records. Mind the TTL. Verify with `dig`. Before deleting a record, write down its value so you can put it back.

**Add a teammate.** GitHub: add as collaborator on the repo. npm: invite to the `nouisi` organisation with the least role that works. Cloudflare: the account's Members settings. Hostinger: do not share the login; the registrar rarely needs more than one person. Require 2FA for everyone.

**Respond to a leaked or suspicious credential.** Revoke it first, investigate later. npm: the access setting already disallows bypass tokens, so check the organisation's members and tokens. GitHub: remove the person or token, check Actions and the repo audit log. Cloudflare: remove the member, check the audit log. If the npm package might have been tampered with, publish a clean patch version and deprecate the bad one.

---

## 13. Safety rules and gotchas

1. **Never test against the live Google Sheet.** `src/config.js` points at the real sheet even locally. Do not run write-capable tests or submit forms against a deployed preview. Use request interception or a fake sheet and delete any test rows.
2. **Never publish, tag or change npm settings casually.** Tags start the release workflow. A published npm version cannot be reused. Staged publishing exists so a human always approves.
3. **No secrets in repos.** No tokens, no `.env`, no `.npmrc` with auth. Releases use OIDC.
4. **Keep the repos separate.** `noui-orb` is public; the site repo is (soon) private. Never copy site code into noui-orb. Brand artwork the orb needs (the approved logo paths) is the only exception, and only when the owner says so.
5. **The nested folder.** On the owner's machine the `noui-orb` repo lives inside the `noui` folder. The site repo's `.gitignore` lists `noui-orb/` so it can never be committed there. Each has its own `.git`.
6. **`position: sticky` stops working inside `overflow: hidden`** (site gotcha); the page root uses `overflow-x-clip`.
7. **The shader is byte for byte the prototype's.** Do not "tidy" `orb.frag.glsl`; the frame-time guard works by rewriting one loop bound at runtime.
8. **Writing style rule from the owner:** no em dashes anywhere (docs, code, copy, commit messages); use a period, comma, colon or a plain hyphen.
9. **Do not reuse a trusted-publisher setup after it expires**, and do not enable plain `npm publish` for the trusted publisher without a good reason: it removes the human approval.

---

## 14. Command cheat sheet

```bash
# --- Is it up? (read-only, safe anytime)
curl -sI https://noui.si | head -5
curl -sI https://noui-orb-demo.pages.dev/lab/orb/ | head -8
curl -s -o /dev/null -w '%{http_code}\n' https://noui.si/does-not-exist     # expect 404

# --- DNS
dig +short NS noui.si
dig +short A noui.si
dig +short NS noui.si @1.1.1.1
whois noui.si | grep -i nameserver

# --- GitHub Actions
gh run list --limit 5
gh run view <run-id> --log-failed          # only the failing steps
gh run watch <run-id> --exit-status        # follow a run live

# --- npm (read-only)
npm view @nouisi/orb versions dist-tags --json
npm view @nouisi/orb version
npm pack --dry-run                          # what would be published
npm audit signatures                        # in a project that installed it: provenance check

# --- npm staged release (owner, Node 22.14+, recent npm)
npm stage list @nouisi/orb
npm stage view <stage-id>
npm stage approve <stage-id>

# --- Local development
npm ci
npm run dev
npm run typecheck && npm test && npm run build && npm run size
npm run build:demo
npm run test:e2e

# --- Trigger a Cloudflare build without changing code
git commit --allow-empty -m "Trigger build" && git push
```

---

## 15. Known gaps and open items

Honest list as of 8 Oct 2026.

- **Domain move not finished.** See [10](#10-the-domain-move-step-by-step). Update sections 1, 4, 5, 6, 10 and 11 when it is done.
- **The site repo is still public** and GitHub Pages still serves noui.si, with HTTPS enforcement off. Both change at the end of the move.
- **The demo proxy is tested on a preview, not on the final domain yet.** Re-test `noui.si/lab/orb/`, including the microphone, after the cutover.
- **Microphone latency (SPEC 16):** the "reacts within 50 ms" target is not measured, and iOS is not confirmed. Chrome and Safari were confirmed by the owner on the deployed demo.
- **Approved logo artwork** is not in the orb yet. The hand-off alignment (within 1 px at 640 px) is verified with the placeholder mark only. Milestone M6 adopts the orb in noui.si and brings the real artwork.
- **CI is slow (about 10 min)** and runs twice on a tag push. Possible fix: skip `ci` on tags and run the two comparison tests only on `main`.
- **GitHub Actions warns** that Node 20 based actions (`checkout@v4`, `setup-node@v4`) are deprecated; they currently run on Node 24 anyway. Bump the action versions when convenient.
- **Firefox is untested** for the component.
- **Rollback in Cloudflare Pages** has not been exercised; the Deployments tab is where it should be.
- **No monitoring or uptime alerts** exist for noui.si or the demo. A free uptime checker would be a cheap addition.

---

## 16. Where to read more

**In the orb repo**

- `README.md`: install, API tables, events, microphone, framework notes.
- `docs/SPEC.md`: the contract: API, states, numbers, acceptance criteria and their status (section 16).
- `docs/PLAN.md`: the milestones M0 to M6 and what is done.
- `docs/RELEASING.md`: the release checklist.
- `docs/DEPLOY-DEMO.md`: deploying the demo and the proxy.
- `docs/SITE-MIGRATION.md`: the move to Cloudflare, with the inventory taken before it.
- `CHANGELOG.md`: what changed in each version and the deliberate differences from the prototype.
- `CLAUDE.md`: working rules for AI assistants and contributors.

**In the site repo**

- `CLAUDE.md`: architecture, brand rules, gotchas.
- `apps-script/README.md`: the data collector, the sheet and how to redeploy it.

**Official documentation we relied on (read on 8 Oct 2026)**

- Cloudflare Pages: [serving pages and 404 behaviour](https://developers.cloudflare.com/pages/configuration/serving-pages/), [`_headers`](https://developers.cloudflare.com/pages/configuration/headers/), [`_redirects`](https://developers.cloudflare.com/pages/configuration/redirects/), [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [Wrangler configuration for Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).
- npm: [trusted publishers](https://docs.npmjs.com/trusted-publishers), [`npm stage`](https://docs.npmjs.com/cli/v12/commands/npm-stage/), [requiring 2FA and publishing access](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification).

Documentation changes quickly. If something here disagrees with what you see in a dashboard, trust the dashboard, then fix this file.
