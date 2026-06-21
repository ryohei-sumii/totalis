/**
 * Refinements narrow at runtime but keep the static type `string` / `number`
 * (no brand), so they chain, stay encodable, and satisfy exact completeness.
 */
import { describe, expectTypeOf, test } from "vitest";

import { codec, number, object, objectCodec, schemaFor, string, type Infer } from "./totalis";

describe("refinements keep the base type", () => {
  test("string refinements infer string", () => {
    expectTypeOf<Infer<ReturnType<ReturnType<typeof string>["email"]>>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof chained>>().toEqualTypeOf<string>();
  });

  test("number refinements infer number", () => {
    expectTypeOf<Infer<typeof port>>().toEqualTypeOf<number>();
  });

  test("a refined field still satisfies exact completeness", () => {
    interface User {
      email: string;
      age: number;
    }
    const User = schemaFor<User>()({ email: string().email(), age: number().min(0) });
    expectTypeOf<Infer<typeof User>>().toEqualTypeOf<User>();
  });

  test("refinements stay encodable (usable in objectCodec)", () => {
    const rec = objectCodec({ name: string().min(1) });
    expectTypeOf<Infer<typeof rec>>().toEqualTypeOf<{ name: string }>();
    // also composes with a real codec field
    const rec2 = objectCodec({
      name: string().min(1),
      at: codec(string(), { decode: (s) => new Date(s), encode: (d) => d.toISOString() }),
    });
    expectTypeOf<Infer<typeof rec2>>().toEqualTypeOf<{ name: string; at: Date }>();
  });
});

const chained = string().min(2).max(4).regex(/x/);
const port = number().min(1).max(65535);
