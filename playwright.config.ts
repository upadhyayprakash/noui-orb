import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // CI runners render WebGL in software and can be several times slower than a laptop.
  timeout: 90_000,
  // One line per test with its duration, in the CI log too (the default reporter on CI hides them).
  reporter: "list",
  webServer: { command: "npm run dev -- --port 5199", url: "http://localhost:5199/lab/orb/", reuseExistingServer: !process.env.CI },
  use: {
    baseURL: "http://localhost:5199/lab/orb/",
    launchOptions: {
      args: [
        // Software GL so WebGL works in headless CI.
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
        // A fake microphone with auto-granted permission, and playback without a user gesture.
        "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
});
