// Regenerates demo/public/og.png (1200x630), the share image for link previews (LinkedIn, WhatsApp, X).
// It renders the real orb in headless Chromium next to the title. Needs the demo dev server running
// (npm run dev) and network access for Google Fonts. Usage: node scripts/make-og-image.mjs
import { chromium } from "@playwright/test";

const URL = process.env.URL ?? "http://localhost:5173/lab/orb/harness/?intro=none&sim=1";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(URL);
await page.waitForFunction(() => !!window.orb?.shadowRoot);
await page.evaluate(() => { window.orb.state = "listening"; });
await page.addStyleTag({ url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@500&family=Noto+Sans:wght@600&display=swap" });
await page.addStyleTag({
  content: `
    html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0A1115}
    main{padding:0;max-width:none;display:block}
    .row,pre{display:none}
    noui-orb{position:absolute;right:70px;top:75px;width:480px;margin:0;background:none;border-radius:0}
    .card{position:absolute;left:84px;top:0;height:630px;width:560px;display:flex;flex-direction:column;justify-content:center;gap:22px;color:#F2EFEB}
    .card .eyebrow{font:500 22px/1 'JetBrains Mono',monospace;letter-spacing:.09em;color:#FF9B5E;text-transform:uppercase}
    .card h1{margin:0;font:600 92px/1 'Noto Sans',sans-serif;letter-spacing:-.02em}
    .card p{margin:0;font:400 31px/1.4 'Inter',sans-serif;color:#C9C3BC}
    .card code{font:500 26px/1 'JetBrains Mono',monospace;color:#F2EFEB;background:#1E2A30;padding:12px 18px;border-radius:10px;align-self:flex-start}
  `,
});
await page.evaluate(() => {
  const d = document.createElement("div");
  d.className = "card";
  d.innerHTML = `<div class="eyebrow">Web Component</div><h1>noui-orb</h1><p>The living orange o: a voice surface and loading indicator for your app.</p><code>npm i @nouisi/orb</code>`;
  document.body.appendChild(d);
});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(3500); // let the orb settle into a lively frame
await page.screenshot({ path: "demo/public/og.png" });
await browser.close();
console.log("wrote demo/public/og.png");
