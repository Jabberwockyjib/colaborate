import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/transports/stdio.ts", "src/transports/http.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  noExternal: ["@colaborate/core"],
});
