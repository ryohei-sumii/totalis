/**
 * Type-level guarantees for the totality thesis, as vitest type tests.
 *
 * These assertions ARE the product: brands make unvalidated values
 * unrepresentable, `schemaFor` refuses to drift from a branded domain type,
 * and `match` forces every union variant to be handled.
 */
import { describe, expectTypeOf, test } from "vitest";

import {
  array,
  discriminatedUnion,
  int,
  literal,
  match,
  number,
  object,
  schemaFor,
  string,
  type Branded,
  type Infer,
  type Integer,
  type NonEmptyArray,
} from "./totalis";

type Email = Branded<string, "Email">;
const nonEmpty = array(number()).nonempty();

describe("brands carry the invariant into the output type", () => {
  test("a branded schema infers the branded type", () => {
    const emailSchema = string().brand<"Email">();
    expectTypeOf<Infer<typeof emailSchema>>().toEqualTypeOf<Email>();
  });

  test("a validated value is an Email; a raw string is not", () => {
    const emailSchema = string().brand<"Email">();
    const sendTo = (_email: Email): void => {};
    sendTo(emailSchema.parse("a@b.com")); // ✅
    // @ts-expect-error — a raw string is not an Email: you cannot skip validation.
    sendTo("a@b.com");
  });
});

describe("refinements produce precise output types", () => {
  test("int and nonempty", () => {
    expectTypeOf<Infer<ReturnType<typeof int>>>().toEqualTypeOf<Integer>();
    expectTypeOf<Infer<typeof nonEmpty>>().toEqualTypeOf<NonEmptyArray<number>>();
  });
});

describe("completeness is strengthened by brands", () => {
  interface Account {
    id: Branded<string, "AccountId">;
    email: Email;
  }

  test("a schema must produce the branded fields", () => {
    const account = schemaFor<Account>()({
      id: string().brand<"AccountId">(),
      email: string().brand<"Email">(),
    });
    expectTypeOf<Infer<typeof account>>().toEqualTypeOf<Account>();
  });

  test("a plain string() drifts from the branded domain type", () => {
    schemaFor<Account>()({
      // @ts-expect-error — not assignable to Schema<Branded<string, "AccountId">>.
      id: string(),
      email: string().brand<"Email">(),
    });
  });
});

describe("discriminatedUnion infers the exact union", () => {
  test("union of variants", () => {
    const shape = discriminatedUnion("kind", [
      object({ kind: literal("a"), value: number() }),
      object({ kind: literal("b"), label: string() }),
    ]);
    expectTypeOf<Infer<typeof shape>>().toEqualTypeOf<
      { kind: "a"; value: number } | { kind: "b"; label: string }
    >();
  });
});

describe("match enforces exhaustiveness at compile time", () => {
  type Event = { type: "click"; x: number } | { type: "key"; code: string };

  test("all handlers present compiles", () => {
    const describeEvent = (event: Event): string =>
      match(event, "type", {
        click: (c) => `click ${c.x}`,
        key: (k) => `key ${k.code}`,
      });
    expectTypeOf(describeEvent).returns.toEqualTypeOf<string>();
  });

  test("a missing handler fails to compile", () => {
    const _incomplete = (event: Event): string =>
      // @ts-expect-error — the "key" handler is required.
      match(event, "type", {
        click: (c) => `click ${c.x}`,
      });
  });
});
