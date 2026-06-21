/**
 * pick / omit / partial / extend / merge derive a NEW schema whose `Infer`
 * stays exactly in lockstep with the corresponding `Pick` / `Omit` / `Partial`
 * of the source type — so a derived boundary schema can never drift from the
 * derived type it claims to validate.
 */
import { describe, expectTypeOf, test } from "vitest";

import { number, object, schemaFor, string, type Infer } from "./totalis";

const User = object({
  id: string(),
  name: string(),
  age: number(),
});
type User = Infer<typeof User>;

describe("object utilities keep Infer exact", () => {
  test("pick yields Pick", () => {
    expectTypeOf<Infer<ReturnType<typeof User.pick<"id" | "name">>>>().toEqualTypeOf<{
      id: string;
      name: string;
    }>();
  });

  test("omit yields Omit", () => {
    expectTypeOf<Infer<ReturnType<typeof User.omit<"age">>>>().toEqualTypeOf<{
      id: string;
      name: string;
    }>();
  });

  test("partial makes every key optional", () => {
    expectTypeOf<Infer<ReturnType<typeof User.partial>>>().toEqualTypeOf<{
      id?: string;
      name?: string;
      age?: number;
    }>();
  });

  test("extend adds fields and overrides on collision", () => {
    const Extended = User.extend({ admin: number(), age: string() });
    expectTypeOf<Infer<typeof Extended>>().toEqualTypeOf<{
      id: string;
      name: string;
      age: string; // overridden number -> string
      admin: number;
    }>();
  });

  test("merge combines two object schemas", () => {
    const Merged = User.merge(object({ createdAt: string() }));
    expectTypeOf<Infer<typeof Merged>>().toEqualTypeOf<{
      id: string;
      name: string;
      age: number;
      createdAt: string;
    }>();
  });
});

describe("derived schemas satisfy EXACT completeness against the derived type", () => {
  test("a picked schema matches Pick<User, ...> exactly", () => {
    type Summary = Pick<User, "id" | "name">;
    const Summary = schemaFor<Summary>()(User.pick(["id", "name"]).shape);
    expectTypeOf<Infer<typeof Summary>>().toEqualTypeOf<Summary>();
  });
});
