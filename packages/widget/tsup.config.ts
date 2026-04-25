import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "iife"],
  globalName: "Colaborate",
  platform: "browser",
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  // Disable tsup's default ESM code-splitting so all deps bundle into a single
  // `dist/index.js`. Matters for `noExternal` bundled libs (html2canvas adds a
  // dynamic import that tsup would otherwise extract to a separate chunk file).
  // The E2E server and most consumers serve `dist/index.js` directly; with
  // splitting on, chunk files would 404 at the top-level static import.
  splitting: false,
  noExternal: ["@medv/finder", "@colaborate/core", "html2canvas", "perfect-freehand"],
});
