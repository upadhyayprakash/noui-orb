import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: { command: "npm run dev -- --port 5199", url: "http://localhost:5199/lab/orb/", reuseExistingServer: !process.env.CI },
  use: {
    baseURL: "http://localhost:5199/lab/orb/",
    // Software GL so WebGL works in headless CI.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
});
