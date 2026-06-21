/**
 * intersection produces `A & B` exactly — the output is assignable to both
 * sides, and a primitive intersection keeps the primitive type.
 */
import { describe, expectTypeOf, test } from "vitest";

import { date, intersection, number, object, string, type Infer } from "./totalis";

describe("intersection infers A & B", () => {
  test("two object schemas combine their fields", () => {
    const Row = intersection(object({ id: string() }), object({ createdAt: date() }));
    expectTypeOf<Infer<typeof Row>>().toEqualTypeOf<{ id: string } & { createdAt: Date }>();
  });

  test("the output is assignable to each side", () => {
    const Row = intersection(object({ id: string() }), object({ n: number() }));
    type R = Infer<typeof Row>;
    expectTypeOf<R>().toMatchTypeOf<{ id: string }>();
    expectTypeOf<R>().toMatchTypeOf<{ n: number }>();
  });

  test("a primitive intersection keeps the primitive type", () => {
    const between = intersection(string().min(3), string().max(5));
    expectTypeOf<Infer<typeof between>>().toEqualTypeOf<string>();
  });
});
