import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Type-level correctness IS the product, so type tests run alongside the
    // runtime tests: `*.test-d.ts` are typechecked (and their `@ts-expect-error`
    // negatives exercised) as part of `npm test`.
    typecheck: {
      enabled: true,
      checker: "tsc",
      tsconfig: "./tsconfig.json",
      include: ["**/*.test-d.ts"],
    },
    include: ["**/*.test.ts"],
  },
});
