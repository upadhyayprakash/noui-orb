// Regenerates demo/public/og.png (1200x630), the share image for link previews (LinkedIn, WhatsApp, X).
// It renders the real orb in headless Chromium next to the title. Needs the demo dev server running
// (npm run dev) and network access for Google Fonts. Usage: node scripts/make-og-image.mjs
import { chromium } from "@playwright/test";

const STYLE = process.env.STYLE ?? "orb";
const OUT = process.env.OUT ?? "demo/public/og.png";
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
    /* Speech elements around the orb: radiating sound, a voice level, and the states it shows. */
    .ring{position:absolute;border-radius:50%;box-sizing:border-box;border:2px solid rgba(255,255,255,.16)}
    .glow{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(255,138,69,.34),rgba(255,138,69,.1) 55%,rgba(255,138,69,0) 100%)}
    .bars{position:absolute;display:flex;align-items:center;gap:7px;height:50px}
    .bars i{display:block;width:7px;border-radius:4px;background:rgba(255,255,255,.34)}
    .bars i.hot{background:#FF8A45}
    .chips{position:absolute;display:flex;gap:14px}
    .chip{display:flex;align-items:center;gap:10px;font:500 22px/1 'Inter',sans-serif;color:#9E9892;padding:12px 20px;border-radius:999px;border:1.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04)}
    .chip.on{color:#FFC9A3;border-color:rgba(255,138,69,.6);background:rgba(255,138,69,.12)}
    .chip svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  `,
});
await page.evaluate(() => {
  const d = document.createElement("div");
  d.className = "card";
  d.innerHTML = `<div class="eyebrow">Web Component</div><h1>noui-orb</h1><p>The living orange o: a voice surface and loading indicator for your app.</p><code>npm i @nouisi/orb</code>`;
  document.body.appendChild(d);
});
if (STYLE === "voice" || STYLE === "voice-left") {
  const left = STYLE === "voice-left";
  // Orb size and centre. In "voice-left" the level strip and the chips move under the text, which frees the
  // right side for a larger orb and wider rings.
  const orbW = left ? 340 : 280;
  const cx = left ? 905 : 900;
  const cy = left ? 315 : 245;
  const rings = left ? [430, 510, 590] : [360, 420, 480];
  const glow = left ? 640 : 520;
  // Under the orb, the strip and the chips are centred on the orb's own centre line (translateX(-50%)).
  const barsAt = left ? { x: 84, y: 462 } : { x: cx, y: 505 };
  const chipsAt = left ? { x: 84, y: 532 } : { x: cx, y: 566 };
  await page.addStyleTag({
    content: `noui-orb{right:${1200 - cx - orbW / 2}px;top:${cy - orbW / 2}px;width:${orbW}px} .card{width:500px}` +
      (left ? " .card{justify-content:flex-start;padding-top:84px;height:546px}" : ""),
  });
  await page.evaluate(({ cx, cy, rings, glow, barsAt, chipsAt, left }) => {
    const wrap = document.createElement("div");
    const ring = (d, a) => `<div class="ring" style="left:${cx - d / 2}px;top:${cy - d / 2}px;width:${d}px;height:${d}px;border-color:rgba(255,255,255,${a})"></div>`;
    // Voice level: a speech-like envelope, louder in the middle, with a few warm bars.
    const heights = [8, 12, 20, 15, 28, 38, 25, 44, 32, 20, 36, 46, 30, 17, 27, 40, 23, 14, 21, 11, 15, 8];
    const bars = heights.map((h, i) => `<i class="${[5, 7, 11, 15].includes(i) ? "hot" : ""}" style="height:${h}px"></i>`).join("");
    wrap.innerHTML =
      `<div class="glow" style="left:${cx - glow / 2}px;top:${cy - glow / 2}px;width:${glow}px;height:${glow}px"></div>` +
      ring(rings[0], 0.2) + ring(rings[1], 0.12) + ring(rings[2], 0.07) +
      `<div class="bars" style="left:${barsAt.x}px;top:${barsAt.y}px;${left ? "" : "transform:translateX(-50%)"}">${bars}</div>` +
      `<div class="chips" style="left:${chipsAt.x}px;top:${chipsAt.y}px;${left ? "" : "transform:translateX(-50%)"}">` +
        `<div class="chip on"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Listening</div>` +
        `<div class="chip">Thinking</div><div class="chip">Speaking</div></div>`;
    const orb = document.querySelector("noui-orb");
    [...wrap.children].forEach((c) => orb.parentElement.insertBefore(c, orb)); // behind the orb
    wrap.remove();
    const card = document.querySelector(".card");
    card.querySelector(".eyebrow").textContent = "Voice surface";
    card.querySelector("p").textContent = "Shows when your app is listening, thinking and speaking.";
  }, { cx, cy, rings, glow, barsAt, chipsAt, left });
}
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(3500); // let the orb settle into a lively frame
if (STYLE === "voice") {
  // Verify the three elements share one vertical centre line (the 4 rings are centred on it by construction).
  const centres = await page.evaluate(() => {
    const mid = (r) => r.left + r.width / 2;
    return {
      orb: mid(document.querySelector("noui-orb").getBoundingClientRect()),
      level: mid(document.querySelector(".bars").getBoundingClientRect()),
      chips: mid(document.querySelector(".chips").getBoundingClientRect()),
      ring: mid(document.querySelector(".ring").getBoundingClientRect()),
    };
  });
  console.log("centre x:", JSON.stringify(centres));
  const xs = Object.values(centres);
  if (Math.max(...xs) - Math.min(...xs) > 1) throw new Error("orb, level strip and chips are not on the same centre line");
}
await page.screenshot({ path: OUT });
await browser.close();
console.log("wrote", OUT);
