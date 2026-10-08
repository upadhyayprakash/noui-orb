import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    target: "es2022",
    lib: {
      entry: { index: "src/index.ts", element: "src/element.ts" },
      formats: ["es"],
    },
    rollupOptions: { output: { chunkFileNames: "chunk-[hash].js" } },
  },
  test: { include: ["src/**/*.test.ts"] },
});
