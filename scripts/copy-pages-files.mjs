// Post-build for the demo: checks the bundle, then copies the Cloudflare Pages files
// (_redirects, _headers, 404.html) next to it. They have to sit at the root of the Pages
// output directory, above lab/orb/.
import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";

const assets = "demo-dist/lab/orb/assets";
if (!existsSync("demo-dist/lab/orb/index.html") || !existsSync(assets)) {
  console.error("demo-dist/lab/orb is missing: run the demo build first.");
  process.exit(1);
}

// A bare `import "../src/index"` is silently dropped by tree-shaking if the package does not mark it
// as having side effects, which would ship a demo that never registers <noui-orb>.
const js = readdirSync(assets).filter((f) => f.endsWith(".js")).map((f) => readFileSync(`${assets}/${f}`, "utf8")).join("\n");
if (!/customElements\.define\(\s*["'`]noui-orb["'`]/.test(js)) {
  console.error('The demo bundle does not register <noui-orb> (no customElements.define("noui-orb") found).');
  process.exit(1);
}

// Link previews need the share image and its tags. Fail the build if either goes missing.
const html = readFileSync("demo-dist/lab/orb/index.html", "utf8");
const image = /<meta property="og:image" content="https:\/\/noui\.si(\/lab\/orb\/[^"]+)"/.exec(html);
if (!image || !existsSync(`demo-dist${image[1]}`) || !/<meta property="og:title"/.test(html) || !/<meta name="twitter:card"/.test(html)) {
  console.error("The demo page is missing its Open Graph tags or the og:image file (demo/public/og.png).");
  process.exit(1);
}

cpSync("pages", "demo-dist", { recursive: true });
console.log("demo bundle registers <noui-orb>; copied pages/ into demo-dist/");
