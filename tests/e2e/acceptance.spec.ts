// SPEC §16 acceptance criteria that can be checked automatically.
import { expect, test, type Page } from "@playwright/test";
import { average, measure } from "../support/compare";
import { toneWav } from "../support/tone";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PROTOTYPE = new URL("../../prototype/noui-orb-prototype.html", import.meta.url).href;
const STATES: Array<[key: string, name: string]> = [["1", "idle"], ["2", "listening"], ["3", "thinking"], ["4", "working"], ["5", "speaking"], ["6", "error"]];

/** Makes requestAnimationFrame fire at `fps`, to mimic a slow device. */
const throttle = (fps: number) => () => {
  if (fps < 60) window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 1000 / fps) as unknown as number;
};
const throttleScript = (fps: number) => `(${throttle.toString()})()`.replace("fps <", `${fps} <`).replace("1000 / fps", `1000 / ${fps}`);

async function walkStates(page: Page) {
  await page.waitForFunction(() => !(document.getElementById("seqBtn") as HTMLButtonElement).disabled, null, { timeout: 90000 });
  // The same audio file drives both pages, so listening and speaking are comparable.
  await page.setInputFiles("#fileInput", { name: "tone.wav", mimeType: "audio/wav", buffer: toneWav() });
  const out: Record<string, ReturnType<typeof average>> = {};
  for (const [key, name] of STATES) {
    await page.keyboard.press(key);
    await page.waitForTimeout(2200);
    const samples = [];
    for (let i = 0; i < 6; i++) {
      samples.push(await measure(page));
      await page.waitForTimeout(350);
    }
    out[name] = average(samples);
  }
  return out;
}

// A statistical comparison of two moving noise fields: occasionally unlucky on phase. A real regression
// (wrong palette, saturation or size) fails every time, so allow a couple of retries for these two.
test.describe("side by side with the prototype", () => {
test.describe.configure({ retries: 2 });
for (const fps of [60, 15]) {
  test(`all six states match the prototype side by side at ${fps} fps`, async ({ browser }) => {
    test.setTimeout(420_000);
    const result: Record<string, Awaited<ReturnType<typeof walkStates>>> = {};
    for (const [label, url] of [["prototype", PROTOTYPE], ["component", "http://localhost:5199/lab/orb/"]] as const) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
      const page = await context.newPage();
      await page.addInitScript(throttleScript(fps));
      await page.goto(url);
      result[label] = await walkStates(page);
      await context.close();
    }
    for (const [, state] of STATES) {
      const a = result.prototype![state]!;
      const b = result.component![state]!;
      const note = `${state} @ ${fps} fps: prototype ${JSON.stringify(a)} vs component ${JSON.stringify(b)}`;
      // Colour is the average of a moving noise field, so two runs differ by phase. The prototype alone
      // read between 138 and 172 (green) for "thinking" across runs, hence 24. A wrong palette, saturation
      // or size would still show up well beyond that.
      expect(Math.abs(a.r - b.r), note).toBeLessThan(24);
      expect(Math.abs(a.g - b.g), note).toBeLessThan(24);
      expect(Math.abs(a.b - b.b), note).toBeLessThan(24);
      expect(Math.abs(a.width - b.width), note).toBeLessThan(0.03); // same orb size
      // The ring is the same shape; only the step fill and gap phase may differ between the two loops.
      expect(Math.abs(a.ring - b.ring), note).toBeLessThan(0.2);
    }
  });
}
});

test("gesture peaks at 15 fps are within 10% of 60 fps (SPEC §16)", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = async (fps: number) => {
    const context = await browser.newContext({ viewport: { width: 700, height: 700 } });
    const page = await context.newPage();
    await page.addInitScript(throttleScript(fps));
    await page.goto("harness/?intro=none&nogl=1");
    await page.waitForFunction(() => !!(window as any).orb?.shadowRoot);
    const peaks: Record<string, Record<string, number>> = {};
    for (const name of ["nod", "shake", "huh", "hop"]) {
      peaks[name] = await page.evaluate(async (g) => {
        const orb = (window as any).orb;
        const body = orb.shadowRoot.querySelector(".orb-body") as HTMLElement;
        const p = { x: 0, y: 0, rot: 0, sy: 0 };
        let stop = false;
        const sample = () => {
          const m = /translate\(([-\d.]+)%,([-\d.]+)%\) rotate\(([-\d.]+)deg\) scale\(([-\d.]+),([-\d.]+)\)/.exec(body.style.transform);
          if (m) {
            p.x = Math.max(p.x, Math.abs(+m[1]!));
            p.y = Math.max(p.y, Math.abs(+m[2]!));
            p.rot = Math.max(p.rot, Math.abs(+m[3]!));
            p.sy = Math.max(p.sy, Math.abs(+m[5]! - 1));
          }
          if (!stop) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        await orb.gesture(g).catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        stop = true;
        return p;
      }, name);
      await page.waitForTimeout(1400); // clear the rate limit
    }
    await context.close();
    return peaks;
  };
  const fast = await run(60);
  const slow = await run(15);
  for (const name of Object.keys(fast)) {
    for (const axis of ["x", "y", "rot", "sy"]) {
      const a = fast[name]![axis]!;
      const b = slow[name]![axis]!;
      if (a < 0.3 && axis !== "sy") continue; // this gesture barely uses this axis
      if (axis === "sy" && a < 0.05) continue;
      const diff = Math.abs(a - b) / a;
      expect(diff, `${name}.${axis}: 60 fps ${a.toFixed(3)} vs 15 fps ${b.toFixed(3)}`).toBeLessThan(0.1);
    }
  }
});

test("reduced motion: no springs, no lean, and flow and spin run at 0.35x (SPEC §16)", async ({ browser }) => {
  const measureFlow = async (reduced: boolean) => {
    const context = await browser.newContext({ viewport: { width: 700, height: 700 }, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    await page.goto("harness/?intro=none&nogl=1");
    await page.waitForFunction(() => !!(window as any).orb?.shadowRoot);
    await page.evaluate(() => ((window as any).orb.state = "thinking"));
    // Wait for the eased state values to settle, or the first seconds would skew the rate.
    await page.waitForFunction(() => Math.abs((window as any).orb.curFlow - 1.3) < 0.005, null, { timeout: 30000 });
    const r = await page.evaluate(async () => {
      const orb = (window as any).orb;
      const f0 = orb.flowT, c0 = orb.clock;
      await new Promise((res) => setTimeout(res, 1500));
      const dt = orb.clock - c0;
      const flow = (orb.flowT - f0) / dt; // read now, before the state changes below
      // The spin angle wraps at 360, so measure it over a window short enough not to wrap.
      const r1 = orb.ring.rot, c1 = orb.clock;
      await new Promise((res) => setTimeout(res, 400));
      const spin = ((((orb.ring.rot - r1) % 360) + 360) % 360) / (orb.clock - c1);
      const gesture = await orb.gesture("hop").then(() => "ok", (e: unknown) => e);
      orb.state = "listening";
      await new Promise((res) => setTimeout(res, 500));
      return { flow, spin, gesture, lean: Math.hypot(orb.char.leanX, orb.char.leanY), springs: Math.abs(orb.char.y) + Math.abs(orb.char.sq) };
    });
    await context.close();
    return r;
  };
  const normal = await measureFlow(false);
  const reduced = await measureFlow(true);
  expect(reduced.flow / normal.flow).toBeGreaterThan(0.33);
  expect(reduced.flow / normal.flow).toBeLessThan(0.37);
  expect(reduced.spin / normal.spin).toBeGreaterThan(0.33); // the thinking ring turns at 0.35x too
  expect(reduced.spin / normal.spin).toBeLessThan(0.37);
  expect(reduced.gesture).toBe("suppressed");
  expect(reduced.lean).toBe(0);
  expect(reduced.springs).toBe(0);
  expect(normal.gesture).toBe("ok");
});

for (const kind of ["scrolled off-screen", "in a hidden tab"] as const) {
  test(`an orb ${kind} makes no WebGL draw calls (SPEC §16)`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__draws = 0;
      const orig = WebGLRenderingContext.prototype.drawArrays;
      WebGLRenderingContext.prototype.drawArrays = function (...a: [number, number, number]) {
        (window as any).__draws++;
        return orig.apply(this, a);
      };
    });
    await page.goto("harness/?intro=none");
    await page.waitForFunction(() => !!(window as any).orb?.shadowRoot);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as any).__draws)).toBeGreaterThan(5); // it does draw when visible

    if (kind === "scrolled off-screen") {
      await page.evaluate(() => ((window as any).orb.style.marginTop = "4000px"));
    } else {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => (window as any).__draws);
    await page.waitForTimeout(1000);
    expect((await page.evaluate(() => (window as any).__draws)) - a).toBe(0);

    // ...and it picks up again when it comes back.
    if (kind === "scrolled off-screen") await page.evaluate(() => ((window as any).orb.style.marginTop = "0"));
    else await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(600);
    expect((await page.evaluate(() => (window as any).__draws)) - a).toBeGreaterThan(5);
  });
}

test("light and dark: the ring and mark ink adapt, the orb colours stay constant (SPEC §16)", async ({ browser }) => {
  const read = async (scheme: "light" | "dark") => {
    const context = await browser.newContext({ viewport: { width: 700, height: 700 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto("harness/?intro=manual&nogl=1");
    await page.waitForFunction(() => !!(window as any).orb?.shadowRoot);
    const styles = await page.evaluate(() => {
      const root = (window as any).orb.shadowRoot as ShadowRoot;
      const cs = (sel: string, prop: string) => getComputedStyle(root.querySelector(sel)!).getPropertyValue(prop);
      return {
        markInk: cs(".mark path", "stroke"),
        markDot: cs(".mark .dot", "fill"),
        ring: cs(".ring-fill", "stroke"),
        track: cs(".ring-track", "stroke"),
        fallback: cs(".fallback", "background-image"),
      };
    });
    await context.close();
    return styles;
  };
  const light = await read("light");
  const dark = await read("dark");
  expect(light.markInk).not.toBe(dark.markInk);
  expect(light.ring).not.toBe(dark.ring);
  expect(light.track).not.toBe(dark.track);
  expect(light.fallback).toBe(dark.fallback); // the orb's own colours never change
  expect(dark.ring).toBe("rgb(255, 138, 69)"); // #FF8A45
  expect(light.ring).toBe("rgb(233, 88, 28)"); // #E9581C
});
