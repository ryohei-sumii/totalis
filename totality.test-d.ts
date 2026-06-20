/**
 * Type-level guarantees for the totality thesis. Validated by `tsc --noEmit`.
 *
 * These assertions ARE the product: brands make unvalidated values
 * unrepresentable, `schemaFor` refuses to drift from a branded domain type,
 * and `match` forces every union variant to be handled.
 */
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

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// --- brands: the output type carries the brand ------------------------------

type Email = Branded<string, "Email">;
const emailSchema = string().brand<"Email">();
type _Email = Expect<Equals<Infer<typeof emailSchema>, Email>>;

declare function sendTo(email: Email): void;
const validated = emailSchema.parse("a@b.com");
sendTo(validated); // ✅ a validated value is branded

// @ts-expect-error — a raw string is NOT an Email: you cannot skip validation.
sendTo("a@b.com");

// --- int / nonempty: precise output types -----------------------------------

type _Int = Expect<Equals<Infer<ReturnType<typeof int>>, Integer>>;
const nonEmpty = array(number()).nonempty();
type _NonEmpty = Expect<Equals<Infer<typeof nonEmpty>, NonEmptyArray<number>>>;

// --- completeness now enforces brands ---------------------------------------

interface Account {
  id: Branded<string, "AccountId">;
  email: Email;
}

// ✅ the schema must produce the branded fields to satisfy `Account`.
schemaFor<Account>()({
  id: string().brand<"AccountId">(),
  email: string().brand<"Email">(),
});

// @ts-expect-error — a plain `string()` drifts from the branded domain type.
schemaFor<Account>()({
  id: string(),
  email: string().brand<"Email">(),
});

// --- discriminatedUnion infers the exact union ------------------------------

const shape = discriminatedUnion("kind", [
  object({ kind: literal("a"), value: number() }),
  object({ kind: literal("b"), label: string() }),
]);
type _Union = Expect<
  Equals<
    Infer<typeof shape>,
    { kind: "a"; value: number } | { kind: "b"; label: string }
  >
>;

// --- match: exhaustiveness is compile-enforced ------------------------------

type Event =
  | { type: "click"; x: number }
  | { type: "key"; code: string };

const describe = (event: Event): string =>
  match(event, "type", {
    click: (c) => `click ${c.x}`,
    key: (k) => `key ${k.code}`,
  });

// Missing the "key" handler: adding/keeping a variant forces every match call
// site to handle it.
const incomplete = (event: Event): string =>
  // @ts-expect-error — exhaustiveness is enforced: the "key" handler is required.
  match(event, "type", {
    click: (c) => `click ${c.x}`,
  });

export const _totalityWitnesses = [validated, describe, incomplete];
