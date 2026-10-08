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
9. **Demo route.** Pages projects can't be attached to a sub-path of another project's domain, so once the `noui-orb` demo Pages project exists either add a Pages Function in this repo that proxies `/lab/orb/*` to the demo's `*.pages.dev` URL, or give the demo its own subdomain (decision pending in `noui-orb/docs/PLAN.md` M0). Add a link to `/lab/orb/` from the site where it fits.

## Checks when done

- [ ] `https://noui.si` and `https://www.noui.si` load over HTTPS from Cloudflare.
- [ ] Email to `@noui.si` addresses still arrives (if used).
- [ ] The `noui` repo is private; a logged-out browser gets a 404 on its GitHub URL.
- [ ] `https://noui.si/lab/orb/` serves the demo; every other path serves the site.
- [ ] Pushing to `main` in `noui` redeploys the site; a branch push gives a preview URL.
