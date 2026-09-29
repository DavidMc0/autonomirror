import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Set BASE_PATH=/autonomirror/ when deploying under a sub-path (e.g. GitHub Pages).
  base: process.env.BASE_PATH ?? "/",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        download: resolve(import.meta.dirname, "d/index.html"),
      },
    },
  },
  // Keep the SDK out of dep pre-bundling so its `new URL(..., import.meta.url)` WASM path resolves in dev.
  optimizeDeps: { exclude: ["@withautonomi/ant-browser-sdk"] },
});
