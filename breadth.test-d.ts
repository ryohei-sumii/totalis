/**
 * Type-level checks for the breadth primitives (union / nullable / date):
 * `Infer` is exact, they compose in objects, and they satisfy exact
 * completeness (`schemaFor`).
 */
import { describe, expectTypeOf, test } from "vitest";

import {
  date,
  nullable,
  number,
  object,
  schemaFor,
  string,
  union,
  type Infer,
} from "./totalis";

describe("Infer is exact", () => {
  test("date", () => {
    expectTypeOf<Infer<ReturnType<typeof date>>>().toEqualTypeOf<Date>();
  });

  test("nullable (method and standalone)", () => {
    expectTypeOf<Infer<ReturnType<ReturnType<typeof string>["nullable"]>>>().toEqualTypeOf<
      string | null
    >();
    const n = nullable(number());
    expectTypeOf<Infer<typeof n>>().toEqualTypeOf<number | null>();
  });

  test("union is the union of its members", () => {
    const u = union([string(), number(), date()]);
    expectTypeOf<Infer<typeof u>>().toEqualTypeOf<string | number | Date>();
  });
});

describe("they compose and satisfy exact completeness", () => {
  interface Row {
    id: string;
    note: string | null;
    value: string | number;
    createdAt: Date;
  }

  test("schemaFor<Row>() accepts the matching breadth schemas", () => {
    const Row = schemaFor<Row>()({
      id: string(),
      note: string().nullable(),
      value: union([string(), number()]),
      createdAt: date(),
    });
    expectTypeOf<Infer<typeof Row>>().toEqualTypeOf<Row>();
  });

  test("a non-null schema where the contract is nullable is rejected (exact)", () => {
    schemaFor<Row>()({
      id: string(),
      // @ts-expect-error — `string()` is not exactly `string | null`.
      note: string(),
      value: union([string(), number()]),
      createdAt: date(),
    });
  });
});
