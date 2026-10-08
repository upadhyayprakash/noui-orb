import { expect, test, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ready = async (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("./");
  await page.waitForFunction(() => !(document.getElementById("seqBtn") as HTMLButtonElement | null)?.disabled, null, { timeout: 40000 });
  return errors;
};
const orbState = (page: Page) => page.evaluate(() => (window as any).orb.state as string);

/** A 1.5 s 440 Hz tone as a WAV file. */
function wav(): Buffer {
  const rate = 8000;
  const n = rate * 1.5;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 20000), 44 + i * 2);
  return buf;
}

test("the demo registers the element, plays the intro and enables the controls without errors", async ({ page }) => {
  const errors = await ready(page);
  expect(await page.evaluate(() => !!customElements.get("noui-orb"))).toBe(true);
  expect(await orbState(page)).toBe("idle");
  expect(await page.textContent("#sessionBtn")).toBe("End session");
  expect(errors).toEqual([]);
});

test("number keys switch states and the buttons follow", async ({ page }) => {
  await ready(page);
  for (const [key, state, label] of [["2", "listening", "Listening"], ["3", "thinking", "Thinking"], ["6", "error", "Error"], ["1", "idle", "Idle"]]) {
    await page.keyboard.press(key!);
    expect(await orbState(page)).toBe(state);
    expect(await page.getAttribute(`#stateGrid button:has-text("${label}")`, "aria-pressed")).toBe("true");
  }
});

test("working shows the ring steps, then completes", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("4");
  await page.waitForFunction(() => /Step 2 of 3/.test(document.getElementById("capStep")!.textContent!), null, { timeout: 30000 });
  expect(await page.evaluate(() => (window as any).orb.getAttribute("aria-label"))).toMatch(/working, step [23] of 3/);
  await page.waitForFunction(() => document.getElementById("capStep")!.textContent === "3 of 3 done", null, { timeout: 30000 });
});

test("a full turn assembles the card from the orb, and the card dismisses back into it", async ({ page }) => {
  await ready(page);
  await page.click("#seqBtn");
  await page.waitForFunction(() => !document.getElementById("cardSlot")!.hidden, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as any).orb.placement)).toBe("room");
  expect(await orbState(page)).toBe("speaking");
  await page.waitForFunction(() => !document.getElementById("seqBtn")!.textContent!.startsWith("Stop"), null, { timeout: 40000 });
  await page.click("#cardConfirm");
  await page.waitForFunction(() => document.getElementById("cardSlot")!.hidden, null, { timeout: 30000 });
  await page.waitForFunction(() => (window as any).orb.placement === "center");
});

test("step aside turns the orb into a button and clicking it brings it back", async ({ page }) => {
  await ready(page);
  await page.click("#asideBtn");
  await page.waitForFunction(() => (window as any).orb.getAttribute("role") === "button");
  expect(await page.textContent("#asideBtn")).toBe("Come back");
  await page.waitForTimeout(800);
  const c = await page.evaluate(() => (window as any).orb.originRect());
  await page.mouse.click(c.x, c.y);
  await page.waitForFunction(() => (window as any).orb.placement === "center");
  expect(await page.evaluate(() => (window as any).orb.getAttribute("role"))).toBe("img");
});

test("tuning sliders write through to the component's config, and Copy settings exports it", async ({ page }) => {
  await ready(page);
  await page.fill("#t-reactivity", "2");
  await page.fill("#t-grain", "0.1");
  const cfg = await page.evaluate(() => (window as any).orb.config);
  expect(cfg.reactivity).toBe(2);
  expect(cfg.grain).toBeCloseTo(0.1, 5);
  await page.click("#copyBtn");
  await page.waitForFunction(() => ["Copied", "Select and copy below"].includes(document.getElementById("copyBtn")!.textContent!));
  const fallback = page.locator("#copyFallback");
  if (await fallback.isVisible()) expect(JSON.parse(await fallback.inputValue()).reactivity).toBe(2);
});

test("the simulated voice drives the meters while listening", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("2");
  const peak = await page.evaluate(async () => {
    let max = 0;
    const end = performance.now() + 3000;
    while (performance.now() < end) {
      max = Math.max(max, (window as any).orb.levels.amp);
      await new Promise((r) => setTimeout(r, 30));
    }
    return max;
  });
  expect(peak).toBeGreaterThan(0.3);
  expect(parseFloat((await page.textContent("#meters .meter:first-child output"))!)).toBeGreaterThanOrEqual(0);
});

test("an audio file drives the orb in speaking", async ({ page }) => {
  await ready(page);
  await page.setInputFiles("#fileInput", { name: "tone.wav", mimeType: "audio/wav", buffer: wav() });
  await page.waitForFunction(() => document.getElementById("srcFile")!.getAttribute("aria-checked") === "true");
  expect(await orbState(page)).toBe("speaking");
  const peak = await page.evaluate(async () => {
    let max = 0;
    const end = performance.now() + 3000;
    while (performance.now() < end) {
      max = Math.max(max, (window as any).orb.levels.amp);
      await new Promise((r) => setTimeout(r, 30));
    }
    return max;
  });
  expect(peak).toBeGreaterThan(0.3);
});

test("the microphone (a fake device here) drives the orb in listening", async ({ page }) => {
  await ready(page);
  await page.click("#srcMic");
  await page.waitForFunction(() => document.getElementById("srcMic")!.getAttribute("aria-checked") === "true", null, { timeout: 30000 });
  expect(await orbState(page)).toBe("listening");
  expect(await page.textContent("#srcNote")).toMatch(/Live microphone/);
  const peak = await page.evaluate(async () => {
    let max = 0;
    const end = performance.now() + 6000;
    while (performance.now() < end) {
      max = Math.max(max, (window as any).orb.levels.amp);
      await new Promise((r) => setTimeout(r, 30));
    }
    return max;
  });
  expect(peak).toBeGreaterThan(0.1);
});

test("ending the session plays the outro, and starting it plays the intro again", async ({ page }) => {
  await ready(page);
  await page.click("#sessionBtn");
  await page.waitForFunction(() => document.getElementById("sessionBtn")!.textContent === "Start session", null, { timeout: 30000 });
  expect(await page.isDisabled("#seqBtn")).toBe(true);
  await page.click("#sessionBtn");
  await page.waitForFunction(() => document.getElementById("sessionBtn")!.textContent === "End session", null, { timeout: 30000 });
  await page.waitForFunction(() => !(document.getElementById("seqBtn") as HTMLButtonElement).disabled);
});

test("Get started: every sample is on the page, copyable, and the runnable ones run", async ({ page }) => {
  const errors = await ready(page);
  const names = await page.$$eval(".code[data-snippet]", (els) => els.map((e) => (e as HTMLElement).dataset.snippet));
  expect(names).toEqual(["install", "html", "states", "mic", "reply", "gestures", "emit", "react"]);
  expect(await page.locator(".copy").count()).toBe(8);
  expect(await page.textContent('.code[data-snippet="install"] pre')).toBe("npm i @nouisi/orb");

  // The samples marked data-run are executed against the live element, as written (imports removed).
  const run = await page.evaluate(async () => {
    const out: Record<string, string> = {};
    const Async = Object.getPrototypeOf(async () => {}).constructor;
    for (const el of document.querySelectorAll(".code[data-run]")) {
      const name = (el as HTMLElement).dataset.snippet!;
      const body = el.querySelector("code")!.textContent!.replace(/^import .*$/gm, "");
      try {
        await new Async("orb", body)((window as any).orb);
        out[name] = "ok";
      } catch (e) {
        out[name] = String(e);
      }
    }
    return out;
  });
  expect(run).toEqual({ states: "ok", mic: "ok", gestures: "ok" });
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test("Get started: the Copy button copies the sample", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await ready(page);
  await page.click('.code[data-snippet="install"] .copy');
  await expect(page.locator('.code[data-snippet="install"] .copy')).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npm i @nouisi/orb");
});

test("link previews: Open Graph and Twitter tags point at a share image that exists", async ({ page, request }) => {
  await page.goto("./");
  const meta = (sel: string) => page.getAttribute(sel, "content");
  expect(await meta('meta[property="og:title"]')).toContain("noui-orb");
  expect(await meta('meta[property="og:url"]')).toBe("https://noui.si/lab/orb/");
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  expect(await page.getAttribute('link[rel="canonical"]', "href")).toBe("https://noui.si/lab/orb/");
  const image = (await meta('meta[property="og:image"]'))!;
  expect(image).toBe("https://noui.si/lab/orb/og.png");
  // Same file, fetched from this server (the dev server serves it at the demo's own base path).
  const res = await request.get("og.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});
