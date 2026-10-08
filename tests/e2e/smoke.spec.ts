import { expect, test } from "@playwright/test";

test("demo page registers <noui-orb>", async ({ page }) => {
  await page.goto("./");
  expect(await page.evaluate(() => !!customElements.get("noui-orb"))).toBe(true);
});
