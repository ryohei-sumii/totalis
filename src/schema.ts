import { ValidationError } from "./errors";
import type { StandardSchemaV1 } from "./standard-schema";
import { VENDOR } from "./standard-schema";
import type { Internal } from "./util";
import { fail, ok } from "./util";

// ---------------------------------------------------------------------------
// Brands & precise output types
//
// Totality, pillar 2: the OUTPUT type should be the narrowest type that is
// true, so that downstream code physically cannot represent a bug. A brand is
// a type-level marker that only this library can attach (by validating). A
// `Branded<string, "Email">` cannot be produced from a raw string, so a
// function that takes an `Email` can never be handed an unvalidated value —
// the "did I check this?" defensive guard disappears at compile time.
// ---------------------------------------------------------------------------

declare const brand: unique symbol;

/** A type-level brand. Purely erased at runtime. */
export type Brand<B extends string> = { readonly [brand]: { readonly [K in B]: true } };

/** `T` carrying the brand `B`. Two brands compose: `Branded<Branded<T, "a">, "b">`. */
export type Branded<T, B extends string> = T & Brand<B>;

/** A non-empty array — the precise type a length check earns you. */
export type NonEmptyArray<T> = [T, ...T[]];

/** The discriminated result returned by {@link Schema.safeParse}. */
export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ValidationError };

// ---------------------------------------------------------------------------
// Schema base
// ---------------------------------------------------------------------------

/**
 * The abstract base of every schema.
 *
 * Two type params: `Output` is the decoded/validated type you get out (what
 * 95% of code wants, so it comes first and `Input` defaults to it — the
 * single-arg `Schema<T>` still means `Schema<T, T>`). `Input` is the type the
 * schema decodes FROM; it only diverges from `Output` for `transform` /
 * `default` / `codec`.
 *
 * `_output` / `_input` are phantom fields: they carry the types at the type
 * level without ever existing at runtime. {@link Infer} / {@link InferInput}
 * recover them.
 *
 * Implementing `StandardSchemaV1<Input, Output>` makes every schema plug into
 * the Standard Schema ecosystem (tRPC, Hono, React Hook Form, ...) for free;
 * `validate` is the DECODE direction (`Input -> Output`).
 */
export abstract class Schema<Output, Input = Output> implements StandardSchemaV1<Input, Output> {
  declare readonly _output: Output;
  declare readonly _input: Input;

  /** Validate (decode) `input`, threading `path` for nested error reporting. */
  abstract _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Output>;

  /** Validate and return the value, throwing {@link ValidationError} on failure. */
  parse(input: unknown): Output {
    const result = this._parse(input, []);
    if (result.ok) return result.value;
    throw new ValidationError(result.issues);
  }

  /** Validate and return a discriminated result instead of throwing. */
  safeParse(input: unknown): ParseResult<Output> {
    const result = this._parse(input, []);
    return result.ok
      ? { success: true, data: result.value }
      : { success: false, error: new ValidationError(result.issues) };
  }

  /** Make this schema also accept `undefined`, producing an optional object key. */
  optional(): Schema<Output | undefined, Input | undefined> {
    return new OptionalSchema<Output, Input>(this);
  }

  /** Make this schema also accept `null`, producing `T | null` (a {@link Codec} stays encodable). */
  nullable(): Schema<Output | null, Input | null> {
    return new NullableSchema<Output, Input>(this);
  }

  /**
   * Attach a type-level {@link Brand} to the validated output. The brand is
   * erased at runtime; the runtime value is unchanged. The point is the type:
   * only a value that passed THIS schema can have the brand, so downstream
   * code can require the branded type instead of re-checking.
   */
  brand<B extends string>(): Schema<Branded<Output, B>, Input> {
    return new BrandSchema<Output, B, Input>(this);
  }

  /**
   * Narrow the accepted values with a runtime predicate. Returns a schema with
   * the same output type; combine with {@link Schema.brand} to record the
   * invariant in the type as well.
   *
   * Decode-only: even on a {@link Codec}, `refine` returns a plain `Schema`
   * (no `encode`), so a refined codec field is rejected by `objectCodec`. Use
   * `.brand()` / `.optional()` to keep encodability.
   */
  refine(check: (value: Output) => boolean, message = "Failed refinement"): Schema<Output, Input> {
    return new RefineSchema<Output, Input>(this, check, message);
  }

  /**
   * Map the decoded value to a new type. One-directional: a transformed schema
   * decodes but cannot {@link Codec.encode | encode} (the function may not be
   * invertible), and the type reflects that — there is no `encode` to call.
   */
  transform<Output2>(fn: (value: Output) => Output2): Schema<Output2, Input> {
    return new TransformSchema<Output, Output2, Input>(this, fn);
  }

  /**
   * Supply a value used when the input is `undefined`. The input type gains
   * `undefined`; the output type does not — a defaulted field is always
   * present after decoding.
   *
   * Pass a THUNK (`() => Output`) when you need a fresh value each parse —
   * required for mutable defaults (`() => []`, `() => ({})`) and class
   * instances, since a plain value is returned as-is (shared) and is NOT
   * cloned. (We don't clone: cloning would strip class prototypes and throw on
   * non-cloneable values, making the output type lie — so the choice is yours.)
   *
   * Decode-only: returns a plain `Schema` (no `encode`) even on a {@link Codec}.
   */
  default(defaultValue: Output | (() => Output)): Schema<Output, Input | undefined> {
    const makeDefault: () => Output =
      typeof defaultValue === "function" ? (defaultValue as () => Output) : () => defaultValue;
    return new DefaultSchema<Output, Input>(this, makeDefault);
  }

  /** The Standard Schema v1 entry point (the decode direction). */
  readonly "~standard": StandardSchemaV1.Props<Input, Output> = {
    version: 1,
    vendor: VENDOR,
    validate: (value: unknown): StandardSchemaV1.Result<Output> => {
      const result = this._parse(value, []);
      return result.ok ? { value: result.value } : { issues: result.issues };
    },
  };
}

/** Recover the decoded (output) type of a schema. */
export type Infer<S extends Schema<unknown>> = S["_output"];

/** Recover the input (encoded) type a schema decodes from. */
export type InferInput<S extends Schema<unknown>> = S["_input"];

// ---------------------------------------------------------------------------
// Codec: the "can also ENCODE" capability
//
// Roadmap 2/object-encode: encodability is carried IN THE TYPE. A `Codec` is a
// schema that, on top of decoding `Input -> Output`, can encode
// `Output -> Input`. `transform` stays a plain `Schema` (no `encode`), so a
// non-invertible field cannot sneak into a place that needs to round-trip —
// it fails to compile. Primitives are identity codecs; `codec(...)` and
// `objectCodec(...)` build real ones.
// ---------------------------------------------------------------------------

export abstract class Codec<Output, Input = Output> extends Schema<Output, Input> {
  /** Encode a decoded value back into its input representation. */
  abstract encode(value: Output): Input;

  /** Brand the output while staying encodable (the brand is type-level only). */
  override brand<B extends string>(): Codec<Branded<Output, B>, Input> {
    return new BrandCodec<Output, B, Input>(this);
  }

  /** Accept `undefined` while staying encodable. */
  override optional(): Codec<Output | undefined, Input | undefined> {
    return new OptionalCodec<Output, Input>(this);
  }

  /** Accept `null` while staying encodable. */
  override nullable(): Codec<Output | null, Input | null> {
    return new NullableCodec<Output, Input>(this);
  }
}

// ---------------------------------------------------------------------------
// Base wrappers (kept with Schema/Codec to contain the cyclic cluster)
// ---------------------------------------------------------------------------

// Shared wrapper decode logic, so the Schema and Codec variants below cannot
// drift: each `_parse` is a one-line delegation to the same function.

export function parseOptional<T>(
  inner: Schema<T, unknown>,
  input: unknown,
  path: ReadonlyArray<PropertyKey>,
): Internal<T | undefined> {
  return input === undefined ? ok(undefined) : inner._parse(input, path);
}

export function parseBranded<T, B extends string>(
  inner: Schema<T, unknown>,
  input: unknown,
  path: ReadonlyArray<PropertyKey>,
): Internal<Branded<T, B>> {
  const result = inner._parse(input, path);
  // The brand is type-level only, so a successful inner value already IS the
  // branded value at runtime.
  return result.ok ? ok(result.value as Branded<T, B>) : result;
}

export class OptionalSchema<T, Input = T> extends Schema<T | undefined, Input | undefined> {
  constructor(readonly inner: Schema<T, Input>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T | undefined> {
    return parseOptional(this.inner, input, path);
  }
}

export class NullableSchema<T, Input = T> extends Schema<T | null, Input | null> {
  constructor(readonly inner: Schema<T, Input>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T | null> {
    return input === null ? ok(null) : this.inner._parse(input, path);
  }
}

export class BrandSchema<T, B extends string, Input> extends Schema<Branded<T, B>, Input> {
  constructor(readonly inner: Schema<T, Input>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Branded<T, B>> {
    return parseBranded(this.inner, input, path);
  }
}

// Encodable counterparts of the wrappers: built only from a Codec inner, so
// they can delegate `encode` and stay encodable (see Codec.brand / .optional).
// Decode reuses the same helpers as the Schema variants above.

export class BrandCodec<T, B extends string, Input> extends Codec<Branded<T, B>, Input> {
  constructor(readonly inner: Codec<T, Input>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Branded<T, B>> {
    return parseBranded(this.inner, input, path);
  }

  encode(value: Branded<T, B>): Input {
    return this.inner.encode(value as T);
  }
}

export class OptionalCodec<T, Input> extends Codec<T | undefined, Input | undefined> {
  constructor(readonly inner: Codec<T, Input>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T | undefined> {
    return parseOptional(this.inner, input, path);
  }

  encode(value: T | undefined): Input | undefined {
    return value === undefined ? undefined : this.inner.encode(value);
  }
}

export class NullableCodec<T, Input> extends Codec<T | null, Input | null> {
  constructor(readonly inner: Codec<T, Input>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T | null> {
    return input === null ? ok(null) : this.inner._parse(input, path);
  }

  encode(value: T | null): Input | null {
    return value === null ? null : this.inner.encode(value);
  }
}

export class RefineSchema<T, Input> extends Schema<T, Input> {
  constructor(
    readonly inner: Schema<T, Input>,
    readonly check: (value: T) => boolean,
    readonly message: string,
  ) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T> {
    const result = this.inner._parse(input, path);
    if (!result.ok) return result;
    return this.check(result.value)
      ? result
      : fail(path, "custom", { message: this.message }, this.message);
  }
}

export class TransformSchema<BaseOutput, Output, Input> extends Schema<Output, Input> {
  constructor(
    readonly base: Schema<BaseOutput, Input>,
    readonly fn: (value: BaseOutput) => Output,
  ) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Output> {
    const result = this.base._parse(input, path);
    return result.ok ? ok(this.fn(result.value)) : result;
  }
}

export class DefaultSchema<Output, Input> extends Schema<Output, Input | undefined> {
  constructor(
    readonly base: Schema<Output, Input>,
    readonly makeDefault: () => Output,
  ) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Output> {
    // Produce a fresh default each call so mutable defaults are never shared.
    return input === undefined ? ok(this.makeDefault()) : this.base._parse(input, path);
  }
}

/**
 * A {@link Codec} built from a base schema plus a decode/encode pair — the
 * concrete schema returned by {@link codec}.
 */
export class MappedCodec<Output, Input> extends Codec<Output, Input> {
  constructor(
    readonly base: Schema<Input>,
    private readonly decoder: (input: Input) => Output,
    private readonly encoder: (output: Output) => Input,
  ) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Output> {
    const result = this.base._parse(input, path);
    return result.ok ? ok(this.decoder(result.value)) : result;
  }

  encode(value: Output): Input {
    return this.encoder(value);
  }
}

export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return new OptionalSchema(schema);
}

/** Make `schema` also accept `null`, producing `T | null`. */
export function nullable<T, Input>(schema: Schema<T, Input>): Schema<T | null, Input | null> {
  return new NullableSchema<T, Input>(schema);
}

/**
 * Build a bidirectional {@link Codec} on top of a base schema. `decode` runs
 * after the base validates the input representation; `encode` is its inverse.
 *
 * @example
 *   const isoDate = codec(string(), {
 *     decode: (s) => new Date(s),
 *     encode: (d) => d.toISOString(),
 *   }); // Codec<Date, string>
 *   isoDate.parse("2026-06-20T00:00:00.000Z"); // Date
 *   isoDate.encode(new Date(0));               // string
 */
export function codec<Input, Output>(
  base: Schema<Input>,
  transform: { decode: (input: Input) => Output; encode: (output: Output) => Input },
): Codec<Output, Input> {
  return new MappedCodec(base, transform.decode, transform.encode);
}
