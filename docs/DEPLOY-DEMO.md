# Deploying the demo to Cloudflare Pages

The demo is a static site built by `npm run build:demo` into `demo-dist/` (the page itself is at `demo-dist/lab/orb/`, with `_redirects`, `_headers` and `404.html` at the root). Nothing in this repo deploys it: Claude does not run `wrangler pages deploy` and no token lives here (see `CLAUDE.md`, release safety).

Checked against the Cloudflare docs on 8 Oct 2026: `wrangler.jsonc` for Pages needs `name`, `pages_build_output_dir` and `compatibility_date`; `_redirects` and `_headers` go at the root of the output directory; without a root `404.html`, Pages treats the project as a single-page app and sends every unknown path to `/`, which is why this repo ships one.

## Owner steps (Cloudflare dashboard)

1. **Workers & Pages → Create → Pages → Connect to Git.** Choose `upadhyayprakash/noui-orb`. Production branch: `main`.
2. **Build settings.**
   - Build command: `npm ci && npm run build:demo`
   - Build output directory: `demo-dist`
   - Because `wrangler.jsonc` exists, Pages reads its name, output directory and compatibility date from the file and the dashboard can't edit those fields.
3. **Node version.** The repo has `.node-version` set to `22`. I could not confirm from the docs pages I fetched that Pages reads this file, so if the first build fails on the Node version, add an environment variable `NODE_VERSION` = `22` under Settings → Environment variables.
4. **Preview.** The first build gives `https://noui-orb-demo.pages.dev/lab/orb/` (the project name comes from `wrangler.jsonc`). Open it over HTTPS.
5. **Check on that URL, in Chrome and Safari (macOS and iOS):**
   - the intro plays, then the controls enable
   - **Microphone**: the browser asks for permission, the orb reacts to your voice within a moment of speaking, and unplugging or blocking the input shows the warning
   - **Audio file** drives Listening and Speaking
   - `https://noui-orb-demo.pages.dev/lab/orb` (no slash) redirects to the slash version, and `https://noui-orb-demo.pages.dev/nothing` shows the "Nothing here" page
   - the response headers include `Permissions-Policy: microphone=(self)` (without it, a page embedding the demo in an iframe could not use the microphone)

## Serving it at `noui.si/lab/orb/` (decided option a)

A Pages project can't be mounted at a sub-path of another project's domain, so the **site's** Pages project proxies the path to this one with a Pages Function. In the private `noui` repo, once noui.si is on Cloudflare (`SITE-MIGRATION.md`):

```js
// functions/lab/orb/[[path]].js
export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, "https://noui-orb-demo.pages.dev");
  return fetch(new Request(target, request));
}
```

The demo is built with Vite `base: "/lab/orb/"` and its files sit at `/lab/orb/...`, so the path is identical on both sides and no rewriting is needed. This function is a starting point and **has not been run**: check on the site's preview URL that `/lab/orb/`, `/lab/orb/assets/...` and `/lab/orb` all work, that the headers above come through, and that the microphone still works.
