import type { Page } from "@playwright/test";

export interface Stats {
  r: number;
  g: number;
  b: number;
  /** Width of the orb along the middle row, as a fraction of the stage. */
  width: number;
  /** Fraction of the ring band that differs from the background. */
  ring: number;
}

/** Decodes a PNG of the stage in the page and measures the orb disc, its width and the ring band. */
export async function measure(page: Page, selector = "#stage"): Promise<Stats> {
  const png = await page.locator(selector).screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const S = img.width;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, S, S);
    const d = g.getImageData(0, 0, S, S).data;
    const px = (x: number, y: number) => {
      const i = (Math.round(y) * S + Math.round(x)) * 4;
      return [d[i]!, d[i + 1]!, d[i + 2]!];
    };
    const bg = px(S / 2, S * 0.012);
    const far = (p: number[], t: number) => Math.abs(p[0]! - bg[0]!) + Math.abs(p[1]! - bg[1]!) + Math.abs(p[2]! - bg[2]!) > t;

    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (Math.hypot(x - S / 2, y - S / 2) < 0.3 * S) { const p = px(x, y); r += p[0]!; gg += p[1]!; b += p[2]!; n++; }
    }
    let w = 0;
    for (let x = 0; x < S; x++) if (far(px(x, S / 2), 60) && Math.abs(x - S / 2) < 0.43 * S) w++;
    let ring = 0, rn = 0;
    for (let a = 0; a < 720; a++) for (const rad of [0.4475, 0.45, 0.4525]) {
      const t = (a / 720) * 2 * Math.PI;
      rn++;
      if (far(px(S / 2 + Math.cos(t) * rad * S, S / 2 + Math.sin(t) * rad * S), 25)) ring++;
    }
    return { r: r / n, g: gg / n, b: b / n, width: w / S, ring: ring / rn };
  }, png.toString("base64"));
}

export function average(list: Stats[]): Stats {
  const k = list.length;
  const sum = (f: (s: Stats) => number) => list.reduce((a, s) => a + f(s), 0) / k;
  return { r: sum((s) => s.r), g: sum((s) => s.g), b: sum((s) => s.b), width: sum((s) => s.width), ring: sum((s) => s.ring) };
}
