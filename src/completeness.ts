import type { Shape } from "./collections";
import { ObjectSchema } from "./collections";
import type { Codec, Infer } from "./schema";
import { codec, Schema } from "./schema";

/** Strict, non-distributive type equality. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Surfaced when the base schema doesn't decode EXACTLY to the declared `Encoded` type. */
type EncodedMismatch<Encoded> = {
  readonly "✗ base must decode EXACTLY to the declared Encoded type": Encoded;
};

/**
 * Build a {@link Codec} that pins both ends of a serialization boundary to
 * independently-declared contract types: `Decoded` (your domain model) and
 * `Encoded` (the wire format). The `base` schema must validate the wire format
 * EXACTLY as `Encoded` — its inferred type must *equal* `Encoded` (`Equals`,
 * not mere assignability) — so a too-narrow base, or a drift in the wire
 * contract, fails to compile. `decode` / `encode` are then type-checked in both
 * directions against `Encoded` and `Decoded`.
 *
 * (The exact, drift-proof check is on the `Encoded`/wire side — the side with a
 * schema to verify. The `Decoded` side is the declared output type of `decode`,
 * type-safe but not separately verified, since `decode` is an arbitrary
 * function.)
 *
 * This is the wedge Zod's `z.codec` cannot express: Zod infers the input type
 * from the base schema, so it cannot verify the base against an independently-
 * authored `Encoded` contract.
 *
 * @example
 *   interface WireUser { createdAt: string }   // from the API contract
 *   interface User { createdAt: Date }          // your domain model
 *   const User = codecFor<User, WireUser>()(
 *     schemaFor<WireUser>()({ createdAt: string() }),
 *     {
 *       decode: (w) => ({ createdAt: new Date(w.createdAt) }),
 *       encode: (u) => ({ createdAt: u.createdAt.toISOString() }),
 *     },
 *   );
 */
export function codecFor<Decoded, Encoded>() {
  // base is constrained to Schema<Encoded, Encoded> (a plain validator of the
  // wire format) — NOT Schema<Encoded, unknown> — so a transforming codec base
  // (whose INPUT differs from Encoded) is rejected; otherwise the produced
  // codec's InferInput would lie about what `parse` actually accepts.
  return <B extends Schema<Encoded, Encoded>>(
    base: B & (Equals<Infer<B>, Encoded> extends true ? unknown : EncodedMismatch<Encoded>),
    transform: { decode: (input: Encoded) => Decoded; encode: (output: Decoded) => Encoded },
  ): Codec<Decoded, Encoded> => codec(base as Schema<Encoded>, transform);
}

// ---------------------------------------------------------------------------
// Completeness API
//
// Promise 1: a schema cannot drift from the type it claims to validate. Our
// differentiator vs Zod's `schema satisfies z.ZodType<T>` is EXACTNESS: that
// check is one-directional assignability (schema output must be ASSIGNABLE to
// `T`), so it silently accepts a schema that is NARROWER than `T` — a
// `literal("admin")` for a `string` field, a branded value for a plain field,
// or a required schema for an optional key. `schemaFor<T>()` instead demands a
// per-field EXACT match (`Equals<Infer, T[K]>`) and names the drifting field.
// ---------------------------------------------------------------------------

/** Readable per-field diagnostics surfaced in the completeness error. */
type FieldMismatch<K extends PropertyKey> =
  `✗ field '${K & string}' must validate EXACTLY the declared type (too loose, too narrow, branded, or optional-mismatch)`;
type ExtraField<K extends PropertyKey> =
  `✗ '${K & string}' is not a field of the declared type`;

/**
 * The shape a schema for `T` must have: for every key of `T` (optional keys
 * included), a schema that DECODES to that field's type. The `unknown` input
 * means the per-field schema may be a {@link codec} whose input representation
 * differs from `T[K]`.
 *
 * This is the ASSIGNABILITY-based (Zod-parity) variant — like
 * `satisfies z.ZodType<T>`, it accepts a schema whose output is assignable to
 * `T` (so a more-precise/branded field is allowed). Use it `satisfies`-style
 * to check a shape while KEEPING its precise field types. For the stricter,
 * drift-proof EXACT check, use {@link schemaFor}.
 *
 * @example
 *   const shape = {
 *     id: string().brand<"UserId">(),
 *     name: string(),
 *   } satisfies SchemaFor<User>;
 *   const user = object(shape);
 */
export type SchemaFor<T> = { [K in keyof T]-?: Schema<T[K], unknown> };

/**
 * The EXACT expected shape for `T`: each provided field schema is accepted
 * as-is only when its output type is EXACTLY `T[K]`; otherwise it is replaced
 * by a readable {@link FieldMismatch} message, and any extra key by
 * {@link ExtraField}. Self-referential over the inferred `S` so the error
 * lands on the exact offending field.
 */
type ExactSchemaFor<T, S extends SchemaFor<T>> = {
  [K in keyof T]-?: Equals<Infer<S[K]>, T[K]> extends true ? S[K] : FieldMismatch<K>;
} & {
  [K in Exclude<keyof S, keyof T>]: ExtraField<K>;
};

/**
 * The completeness primitive: build an object schema whose inferred type is
 * EXACTLY `T` — not merely assignable to it. A missing, extra, wrong,
 * too-loose, too-narrow (e.g. an unintended brand or literal), or
 * optional-mismatched field fails to compile with a message naming the field.
 * The resulting schema's `Infer` is exactly `T`.
 *
 * Unlike `satisfies z.ZodType<T>` (and {@link SchemaFor}), this rejects a
 * schema that is merely a subtype of `T`, so your domain type and your
 * validator can never silently disagree.
 *
 * @example
 *   interface User { name: string; age: number }
 *   const user = schemaFor<User>()({ name: string(), age: number() });
 */
export function schemaFor<T>() {
  // The cast is justified by the per-field `Equals` check in ExactSchemaFor:
  // every field's output is exactly `T[K]`, so the ObjectSchema decodes to `T`.
  return <S extends SchemaFor<T>>(shape: S & ExactSchemaFor<T, S>): Schema<T> =>
    new ObjectSchema(shape as unknown as Shape) as unknown as Schema<T>;
}
