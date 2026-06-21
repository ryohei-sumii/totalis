/**
 * Type-level guarantees for exhaustive union/enum completeness — the exact
 * wedge extended to unions. `satisfies z.ZodType<T>` (assignability) cannot
 * enforce that a schema COVERS a declared union/enum; these do.
 */
import { describe, expectTypeOf, test } from "vitest";

import { enumFor, literal, number, object, unionFor, type Infer } from "./totalis";

type Role = "admin" | "user" | "guest";

describe("enumFor covers a literal union exactly", () => {
  test("a complete enum compiles and Infer is exactly the union", () => {
    const role = enumFor<Role>()(["admin", "user", "guest"]);
    expectTypeOf<Infer<typeof role>>().toEqualTypeOf<Role>();
  });

  test("a missing member fails to compile", () => {
    // @ts-expect-error — missing "guest"; the enum does not cover Role.
    enumFor<Role>()(["admin", "user"]);
  });

  test("a value not in the union fails to compile", () => {
    // @ts-expect-error — "root" is not a member of Role.
    enumFor<Role>()(["admin", "user", "guest", "root"]);
  });
});

type Shape = { kind: "circle"; r: number } | { kind: "square"; s: number };
const circle = object({ kind: literal("circle"), r: number() });
const square = object({ kind: literal("square"), s: number() });

describe("unionFor covers a discriminated union exactly", () => {
  test("a complete union compiles and Infer is exactly the union", () => {
    const shape = unionFor<Shape>()("kind", [circle, square]);
    expectTypeOf<Infer<typeof shape>>().toEqualTypeOf<Shape>();
  });

  test("a missing variant fails to compile", () => {
    // @ts-expect-error — the "square" variant is not covered.
    unionFor<Shape>()("kind", [circle]);
  });

  test("a variant not in the declared union fails to compile", () => {
    const triangle = object({ kind: literal("triangle"), base: number() });
    // @ts-expect-error — "triangle" is a variant not in Shape (UnionExtra).
    unionFor<Shape>()("kind", [circle, square, triangle]);
  });
});
