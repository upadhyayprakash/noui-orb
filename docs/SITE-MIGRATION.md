# Moving noui.si to Cloudflare and making the `noui` repo private

Run this in the **`noui` website repo**, not in `noui-orb`. Copy this file there and ask Claude Code to work through it. Stop for the owner's go-ahead before every step marked **Owner** or **go-ahead**.

## Why

- On GitHub Free, GitHub Pages only publishes from public repos. Making `noui` private would take noui.si offline. (GitHub Pro allows Pages from a private repo, but still can't set response headers or route sub-paths to other projects.)
- Cloudflare serves static sites from private repos for free, gives preview URLs per branch, and can combine several projects under one domain (with a proxying Pages Function), which is how `noui.si/lab/orb/` will be served from the public `noui-orb` repo.
- Cloudflare can set response headers (`_headers` or Worker code). On-device speech models running multi-threaded WebAssembly need the page to be cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` or `credentialless`). GitHub Pages can't send those headers.

## Order matters

Do these in order. Making the repo private before the new hosting is live takes the site down.

1. **Audit before going private.** The repo has been public, so its history may already be cloned or forked. Scan the full history for secrets (for example with `gitleaks detect` or `trufflehog git file://.`). Rotate anything found; making the repo private doesn't un-publish it. Public forks stay public after the switch.
2. **Inventory the current setup.** Record: how the site is built (static files, a framework, a build command), the Pages source branch or workflow, the `CNAME` file, current DNS records for `noui.si` (`dig noui.si A AAAA CNAME NS`), the registrar, and any email records (MX, SPF, DKIM, DMARC). Email records must survive the move.
3. **Owner:** add `noui.si` to Cloudflare (free plan). Cloudflare imports existing DNS records; compare them against step 2, especially email. At the registrar, switch nameservers to the two Cloudflare gives you. Wait until the zone shows Active.
4. **Create the site Pages project**, built from this repo:
   - Decided 8 Oct 2026: use Cloudflare **Pages**, not Workers. Check the current Cloudflare docs for Pages Git integration with private GitHub repos.
   - Set the build command and output directory (`dist`) in the Pages project (or `wrangler.jsonc` with `pages_build_output_dir`). Keep `/lab/orb/*` unused in this repo.
   - **Owner:** connect the private `noui` repo in the Cloudflare dashboard (Workers & Pages → Create → Pages → Connect to Git).
   - Verify on the `*.pages.dev` preview URL: every page, the A5 loading animation, fonts, OG image, favicon.
5. **go-ahead:** attach the custom domain `noui.si` (and `www.noui.si` with a redirect to the apex) to the site Pages project. Confirm HTTPS works and the site matches the GitHub Pages version.
6. **go-ahead:** in the GitHub repo, unpublish GitHub Pages (Settings → Pages) and remove the `CNAME` file and any Pages workflow.
7. **Owner:** make the `noui` repo private (Settings → General → Danger zone → Change visibility).
8. **Headers.** Add `_headers` (or a Pages Function if logic is needed) for long-cache static assets and security basics (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`). Add the cross-origin isolation headers only on routes that run on-device models, and test that nothing they embed breaks.
9. **Demo route.** Pages projects can't be attached to a sub-path of another project's domain, so once the `noui-orb` demo Pages project exists either add a Pages Function in this repo that proxies `/lab/orb/*` to the demo's `*.pages.dev` URL, The decision is the proxy (option a); the function to start from and what to check are in `noui-orb/docs/DEPLOY-DEMO.md`. Add a link to `/lab/orb/` from the site where it fits.

## Checks when done

- [ ] `https://noui.si` and `https://www.noui.si` load over HTTPS from Cloudflare.
- [ ] Email to `@noui.si` addresses still arrives (if used).
- [ ] The `noui` repo is private; a logged-out browser gets a 404 on its GitHub URL.
- [ ] `https://noui.si/lab/orb/` serves the demo; every other path serves the site.
- [ ] Pushing to `main` in `noui` redeploys the site; a branch push gives a preview URL.

---

## Inventory taken 8 Oct 2026 (read-only checks)

- **Registrar and DNS:** OpusDNS. Nameservers `atlas.dns-parking.com` and `hyperion.dns-parking.com` (OpusDNS default DNS, run by Hostinger). Domain expires 2027-10-02.
- **Records:** four `A` records to GitHub Pages (185.199.108.153, .109.153, .110.153, .111.153), `www` CNAME to `upadhyayprakash.github.io`. TTL about 30 minutes. **No MX, TXT, CAA, AAAA or DMARC** on the authoritative servers, so there is no email on this domain to preserve (re-check at the registrar if you use email forwarding there).
- **DNSSEC:** none (no DS record), so changing nameservers is safe on that front.
- **GitHub Pages:** deploys with `.github/workflows/deploy.yml` (Node 20, `npm run build`, `dist`), custom domain `noui.si`, HTTPS enforcement currently off. No `SITE_THEME` repository variable, so the build uses the default `system`.
- **Site:** Vite 8, React 19, no router. Needs Node 20.19 or 22.12+, so set `NODE_VERSION=22` on Pages.
- **Repo `upadhyayprakash/noui`:** public today.

## Runbook for noui.si

Order matters. The repo goes private **last**; private-first would take the site offline.

Prepared in the site repo on branch `cloudflare-pages` (not pushed): `functions/lab/orb/[[path]].js` (proxy to `noui-orb-demo.pages.dev`), `public/_redirects`, `public/_headers`, and a `.gitignore` entry for the nested `noui-orb/` folder. `deploy.yml` and `public/CNAME` stay until after the cutover.

1. **Cloudflare: add the zone.** Dashboard → Add a domain → `noui.si` → Free plan. Let it import the existing records; there is nothing else to copy. Do not change nameservers yet. The zone shows "Pending" and gives two nameservers.
2. **Cloudflare: create the site's Pages project.** Workers & Pages → Create → Pages → Connect to Git → `upadhyayprakash/noui`. Production branch `main`. Build command `npm ci && npm run build`, output directory `dist`, framework preset None, environment variable `NODE_VERSION` = `22`. Name it e.g. `noui-site`.
3. **Check it on `https://noui-site.pages.dev`** (with `main` as it is today). Every page, the load splash, fonts, the share image and favicon. Do not submit the forms, and avoid staying long: the experiment, popup, footer form and the visit ping write real rows to the Google Sheet.
4. **Test the demo proxy on a preview.** Push the `cloudflare-pages` branch. Cloudflare builds a preview URL for it. On that URL check `/lab/orb/`, `/lab/orb/assets/...`, `/lab/orb` (no slash), and that the microphone still works through the proxy. Fix the function here if anything is off.
5. **Merge `cloudflare-pages` into `main`** once step 4 passes. GitHub Pages keeps serving noui.si and Cloudflare builds production on `*.pages.dev`.
6. **Go-ahead needed: the cutover.** At OpusDNS, change the nameservers to the two Cloudflare gave you. Wait until the zone shows Active. Then in the Pages project: Custom domains → add `noui.si`, and `www.noui.si` (redirect `www` to the apex). Cloudflare replaces the old GitHub `A` and `www` records. Check `https://noui.si` over HTTPS: the response header `server` should say `cloudflare`.
7. **Check the live site and `https://noui.si/lab/orb/`**, then the microphone on the final URL.
8. **Unpublish GitHub Pages:** repo Settings → Pages. Delete `.github/workflows/deploy.yml` and `public/CNAME` in a commit.
9. **Make the repo private** (Settings → Danger zone → Change visibility). The Pages project keeps building because the Cloudflare GitHub app has access. Check that a push to `main` still deploys.
10. **Rollback:** until step 8, pointing the nameservers back at the OpusDNS ones restores the old setup within the record TTL.
