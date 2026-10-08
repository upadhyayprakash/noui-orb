// @vitest-environment node
import { describe, expect, it } from "vitest";

describe("server-side import", () => {
  it("has no browser globals in this environment", () => {
    expect(typeof HTMLElement).toBe("undefined");
    expect(typeof customElements).toBe("undefined");
  });

  it("importing the registering entry does not throw", async () => {
    const mod = await import("./index");
    expect(typeof mod.NouiOrbElement).toBe("function");
  });

  it("importing the element entry does not throw", async () => {
    const mod = await import("./element");
    expect(typeof mod.NouiOrbElement).toBe("function");
  });
});
