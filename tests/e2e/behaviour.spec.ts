import { expect, test, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */
const open = async (page: Page, query = "?intro=none") => {
  await page.goto("harness/" + query);
  await page.waitForFunction(() => !!(window as any).orb?.shadowRoot);
};
const $ = (page: Page, fn: (orb: any) => unknown) => page.evaluate((src) => new Function("orb", `return (${src})(orb)`)((window as any).orb), fn.toString());

test("states set the accessible names and fire statechange", async ({ page }) => {
  await open(page);
  const names = await page.evaluate(async () => {
    const orb = (window as any).orb;
    const out: string[] = [];
    const events: string[] = [];
    orb.addEventListener("orb-statechange", (e: CustomEvent) => events.push(`${e.detail.from}>${e.detail.to}`));
    for (const s of ["listening", "thinking", "working", "speaking", "error", "idle"]) {
      orb.state = s;
      if (s === "working") orb.progress = { steps: 3, done: 1 };
      out.push(orb.getAttribute("aria-label"));
    }
    return { out, events };
  });
  expect(names.out).toEqual([
    "noui is listening", "noui is thinking", "noui is working, step 2 of 3", "noui is speaking", "noui can't connect", "noui is idle",
  ]);
  expect(names.events[0]).toBe("idle>listening");
  expect(names.events).toHaveLength(6);
});

test("gesture lifecycle, rate limit and the automatic nod", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    const ev: string[] = [];
    orb.addEventListener("orb-gesture", (e: CustomEvent) => ev.push(`${e.detail.name}:${e.detail.phase}`));
    const first = orb.gesture("nod");
    const second = await orb.gesture("shake").then(() => "ok", (e: unknown) => e);
    await first;
    orb.state = "listening";
    orb.state = "thinking"; // auto nod, but the rate limit has not expired yet
    await new Promise((r) => setTimeout(r, 1300));
    orb.state = "listening";
    orb.state = "thinking"; // now it is allowed
    await new Promise((r) => setTimeout(r, 1200));
    return { second, ev };
  });
  expect(r.second).toBe("suppressed");
  expect(r.ev.slice(0, 2)).toEqual(["nod:start", "nod:end"]);
  expect(r.ev.filter((e) => e === "nod:start")).toHaveLength(2);
  expect(r.ev).not.toContain("shake:start");
});

test("interrupt switches speaking to listening at once and is never rate limited", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    orb.state = "speaking";
    const nod = orb.gesture("nod");
    const p = orb.gesture("interrupt");
    const stateRightAfter = orb.state;
    await Promise.all([nod, p]);
    return stateRightAfter;
  });
  expect(r).toBe("listening");
});

test("gestures are off without the attribute and under reduced motion", async ({ page }) => {
  await open(page);
  const off = await page.evaluate(async () => {
    const orb = (window as any).orb;
    orb.gestures = false;
    return orb.gesture("hop").then(() => "ok", (e: unknown) => e);
  });
  expect(off).toBe("suppressed");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(async () => {
    const orb = (window as any).orb;
    orb.gestures = true;
    return orb.gesture("hop").then(() => "ok", (e: unknown) => e);
  });
  expect(reduced).toBe("suppressed");
});

test("emit moves to room, interrupt still works when gestures are suppressed", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    orb.gestures = false;
    orb.state = "speaking";
    const a = await orb.gesture("interrupt").then(() => "ok", (e: unknown) => e);
    const b = await orb.gesture("emit").then(() => "ok", (e: unknown) => e);
    return { a, b, state: orb.state, placement: orb.placement };
  });
  expect(r).toEqual({ a: "suppressed", b: "suppressed", state: "listening", placement: "room" });
});

test("aside turns the orb into a button that fires orb-recall", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).orb.place("aside"));
  const attrs = await $(page, (o) => ({ role: o.getAttribute("role"), tab: o.getAttribute("tabindex"), name: o.getAttribute("aria-label") }));
  expect(attrs).toEqual({ role: "button", tab: "0", name: "Bring back noui" });

  const c = await $(page, (o) => o.originRect());
  await page.evaluate(() => ((window as any).__recalls = 0, (window as any).orb.addEventListener("orb-recall", () => (window as any).__recalls++)));
  await page.mouse.click((c as any).x, (c as any).y);
  expect(await page.evaluate(() => (window as any).__recalls)).toBe(1);

  // The harness answers a recall by moving back to the centre, so go aside again before each key.
  for (const key of ["Enter", "Space"]) {
    await page.evaluate(() => (window as any).orb.place("aside"));
    await page.evaluate(() => (window as any).orb.focus());
    await page.keyboard.press(key);
  }
  expect(await page.evaluate(() => (window as any).__recalls)).toBe(3);
  await page.evaluate(() => (window as any).orb.place("aside"));

  await page.evaluate(() => (window as any).orb.place("center"));
  expect(await $(page, (o) => o.getAttribute("role"))).toBe("img");
  expect(await $(page, (o) => o.hasAttribute("tabindex"))).toBe(false);
});

test("originRect follows the placement", async ({ page }) => {
  await open(page);
  const centre = await $(page, (o) => ({ rect: o.getBoundingClientRect().toJSON(), c: o.originRect() }));
  const { rect, c } = centre as any;
  expect(c.x).toBeCloseTo(rect.left + rect.width / 2, 0);
  expect(c.r).toBeCloseTo(0.39 * rect.width, 0);
  await page.evaluate(() => (window as any).orb.place("aside"));
  const aside = (await $(page, (o) => o.originRect())) as any;
  expect(aside.x).toBeCloseTo(c.x - 0.37 * rect.width, 0);
  expect(aside.y).toBeCloseTo(c.y - 0.37 * rect.height, 0);
  expect(aside.r).toBeCloseTo(c.r * 0.2, 0);
});

test("intro and outro take about 3.4 s and 1.3 s and fire their events", async ({ page }) => {
  await open(page, "?intro=manual");
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    const ev: string[] = [];
    orb.addEventListener("orb-intro-end", () => ev.push("intro-end"));
    orb.addEventListener("orb-outro-end", () => ev.push("outro-end"));
    const t0 = performance.now();
    await orb.intro();
    const intro = performance.now() - t0;
    const t1 = performance.now();
    await orb.outro();
    return { intro, outro: performance.now() - t1, ev };
  });
  expect(r.intro).toBeGreaterThan(3300);
  expect(r.intro).toBeLessThan(3700);
  expect(r.outro).toBeGreaterThan(1250);
  expect(r.outro).toBeLessThan(1600);
  expect(r.ev).toEqual(["intro-end", "outro-end"]);
});

test("reduced motion: the intro is a 200 ms crossfade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "?intro=manual");
  const ms = await page.evaluate(async () => {
    const t0 = performance.now();
    await (window as any).orb.intro();
    return performance.now() - t0;
  });
  expect(ms).toBeGreaterThan(190);
  expect(ms).toBeLessThan(450);
});

test("a finished progress fires hop and the ring fades out", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    const ev: string[] = [];
    orb.addEventListener("orb-gesture", (e: CustomEvent) => ev.push(`${e.detail.name}:${e.detail.phase}`));
    orb.state = "working";
    orb.progress = { steps: 3, done: 2, current: 0.5 };
    await new Promise((r) => setTimeout(r, 600));
    const ringBefore = getComputedStyle(orb.shadowRoot.querySelector(".ring")).opacity;
    orb.progress = { steps: 3, done: 3 };
    // Poll rather than sleep: a slow runner advances animation time slower than the wall clock.
    const ring = () => Number(getComputedStyle(orb.shadowRoot.querySelector(".ring")).opacity);
    for (let i = 0; i < 400 && ring() >= 0.05; i++) await new Promise((r) => setTimeout(r, 25));
    return { ev, ringBefore: Number(ringBefore), ringAfter: ring() };
  });
  expect(r.ev[0]).toBe("hop:start");
  expect(r.ringBefore).toBeGreaterThan(0.9);
  expect(r.ringAfter).toBeLessThan(0.05);
});

test("working without progress spins and never shows determinate fill", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    orb.state = "working";
    await new Promise((r) => setTimeout(r, 700));
    const fills = [...orb.shadowRoot.querySelectorAll(".ring-fill")].filter((c: any) => c.style.display !== "none");
    return fills.map((c: any) => Number(c.getAttribute("stroke-dasharray").split(" ")[0]));
  });
  // one arc of 64° on a 45-unit radius circle: 64/360 · 2π · 45 ≈ 50.3, the others empty
  expect(r[0]).toBeCloseTo((64 / 360) * 2 * Math.PI * 45, 0);
  expect(r.slice(1).every((v) => v === 0)).toBe(true);
});

test("CSS fallback when WebGL is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...a: any[]) {
      return type === "webgl" || type === "webgl2" ? null : (orig as any).call(this, type, ...a);
    } as any;
    (window as any).__fb = [];
    addEventListener("DOMContentLoaded", () => document.getElementById("orb")!.addEventListener("orb-fallback", (e: any) => (window as any).__fb.push(e.detail.reason)));
  });
  await open(page);
  await page.waitForFunction(() => (window as any).__fb.length > 0);
  expect(await page.evaluate(() => (window as any).__fb)).toEqual(["webgl-unavailable"]);
  const r = await $(page, (o) => ({
    canvasHidden: o.shadowRoot.querySelector("canvas").hidden,
    fallbackHidden: o.shadowRoot.querySelector(".fallback").hidden,
    state: (o.state = "error", o.state),
  }));
  expect(r).toMatchObject({ canvasHidden: true, fallbackHidden: false });
  await page.waitForTimeout(3000);
  const filter = await $(page, (o) => o.shadowRoot.querySelector(".fallback").style.filter);
  expect(Number(/saturate\(([\d.]+)\)/.exec(String(filter))![1])).toBeLessThan(0.2);
});

test("setLevels drives the orb in listening and is ignored in idle", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    const push = async (ms: number) => {
      const end = performance.now() + ms;
      while (performance.now() < end) {
        orb.setLevels({ amp: 0.8, bright: 0.6, bass: 0.4, treble: 0.2 }, "input");
        await new Promise((r) => setTimeout(r, 16));
      }
    };
    await push(500);
    const idle = orb.env.amp;
    orb.state = "listening";
    await push(500);
    return { idle, listening: orb.env.amp };
  });
  expect(r.idle).toBeLessThan(0.1);
  expect(r.listening).toBeGreaterThan(0.6);
});

test("input audio: reacts to a live stream, then reports silence and a dead track", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    await ctx.resume();

    const silent: number[] = [];
    orb.addEventListener("orb-input-silent", (e: CustomEvent) => silent.push(e.detail.seconds));

    orb.state = "listening";
    orb.attachInput(dest.stream);
    await new Promise((r) => setTimeout(r, 700));
    const loud = orb.env.amp;

    gain.gain.value = 0; // the speaker goes quiet
    // The 4 s counts animation time, which lags the wall clock on a slow runner, so wait for the event.
    for (let i = 0; i < 600 && silent.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
    const quietEvents = [...silent];

    dest.stream.getAudioTracks()[0]!.stop(); // stop() does not fire "ended", so end it the way a device does
    dest.stream.getAudioTracks()[0]!.dispatchEvent(new Event("ended"));
    await new Promise((r) => setTimeout(r, 100));
    return { loud, quietEvents, afterEnd: [...silent], attached: orb.inputChannel.attached };
  });
  expect(r.loud).toBeGreaterThan(0.3);
  expect(r.quietEvents).toHaveLength(1);
  expect(r.quietEvents[0]).toBeGreaterThanOrEqual(4);
  expect(r.afterEnd).toHaveLength(2);
  expect(r.afterEnd[1]).toBe(0);
  expect(r.attached).toBe(false);
});

test("output audio drives speaking, and not before the breath is over", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    osc.connect(gain);
    osc.start();
    await ctx.resume();
    orb.attachOutput(gain);
    orb.state = "speaking";
    await new Promise((r) => setTimeout(r, 250));
    const during = orb.env.amp;
    await new Promise((r) => setTimeout(r, 700));
    return { during, after: orb.env.amp };
  });
  expect(r.during).toBeLessThan(0.15);
  expect(r.after).toBeGreaterThan(0.3);
});

test("levels is a read-only snapshot of the smoothed signal", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    const before = orb.levels;
    orb.state = "listening";
    const end = performance.now() + 500;
    while (performance.now() < end) {
      orb.setLevels({ amp: 0.9, bright: 0.7, bass: 0.5, treble: 0.5 }, "input");
      await new Promise((r) => setTimeout(r, 16));
    }
    let threw = false;
    try { "use strict"; orb.levels = {}; } catch { threw = true; }
    return { before, after: orb.levels, keys: Object.keys(orb.levels).sort(), threw };
  });
  expect(r.keys).toEqual(["amp", "bass", "bright", "pace", "paceRate", "treble"]);
  expect(r.before.amp).toBeLessThan(0.1);
  expect(r.after.amp).toBeGreaterThan(0.8);
  expect(r.after.bright).toBeGreaterThan(0.55);
});

test("config merges partially and reads back", async ({ page }) => {
  await open(page);
  const c = await $(page, (o) => {
    o.config = { reactivity: 2, placements: { aside: { dx: -30 } } };
    return o.config;
  });
  expect((c as any).reactivity).toBe(2);
  expect((c as any).placements.aside).toEqual({ dx: -30, dy: -37, s: 0.2 });
  expect((c as any).grain).toBe(0.06);
});

test("an orb that is off-screen runs no animation frames", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__raf = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => ((window as any).__raf++, orig(cb));
  });
  await open(page);
  await page.evaluate(() => {
    (window as any).orb.style.marginTop = "4000px";
  });
  await page.waitForTimeout(500);
  const a = await page.evaluate(() => (window as any).__raf);
  await page.waitForTimeout(800);
  const b = await page.evaluate(() => (window as any).__raf);
  expect(b - a).toBeLessThanOrEqual(1);

  await page.evaluate(() => ((window as any).orb.style.marginTop = "0"));
  await page.waitForTimeout(500);
  const c = await page.evaluate(() => (window as any).__raf);
  expect(c - b).toBeGreaterThan(10);
});

test("a hidden-logo orb (before the intro) runs no animation frames", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__raf = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => ((window as any).__raf++, orig(cb));
  });
  await open(page, "?intro=manual");
  await page.waitForTimeout(500);
  const a = await page.evaluate(() => (window as any).__raf);
  await page.waitForTimeout(800);
  expect((await page.evaluate(() => (window as any).__raf)) - a).toBeLessThanOrEqual(1);
});

test("the orb lands on the o within 1 px at a 640 px box (SPEC §16)", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await open(page, "?intro=manual");
  const r = await page.evaluate(async () => {
    const orb = (window as any).orb;
    orb.style.width = "640px";
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const done = orb.intro();
    // Wait for the frames where the orb is visible but still sitting on the o.
    const sample = await new Promise<any>((resolve) => {
      const poll = () => {
        if (orb.orbOpacity === 1 && orb.orbK === 1) {
          const dot = orb.shadowRoot.querySelector(".dot").getBoundingClientRect();
          const wrap = orb.shadowRoot.querySelector(".orb-wrap").getBoundingClientRect();
          resolve({
            dot: { x: dot.left + dot.width / 2, y: dot.top + dot.height / 2, r: dot.width / 2 },
            orb: { x: wrap.left + wrap.width / 2, y: wrap.top + wrap.height / 2, r: 0.39 * 640 * (wrap.width / 640) },
          });
        } else requestAnimationFrame(poll);
      };
      poll();
    });
    await done;
    return sample;
  });
  expect(Math.abs(r.dot.x - r.orb.x)).toBeLessThan(1);
  expect(Math.abs(r.dot.y - r.orb.y)).toBeLessThan(1);
  expect(Math.abs(r.dot.r - r.orb.r)).toBeLessThan(1);
});

test("while listening the orb leans toward the pointer, and not otherwise", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await open(page);
  const c = (await $(page, (o) => o.originRect())) as { x: number; y: number; r: number };
  await page.mouse.move(c.x + 300, c.y);
  await page.waitForTimeout(300);
  const idle = await $(page, (o) => o.char.leanX);
  expect(Math.abs(idle as number)).toBeLessThan(0.02);

  await page.evaluate(() => ((window as any).orb.state = "listening"));
  await page.mouse.move(c.x + 301, c.y);
  await page.waitForFunction(() => (window as any).orb.char.leanX > 0.9, null, { timeout: 10000 });

  await page.mouse.move(c.x - 301, c.y);
  await page.waitForFunction(() => (window as any).orb.char.leanX < -0.9, null, { timeout: 10000 });
});

test("a pointer press inside the orb ends wait", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).__w = [];
    (window as any).orb.addEventListener("orb-gesture", (e: CustomEvent) => (window as any).__w.push(`${e.detail.name}:${e.detail.phase}`));
    (window as any).orb.gesture("wait");
  });
  await page.waitForTimeout(500);
  const c = (await $(page, (o) => o.originRect())) as { x: number; y: number };
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).__w)).toEqual(["wait:start", "wait:end"]);
  expect(await $(page, (o) => o.char.waiting)).toBe(false);
});
