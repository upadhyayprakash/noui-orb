import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  base: "/lab/orb/",
  build: { outDir: "../demo-dist/lab/orb", emptyOutDir: true },
});
