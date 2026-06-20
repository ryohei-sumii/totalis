/**
 * Type-level guarantees for the completeness API (roadmap 3), as vitest type
 * tests.
 *
 * Every failure is a NATIVE, per-field error: a missing key, an extra key, a
 * wrong/too-loose field, or an unbranded field where the domain type is
 * branded. Here we assert each fails to compile, that valid shapes compile,
 * and that the produced schema's `Infer` is exactly `T`.
 */
import { describe, expectTypeOf, test } from "vitest";

import {
  codec,
  number,
  schemaFor,
  string,
  type Branded,
  type Infer,
  type SchemaFor,
} from "./totalis";

interface User {
  name: string;
  age: number;
  nickname?: string;
}

type Email = Branded<string, "Email">;
interface Contact {
  email: Email;
}

describe("schemaFor builds a schema whose Infer is exactly T", () => {
  test("complete shape compiles and infers T", () => {
    const user = schemaFor<User>()({
      name: string(),
      age: number(),
      nickname: string().optional(),
    });
    expectTypeOf<Infer<typeof user>>().toEqualTypeOf<User>();
  });
});

describe("incompleteness is a native per-field error", () => {
  test("missing field", () => {
    // @ts-expect-error — missing `age` (and `nickname`).
    schemaFor<User>()({ name: string() });
  });

  test("wrong / too-loose field", () => {
    schemaFor<User>()({
      name: string(),
      // @ts-expect-error — `age` must decode to `number`, not `string`.
      age: string(),
      nickname: string().optional(),
    });
  });

  test("extra field", () => {
    schemaFor<User>()({
      name: string(),
      age: number(),
      nickname: string().optional(),
      // @ts-expect-error — `role` is not a key of `User`.
      role: string(),
    });
  });
});

describe("brand guidance", () => {
  test("branded field compiles", () => {
    const contact = schemaFor<Contact>()({ email: string().brand<"Email">() });
    expectTypeOf<Infer<typeof contact>>().toEqualTypeOf<Contact>();
  });

  test("a plain string() where T is branded fails to compile", () => {
    schemaFor<Contact>()({
      // @ts-expect-error — plain string is not Schema<Branded<string, "Email">>.
      email: string(),
    });
  });
});

describe("codec fields are allowed (input may differ from T[K])", () => {
  test("a Date field backed by an ISO-string codec", () => {
    interface Log {
      at: Date;
    }
    const log = schemaFor<Log>()({
      at: codec(string(), { decode: (s) => new Date(s), encode: (d) => d.toISOString() }),
    });
    expectTypeOf<Infer<typeof log>>().toEqualTypeOf<Log>();
  });
});

describe("SchemaFor used satisfies-style preserves precise field types", () => {
  test("a branded field keeps its branded Infer", () => {
    const preserved = {
      email: string().brand<"Email">(),
    } satisfies SchemaFor<Contact>;
    expectTypeOf<Infer<typeof preserved.email>>().toEqualTypeOf<Email>();
  });

  test("satisfies still catches a missing field", () => {
    // @ts-expect-error — missing `email`.
    const _missing = {} satisfies SchemaFor<Contact>;
  });
});
