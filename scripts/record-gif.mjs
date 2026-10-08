// Regenerates docs/media/orb.gif: records the test harness in headless Chromium and converts it with ffmpeg.
// Needs ffmpeg on the PATH and the demo dev server running (npm run dev). Usage: node scripts/record-gif.mjs
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.URL ?? "http://localhost:5173/lab/orb/harness/?intro=manual&sim=1";
const SIZE = 480;
const dir = mkdtempSync(join(tmpdir(), "orb-gif-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
  colorScheme: "light",
  recordVideo: { dir, size: { width: SIZE, height: SIZE } },
});
const page = await context.newPage();
await page.goto(URL);
await page.waitForFunction(() => !!window.orb?.shadowRoot);
await page.addStyleTag({ content: "body{margin:0;background:#e9e7e4}main{padding:0;max-width:none;gap:0}noui-orb{width:100vw;border-radius:0;background:none}.row,pre{display:none}" });
await sleep(600);

await page.evaluate(() => window.orb.intro());           // the logo becomes the orb
await page.evaluate(() => (window.orb.state = "listening")); await sleep(2600);
await page.evaluate(() => (window.orb.state = "thinking")); await sleep(1900);
await page.evaluate(() => { window.orb.state = "working"; window.orb.progress = { steps: 3, done: 0, current: 0 }; });
for (let done = 0; done < 3; done++) {
  for (let i = 0; i <= 10; i++) {
    await page.evaluate((p) => (window.orb.progress = { steps: 3, done: p.done, current: p.cur }), { done, cur: i / 10 });
    await sleep(110);
  }
}
await page.evaluate(() => (window.orb.progress = { steps: 3, done: 3 })); await sleep(1500);
await page.evaluate(() => (window.orb.state = "speaking")); await sleep(2600);
await page.evaluate(() => (window.orb.state = "idle")); await sleep(900);

await context.close();
await browser.close();
const webm = readdirSync(dir).find((f) => f.endsWith(".webm"));
const src = join(dir, webm);
const out = "docs/media/orb.gif";
// Skip the page-load lead-in, then build a palette-optimised GIF. The orb has film grain, which GIF
// compresses badly, so keep it small: 300 px, 10 fps, 48 colours, no dithering.
execFileSync("ffmpeg", ["-y", "-ss", "0.9", "-i", src, "-vf", "fps=10,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none", "-loop", "0", out], { stdio: "inherit" });
rmSync(dir, { recursive: true, force: true });
console.log("wrote", out);
