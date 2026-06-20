/**
 * Type-level guarantees for the two-param `Schema<Output, Input>` (roadmap 2),
 * as vitest type tests.
 *
 *   - transform / default / codec are type-safe: Output and Input diverge
 *     exactly as expected, and `Infer` / `InferInput` recover both.
 *   - codecs are bidirectional and round-trip-typed; transformed schemas are
 *     decode-only — calling `.encode()` on one must NOT compile.
 */
import { assertType, describe, expectTypeOf, test } from "vitest";
import type { StandardSchemaV1 as OfficialStandardSchemaV1 } from "@standard-schema/spec";

import { codec, number, string, type Infer, type InferInput } from "./totalis";

const len = string().transform((s) => s.length);
const withDefault = number().default(1);
const isoDate = codec(string(), {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
});

describe("transform: Output changes, Input is preserved", () => {
  test("Infer / InferInput", () => {
    expectTypeOf<Infer<typeof len>>().toEqualTypeOf<number>();
    expectTypeOf<InferInput<typeof len>>().toEqualTypeOf<string>();
  });

  test("a transformed schema is decode-only (no encode)", () => {
    // @ts-expect-error — transform is one-directional; `encode` does not exist.
    len.encode(5);
  });
});

describe("default: Input gains undefined, Output does not", () => {
  test("Infer / InferInput", () => {
    expectTypeOf<Infer<typeof withDefault>>().toEqualTypeOf<number>();
    expectTypeOf<InferInput<typeof withDefault>>().toEqualTypeOf<number | undefined>();
  });
});

describe("codec: bidirectional and typed in both directions", () => {
  test("Infer / InferInput", () => {
    expectTypeOf<Infer<typeof isoDate>>().toEqualTypeOf<Date>();
    expectTypeOf<InferInput<typeof isoDate>>().toEqualTypeOf<string>();
  });

  test("parse decodes to Output, encode maps Output -> Input", () => {
    expectTypeOf(isoDate.parse("2026-06-20T00:00:00.000Z")).toEqualTypeOf<Date>();
    expectTypeOf(isoDate.encode(new Date(0))).toEqualTypeOf<string>();
  });

  test("encode rejects a wrong-typed argument", () => {
    // @ts-expect-error — encode takes the Output type (Date), not a string.
    isoDate.encode("2026-06-20");
  });
});

describe("Standard Schema reflects the input/output split", () => {
  test("InferInput / InferOutput", () => {
    expectTypeOf<OfficialStandardSchemaV1.InferOutput<typeof isoDate>>().toEqualTypeOf<Date>();
    expectTypeOf<OfficialStandardSchemaV1.InferInput<typeof isoDate>>().toEqualTypeOf<string>();
    assertType<OfficialStandardSchemaV1<string, Date>>(isoDate);
  });
});
