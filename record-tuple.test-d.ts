/**
 * Type-level checks for record / tuple: `Infer` is exact and they satisfy
 * exact completeness (`schemaFor`).
 */
import { describe, expectTypeOf, test } from "vitest";

import { number, record, schemaFor, string, tuple, type Infer } from "./totalis";

describe("Infer is exact", () => {
  test("record is Record<string, V>", () => {
    const r = record(number());
    expectTypeOf<Infer<typeof r>>().toEqualTypeOf<Record<string, number>>();
  });

  test("tuple preserves position and length", () => {
    const t = tuple([string(), number(), string()]);
    expectTypeOf<Infer<typeof t>>().toEqualTypeOf<[string, number, string]>();
  });
});

describe("they satisfy exact completeness", () => {
  interface Doc {
    counts: Record<string, number>;
    pair: [string, number];
  }

  test("schemaFor<Doc>() accepts the matching schemas", () => {
    const Doc = schemaFor<Doc>()({
      counts: record(number()),
      pair: tuple([string(), number()]),
    });
    expectTypeOf<Infer<typeof Doc>>().toEqualTypeOf<Doc>();
  });

  test("a wrong tuple element type is rejected (exact)", () => {
    schemaFor<Doc>()({
      counts: record(number()),
      // @ts-expect-error — [string, string] is not exactly [string, number].
      pair: tuple([string(), string()]),
    });
  });

  test("a record of the wrong value type is rejected (exact)", () => {
    schemaFor<Doc>()({
      // @ts-expect-error — Record<string, string> is not exactly Record<string, number>.
      counts: record(string()),
      pair: tuple([string(), number()]),
    });
  });
});
