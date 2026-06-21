/**
 * "Type as contract" — the totalis wedge, demonstrated as a LIVING, CI-checked
 * artifact. Imagine `User` / `Event` below are generated from OpenAPI / GraphQL
 * / Prisma / a shared package — i.e. authored OUTSIDE your validator. totalis
 * proves the boundary validator matches that contract EXACTLY, and breaks the
 * build the moment the contract drifts.
 *
 * Two kinds of drift below: (1) drift BOTH totalis and Zod catch (a missing
 * required field — the schema's output is no longer assignable to the type),
 * and (2) drift only totalis catches — schemas that stay ASSIGNABLE to the
 * contract (so `satisfies z.ZodType<T>` accepts them) but are not EXACT:
 * a narrower field, a missing enum member, a missing union variant.
 */
import { describe, expectTypeOf, test } from "vitest";

import { enumFor, literal, number, object, schemaFor, string, unionFor, type Infer } from "./totalis";

// ─────────────────────────────────────────────────────────────────────────────
// contract.ts — pretend this block is generated; you do not hand-edit it.
// ─────────────────────────────────────────────────────────────────────────────
interface User {
  id: string;
  email: string;
  role: "admin" | "member";
  profile: { displayName: string; age?: number };
}

type Event =
  | { kind: "signup"; userId: string }
  | { kind: "purchase"; userId: string; amount: number };

// ─────────────────────────────────────────────────────────────────────────────
// validator.ts — your ONE boundary check, pinned to the contract above.
// ─────────────────────────────────────────────────────────────────────────────
const User = schemaFor<User>()({
  id: string(),
  email: string(),
  role: enumFor<User["role"]>()(["admin", "member"]),
  // Nested completeness falls out of the deep per-field equality check.
  profile: schemaFor<User["profile"]>()({
    displayName: string(),
    age: number().optional(),
  }),
});

// unionFor variants are `object(...)` with a literal discriminant; the
// union-level exact check still forces each variant's type to match a member
// of `Event` exactly (an extra/missing field on any variant fails to compile).
const Event = unionFor<Event>()("kind", [
  object({ kind: literal("signup"), userId: string() }),
  object({ kind: literal("purchase"), userId: string(), amount: number() }),
]);

describe("the validator matches the generated contract exactly", () => {
  test("Infer is exactly the contract type — no drift, no widening", () => {
    expectTypeOf<Infer<typeof User>>().toEqualTypeOf<User>();
    expectTypeOf<Infer<typeof Event>>().toEqualTypeOf<Event>();
  });
});

describe("drift BOTH totalis and Zod catch", () => {
  test("a new required field (output no longer assignable to the contract)", () => {
    interface UserV2 extends User {
      verified: boolean; // codegen added this
    }
    // @ts-expect-error — Property 'verified' is missing. (Zod's `satisfies z.ZodType` catches this too.)
    schemaFor<UserV2>()({
      id: string(),
      email: string(),
      role: enumFor<UserV2["role"]>()(["admin", "member"]),
      profile: schemaFor<UserV2["profile"]>()({ displayName: string(), age: number().optional() }),
    });
  });
});

describe("drift ONLY totalis catches — assignable to the contract, but not EXACT", () => {
  // Every schema below is a SUBTYPE of the contract, so `satisfies z.ZodType<T>`
  // (one-directional assignability) accepts it. The per-field/coverage EXACT
  // check rejects it.

  test("a field narrower than the contract", () => {
    schemaFor<User>()({
      id: string(),
      email: string(),
      // @ts-expect-error — "admin" alone is narrower than `"admin" | "member"`; assignable, not exact.
      role: enumFor<"admin">()(["admin"]),
      profile: schemaFor<User["profile"]>()({ displayName: string(), age: number().optional() }),
    });
  });

  test("a new enum member (a narrower enum is still assignable, so Zod misses it)", () => {
    type RoleV2 = User["role"] | "owner"; // codegen added "owner"
    // @ts-expect-error — enum is missing declared member "owner".
    enumFor<RoleV2>()(["admin", "member"]);
  });

  test("a new union variant (a narrower union is still assignable, so Zod misses it)", () => {
    type EventV2 = Event | { kind: "refund"; userId: string; amount: number };
    // @ts-expect-error — union is missing the "refund" variant.
    unionFor<EventV2>()("kind", [
      object({ kind: literal("signup"), userId: string() }),
      object({ kind: literal("purchase"), userId: string(), amount: number() }),
    ]);
  });
});
