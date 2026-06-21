import { defineConfig } from "tsup";

// Bundle the barrel (totalis.ts, which re-exports ./src/*) into a single dist
// artifact per format. ESM + CJS + .d.ts so the package is usable from modern
// bundlers/TS and from plain CommonJS Node alike.
export default defineConfig({
  entry: { totalis: "totalis.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // No runtime dependencies are bundled; the core is dependency-free.
  target: "es2022",
});
