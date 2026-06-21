/**
 * coerce widens the accepted input, so its INPUT type is honestly `unknown`
 * (never the output type) and the OUTPUT type stays precise. It is decode-only:
 * a coerced field cannot enter `objectCodec` — exactly like `transform`.
 */
import { describe, expectTypeOf, test } from "vitest";

import {
  coerce,
  int,
  number,
  objectCodec,
  schemaFor,
  string,
  type Infer,
  type InferInput,
  type Integer,
} from "./totalis";

describe("coerce keeps output precise and input honest", () => {
  test("output is the base's output", () => {
    expectTypeOf<Infer<ReturnType<typeof coerce.number>>>().toEqualTypeOf<number>();
    expectTypeOf<Infer<ReturnType<typeof coerce.string>>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<ReturnType<typeof coerce.boolean>>>().toEqualTypeOf<boolean>();
    expectTypeOf<Infer<ReturnType<typeof coerce.date>>>().toEqualTypeOf<Date>();
  });

  test("input is unknown, not the output type (no silent widening lie)", () => {
    expectTypeOf<InferInput<ReturnType<typeof coerce.number>>>().toEqualTypeOf<unknown>();
    expectTypeOf<InferInput<ReturnType<typeof coerce.string>>>().toEqualTypeOf<unknown>();
  });

  test("a branded base is preserved through coercion", () => {
    const coercedInt = coerce.number(int());
    expectTypeOf<Infer<typeof coercedInt>>().toEqualTypeOf<Integer>();
  });

  test("a coerced field still satisfies exact completeness on its output", () => {
    interface Row {
      id: number;
      name: string;
    }
    const Row = schemaFor<Row>()({ id: coerce.number(), name: coerce.string() });
    expectTypeOf<Infer<typeof Row>>().toEqualTypeOf<Row>();
  });

  test("coerce is decode-only: it cannot enter objectCodec", () => {
    // @ts-expect-error coerce returns a plain Schema (no encode), like transform
    objectCodec({ n: coerce.number() });
    // a real codec field is fine
    objectCodec({ s: string() });
  });
});
