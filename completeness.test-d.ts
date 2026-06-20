/**
 * Type-level guarantees for the completeness API (roadmap 3). Validated by
 * `tsc --noEmit`.
 *
 * The improvement over the old `& "Schema does not match T"` marker is that
 * every failure is a NATIVE, per-field error: a missing key, an extra key, a
 * wrong/too-loose field, or an unbranded field where the domain type is
 * branded. Here we assert each of those fails to compile, that valid shapes
 * compile, and that the produced schema's `Infer` is exactly `T`.
 */
import {
  codec,
  number,
  schemaFor,
  string,
  type Branded,
  type Infer,
  type SchemaFor,
} from "./totalis";

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface User {
  name: string;
  age: number;
  nickname?: string;
}

// --- a complete schema compiles and `Infer` is exactly `T` ------------------

const user = schemaFor<User>()({
  name: string(),
  age: number(),
  nickname: string().optional(),
});
type _UserInfer = Expect<Equals<Infer<typeof user>, User>>;

// --- missing field: native "Property '...' is missing" ----------------------

// @ts-expect-error — missing `age` (and `nickname`).
schemaFor<User>()({
  name: string(),
});

// --- wrong/too-loose field: error points at the key ------------------------

schemaFor<User>()({
  name: string(),
  // @ts-expect-error — `age` must decode to `number`, not `string`.
  age: string(),
  nickname: string().optional(),
});

// --- extra field: excess property check fires -------------------------------

schemaFor<User>()({
  name: string(),
  age: number(),
  nickname: string().optional(),
  // @ts-expect-error — `role` is not a key of `User`.
  role: string(),
});

// --- brand guidance: unbranded field where `T` is branded -------------------

type Email = Branded<string, "Email">;
interface Contact {
  email: Email;
}

schemaFor<Contact>()({
  email: string().brand<"Email">(), // ✅ branded
});

schemaFor<Contact>()({
  // @ts-expect-error — plain string is not Schema<Branded<string, "Email">>.
  email: string(),
});

// --- codec fields are allowed (input may differ from T[K]) ------------------

interface Log {
  at: Date;
}
schemaFor<Log>()({
  at: codec(string(), { decode: (s) => new Date(s), encode: (d) => d.toISOString() }),
});

// --- SchemaFor used satisfies-style preserves precise field types -----------

const preserved = {
  email: string().brand<"Email">(),
} satisfies SchemaFor<Contact>;
type _Preserved = Expect<Equals<Infer<typeof preserved.email>, Email>>;

// @ts-expect-error — satisfies also catches a missing field.
const _missing = {} satisfies SchemaFor<Contact>;

export const _completenessWitnesses = [user, preserved, _missing];
