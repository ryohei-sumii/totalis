import type { Shape } from "./collections";
import { ObjectSchema } from "./collections";
import type { Literal } from "./primitives";
import { LiteralSchema } from "./primitives";
import type { Infer } from "./schema";
import { Codec, Schema } from "./schema";
import type { Internal } from "./util";
import { fail, ok, typeName } from "./util";

// ---------------------------------------------------------------------------
// Exhaustive discriminated unions
//
// Totality, pillar 3: adding a variant must force every consumer to handle it.
// `discriminatedUnion` parses by a literal tag; {@link match} (or a `switch` +
// {@link assertNever}) then makes "forgot a case" a COMPILE error, replacing
// the runtime `default: throw new Error("unexpected")` guard.
// ---------------------------------------------------------------------------

/** Any object schema whose `[key]` field is a literal — a union variant. */
type Variant<K extends string> = ObjectSchema<Shape & { readonly [P in K]: LiteralSchema<Literal> }>;

class DiscriminatedUnionSchema<Out> extends Schema<Out> {
  /** Maps each discriminant value to its variant for O(1), unambiguous dispatch. */
  private readonly byTag = new Map<Literal, ObjectSchema<Shape>>();

  constructor(
    readonly key: string,
    readonly variants: ReadonlyArray<ObjectSchema<Shape>>,
  ) {
    super();
    for (const variant of variants) {
      const discriminant = variant.shape[key];
      if (!(discriminant instanceof LiteralSchema)) {
        throw new Error(
          `discriminatedUnion: every variant must have a literal "${key}" field`,
        );
      }
      // A duplicate discriminant would make a variant the output type claims is
      // valid permanently unreachable — reject it at construction instead.
      if (this.byTag.has(discriminant.value)) {
        throw new Error(
          `discriminatedUnion: duplicate discriminant ${JSON.stringify(discriminant.value)} for "${key}"`,
        );
      }
      this.byTag.set(discriminant.value, variant);
    }
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Out> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return fail(path, "invalid_type", { expected: "object", received: typeName(input) });
    }
    const tag = (input as Record<string, unknown>)[this.key];
    const variant = this.byTag.get(tag as Literal);
    if (variant) return variant._parse(input, path) as Internal<Out>;
    const options = [...this.byTag.keys()].map((value) => JSON.stringify(value)).join(" | ");
    return fail([...path, this.key], "invalid_union", { options, received: tag });
  }
}

/**
 * A discriminated union of object schemas keyed by the literal field `key`.
 * The output type is the union of every variant's type.
 */
export function discriminatedUnion<K extends string, V extends ReadonlyArray<Variant<K>>>(
  key: K,
  variants: V,
): Schema<Infer<V[number]>> {
  return new DiscriminatedUnionSchema<Infer<V[number]>>(
    key,
    variants as ReadonlyArray<ObjectSchema<Shape>>,
  );
}

/** A non-discriminated union: accepts the first member that parses. */
class UnionSchema<Out> extends Schema<Out> {
  constructor(readonly members: ReadonlyArray<Schema<unknown>>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Out> {
    for (const member of this.members) {
      const result = member._parse(input, path);
      if (result.ok) return result as Internal<Out>;
    }
    return fail(path, "invalid_union", { members: this.members.length });
  }
}

/**
 * A non-discriminated union — `union([a, b])` accepts a value that any member
 * validates, in order. The output type is the union of the members' types.
 *
 * First match wins, so ORDER matters when members overlap: since `object(...)`
 * ignores extra keys, a broader value can match a narrower object member first
 * (and lose the extra fields). On no match it reports a single `invalid_union`
 * issue (member errors are not aggregated). For unions keyed by a literal
 * discriminant, prefer {@link discriminatedUnion} (faster, precise errors); for
 * exhaustive coverage of a declared union, see {@link unionFor}.
 */
export function union<M extends ReadonlyArray<Schema<unknown>>>(
  members: M,
): Schema<Infer<M[number]>> {
  return new UnionSchema<Infer<M[number]>>(members as ReadonlyArray<Schema<unknown>>);
}

/** Accepts exactly the literal values it was built with (a closed enum). */
class LiteralUnionSchema<T extends Literal> extends Codec<T> {
  constructor(readonly values: readonly T[]) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T> {
    for (const value of this.values) {
      // Match by SameValueZero (so NaN matches), and return the CANONICAL stored
      // member — mirroring LiteralSchema, so a declared `0` never echoes `-0`.
      const matches =
        value === input ||
        (typeof value === "number" &&
          Number.isNaN(value) &&
          typeof input === "number" &&
          Number.isNaN(input));
      if (matches) return ok(value);
    }
    const options = this.values.map((value) => JSON.stringify(value)).join(" | ");
    return fail(path, "invalid_value", { options, received: input });
  }

  encode(value: T): T {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Exhaustive completeness for unions/enums (the Zod wedge, extended)
//
// Like `schemaFor<T>` for objects: you declare the domain union/enum `T`
// independently, and the schema must cover it EXACTLY. Add a member to `T` and
// the schema fails to compile until it is covered. Zod infers unions FROM the
// schema (schema -> type), so it cannot enforce coverage of a declared union.
// ---------------------------------------------------------------------------

type EnumMissing<M extends Literal> = `✗ enum is missing declared member: ${M}`;
type UnionMissing<M> = { readonly "✗ union is missing declared variant(s)": M };
type UnionExtra<M> = { readonly "✗ union has a variant not in the declared type": M };

/**
 * Build a closed-enum schema that covers the literal union `T` EXACTLY. A
 * missing member fails to compile (naming it); a value not in `T` fails too.
 * `Infer` is exactly `T`.
 *
 * @example
 *   type Role = "admin" | "user" | "guest";
 *   const Role = enumFor<Role>()(["admin", "user", "guest"]);
 */
export function enumFor<T extends Literal>() {
  return <const L extends readonly T[]>(
    values: L & ([Exclude<T, L[number]>] extends [never] ? unknown : EnumMissing<Exclude<T, L[number]>>),
  ): Codec<T> => new LiteralUnionSchema<T>(values as readonly T[]);
}

/**
 * Build a discriminated-union schema that covers the declared union `T`
 * EXACTLY. A missing variant (or a variant whose type is not in `T`) fails to
 * compile; `Infer` is exactly `T`. Runtime dispatch + duplicate-discriminant
 * checks come from {@link discriminatedUnion}.
 *
 * @example
 *   type Shape = { kind: "circle"; r: number } | { kind: "square"; s: number };
 *   const Shape = unionFor<Shape>()("kind", [
 *     object({ kind: literal("circle"), r: number() }),
 *     object({ kind: literal("square"), s: number() }),
 *   ]);
 */
export function unionFor<T>() {
  return <K extends string, V extends ReadonlyArray<Variant<K>>>(
    key: K,
    variants: V &
      ([Exclude<T, Infer<V[number]>>] extends [never]
        ? [Exclude<Infer<V[number]>, T>] extends [never]
          ? unknown
          : UnionExtra<Exclude<Infer<V[number]>, T>>
        : UnionMissing<Exclude<T, Infer<V[number]>>>),
  ): Schema<T> => discriminatedUnion(key, variants as V) as unknown as Schema<T>;
}

// ---------------------------------------------------------------------------
// First-class exhaustiveness helpers
// ---------------------------------------------------------------------------

/**
 * Compile-time exhaustiveness guard. Call in the `default` branch of a `switch`
 * over a discriminated union: if a variant is left unhandled, `value` is not
 * `never` and the call fails to compile.
 */
export function assertNever(value: never, message = "Unhandled variant"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/**
 * Exhaustively match a discriminated value on its `key`. The compiler REQUIRES
 * a handler for every discriminant value — add a variant and every `match`
 * call site stops compiling until it is handled.
 */
export function match<K extends PropertyKey, T extends Record<K, string | number>, R>(
  value: T,
  key: K,
  handlers: { [V in T[K]]: (value: Extract<T, Record<K, V>>) => R },
): R {
  const tag = value[key];
  // The type system guarantees a handler for every static tag; this guards the
  // case where `value` reached us via a cast / unvalidated JSON with an
  // out-of-range tag. Use an OWN-property check so a tag colliding with an
  // Object.prototype member (e.g. "toString", "constructor") is rejected rather
  // than silently invoking the inherited method.
  const handler = Object.prototype.hasOwnProperty.call(handlers, tag) ? handlers[tag] : undefined;
  if (typeof handler !== "function") {
    throw new Error(`match: no handler for ${String(key)}=${JSON.stringify(tag)}`);
  }
  return handler(value as Extract<T, Record<K, T[K]>>);
}
