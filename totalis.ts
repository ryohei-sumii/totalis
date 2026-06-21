/**
 * totalis — a TypeScript-first runtime validation library.
 *
 * The single core idea: the schema is the source of truth, and both the
 * runtime validator AND the static type are derived from the same object
 * (`Infer<typeof schema>`). The differentiator is COMPLETENESS — a schema
 * must not be able to silently drift from the type it claims to validate.
 *
 * This file is the seed prototype. Keep it dependency-free and tree-shakable.
 */

// ---------------------------------------------------------------------------
// Standard Schema v1 (vendored)
//
// This is a verbatim copy of the public interface published as
// `@standard-schema/spec` (MIT licensed). We vendor it rather than depend on
// it so that the core ships with ZERO external/runtime dependencies — the
// Standard Schema authors explicitly bless copying these types into a project.
//
// The shape below is pinned to `@standard-schema/spec@1.1.0`. The conformance
// test suite (`standard-schema.test-d.ts`) asserts — at compile time — that
// this vendored copy stays bidirectionally assignable with the published
// package, so it cannot silently drift.
//
// Spec: https://standardschema.dev
// ---------------------------------------------------------------------------

/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates unknown input values. */
    readonly validate: (
      value: unknown,
      options?: StandardSchemaV1.Options | undefined,
    ) => Result<Output> | Promise<Result<Output>>;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }

  /** The result interface of the validate function. */
  export type Result<Output> = SuccessResult<Output> | FailureResult;

  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** A falsy value for `issues` indicates success. */
    readonly issues?: undefined;
  }

  /** Options passed to the validate function. */
  export interface Options {
    /** Explicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  /** The result interface if validation fails. */
  export interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }

  /** The issue interface of the failure output. */
  export interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  /** The path segment interface of the issue. */
  export interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }

  /** The Standard types interface. */
  export interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }

  /** Infers the input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];

  /** Infers the output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

/** The vendor name reported through the Standard Schema `~standard` property. */
export const VENDOR = "totalis";

// ---------------------------------------------------------------------------
// Errors & results
// ---------------------------------------------------------------------------

/**
 * A machine-readable issue code. Pair it with {@link Issue.params} to render a
 * localized message; the English {@link Issue.message} is only the fallback, so
 * totalis errors are i18n-ready without shipping locale files.
 */
export type IssueCode =
  | "invalid_type"
  | "invalid_literal"
  | "invalid_value"
  | "too_small"
  | "invalid_union"
  | "custom";

/** A single validation failure, located by `path` and described by `code`. */
export interface Issue {
  /** Machine-readable code, for localization or branching. */
  readonly code: IssueCode;
  /** The path into the input value (object keys + array indices). */
  readonly path: ReadonlyArray<PropertyKey>;
  /** Default (English) human-readable message. */
  readonly message: string;
  /** Structured data behind the message, for localized re-rendering. */
  readonly params: Readonly<Record<string, unknown>>;
}

/** Render an {@link Issue} into a (possibly localized) string. */
export type Localizer = (issue: Issue) => string;

/**
 * A tree of error messages mirroring the shape of the input — the natural
 * structure for rendering per-field errors in a form UI.
 */
export interface ErrorTree {
  /** Errors attached at this node. */
  errors: string[];
  /** Errors nested under object keys. */
  properties?: { [key: string]: ErrorTree };
  /** Errors nested under array indices. */
  items?: ErrorTree[];
}

const identityLocalizer: Localizer = (issue) => issue.message;

/** The error thrown by {@link Schema.parse} and surfaced by `safeParse`. */
export class ValidationError extends Error {
  readonly issues: ReadonlyArray<Issue>;

  constructor(issues: ReadonlyArray<Issue>) {
    super(ValidationError.summarize(issues));
    this.name = "ValidationError";
    this.issues = issues;
  }

  /** A one-line summary, e.g. `Expected number, received string at age`. */
  private static summarize(issues: ReadonlyArray<Issue>): string {
    if (issues.length === 0) return "Validation failed";
    return issues
      .map((issue) => {
        const where = issue.path.length > 0 ? ` at ${issue.path.map(String).join(".")}` : "";
        return `${issue.message}${where}`;
      })
      .join("; ");
  }

  /**
   * Group issues into `{ formErrors, fieldErrors }`: top-level issues vs. issues
   * keyed by their first path segment. Ideal for simple, flat forms. Pass a
   * {@link Localizer} to translate messages.
   */
  flatten(localize: Localizer = identityLocalizer): {
    formErrors: string[];
    fieldErrors: Record<string, string[]>;
  } {
    const formErrors: string[] = [];
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of this.issues) {
      const key = issue.path[0];
      if (key === undefined) formErrors.push(localize(issue));
      else (fieldErrors[String(key)] ??= []).push(localize(issue));
    }
    return { formErrors, fieldErrors };
  }

  /**
   * Build a tree mirroring the input shape, with messages at each node. Ideal
   * for deeply-nested per-field errors. Pass a {@link Localizer} to translate.
   */
  format(localize: Localizer = identityLocalizer): ErrorTree {
    const root: ErrorTree = { errors: [] };
    for (const issue of this.issues) {
      let node = root;
      for (const segment of issue.path) {
        if (typeof segment === "number") {
          const items = (node.items ??= []);
          // Keep `items` dense: fill any gap with empty nodes so the array
          // never contains holes (which would violate its `ErrorTree[]` type
          // and crash consumers iterating with `for...of`).
          while (items.length <= segment) items.push({ errors: [] });
          node = items[segment] ?? (items[segment] = { errors: [] });
        } else {
          const properties = (node.properties ??= {});
          node = properties[String(segment)] ??= { errors: [] };
        }
      }
      node.errors.push(localize(issue));
    }
    return root;
  }
}

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

/** Internal parse result threaded through `_parse`. */
type Internal<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: Issue[] };

function ok<T>(value: T): Internal<T> {
  return { ok: true, value };
}

function defaultMessage(code: IssueCode, params: Readonly<Record<string, unknown>>): string {
  switch (code) {
    case "invalid_type":
      return `Expected ${String(params.expected)}, received ${String(params.received)}`;
    case "invalid_literal":
      return `Expected ${JSON.stringify(params.expected)}, received ${JSON.stringify(params.received)}`;
    case "invalid_value":
      return `Expected one of ${String(params.options)}, received ${JSON.stringify(params.received)}`;
    case "too_small":
      return `Expected at least ${String(params.minimum)} item(s)`;
    case "invalid_union":
      return `Expected discriminant ${String(params.options)}, received ${JSON.stringify(params.received)}`;
    case "custom":
      return typeof params.message === "string" ? params.message : "Invalid input";
  }
}

function fail(
  path: ReadonlyArray<PropertyKey>,
  code: IssueCode,
  params: Readonly<Record<string, unknown>> = {},
  message: string = defaultMessage(code, params),
): Internal<never> {
  return { ok: false, issues: [{ code, path, params, message }] };
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

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
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

class StringSchema extends Codec<string> {
  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<string> {
    return typeof input === "string"
      ? ok(input)
      : fail(path, "invalid_type", { expected: "string", received: typeName(input) });
  }

  encode(value: string): string {
    return value;
  }
}

class NumberSchema extends Codec<number> {
  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<number> {
    if (typeof input !== "number") {
      return fail(path, "invalid_type", { expected: "number", received: typeName(input) });
    }
    if (Number.isNaN(input)) {
      return fail(path, "invalid_type", { expected: "number", received: "NaN" });
    }
    return ok(input);
  }

  encode(value: number): number {
    return value;
  }
}

class BooleanSchema extends Codec<boolean> {
  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<boolean> {
    return typeof input === "boolean"
      ? ok(input)
      : fail(path, "invalid_type", { expected: "boolean", received: typeName(input) });
  }

  encode(value: boolean): boolean {
    return value;
  }
}

/** Literal primitive values that can be matched exactly. */
type Literal = string | number | boolean | null;

class LiteralSchema<L extends Literal> extends Codec<L> {
  constructor(readonly value: L) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<L> {
    return input === this.value
      ? ok(this.value)
      : fail(path, "invalid_literal", { expected: this.value, received: input });
  }

  encode(value: L): L {
    return value;
  }
}

// Shared wrapper decode logic, so the Schema and Codec variants below cannot
// drift: each `_parse` is a one-line delegation to the same function.

function parseOptional<T>(
  inner: Schema<T, unknown>,
  input: unknown,
  path: ReadonlyArray<PropertyKey>,
): Internal<T | undefined> {
  return input === undefined ? ok(undefined) : inner._parse(input, path);
}

function parseBranded<T, B extends string>(
  inner: Schema<T, unknown>,
  input: unknown,
  path: ReadonlyArray<PropertyKey>,
): Internal<Branded<T, B>> {
  const result = inner._parse(input, path);
  // The brand is type-level only, so a successful inner value already IS the
  // branded value at runtime.
  return result.ok ? ok(result.value as Branded<T, B>) : result;
}

class OptionalSchema<T, Input = T> extends Schema<T | undefined, Input | undefined> {
  constructor(readonly inner: Schema<T, Input>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T | undefined> {
    return parseOptional(this.inner, input, path);
  }
}

class BrandSchema<T, B extends string, Input> extends Schema<Branded<T, B>, Input> {
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

class BrandCodec<T, B extends string, Input> extends Codec<Branded<T, B>, Input> {
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

class OptionalCodec<T, Input> extends Codec<T | undefined, Input | undefined> {
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

class RefineSchema<T, Input> extends Schema<T, Input> {
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

class TransformSchema<BaseOutput, Output, Input> extends Schema<Output, Input> {
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

class DefaultSchema<Output, Input> extends Schema<Output, Input | undefined> {
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
class MappedCodec<Output, Input> extends Codec<Output, Input> {
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

class ArraySchema<T> extends Schema<T[]> {
  constructor(readonly element: Schema<T>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T[]> {
    if (!Array.isArray(input)) {
      return fail(path, "invalid_type", { expected: "array", received: typeName(input) });
    }
    const items = input as unknown[];
    const out: T[] = [];
    const issues: Issue[] = [];
    for (let i = 0; i < items.length; i++) {
      const result = this.element._parse(items[i], [...path, i]);
      if (result.ok) out.push(result.value);
      else issues.push(...result.issues);
    }
    return issues.length > 0 ? { ok: false, issues } : ok(out);
  }

  /** Require at least one element, narrowing the output to {@link NonEmptyArray}. */
  nonempty(): Schema<NonEmptyArray<T>> {
    return new NonEmptyArraySchema(this);
  }
}

class NonEmptyArraySchema<T> extends Schema<NonEmptyArray<T>> {
  constructor(readonly inner: ArraySchema<T>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<NonEmptyArray<T>> {
    const result = this.inner._parse(input, path);
    if (!result.ok) return result;
    return result.value.length > 0
      ? ok(result.value as NonEmptyArray<T>)
      : fail(path, "too_small", { minimum: 1, type: "array" }, "Expected a non-empty array");
  }
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

/** A record of named schemas describing an object's fields. */
export type Shape = Record<string, Schema<unknown>>;

/** Collapse an intersection into a single readable object type. */
type Flatten<T> = { [K in keyof T]: T[K] } & {};

/**
 * Derive the decoded object type from a {@link Shape}. Keys whose schema admits
 * `undefined` become OPTIONAL keys (`age?: number`) rather than
 * `age: number | undefined`.
 */
export type InferShape<S extends Shape> = Flatten<
  { [K in keyof S as undefined extends Infer<S[K]> ? never : K]: Infer<S[K]> } & {
    [K in keyof S as undefined extends Infer<S[K]> ? K : never]?: Infer<S[K]>;
  }
>;

/** The INPUT (encoded) object type of a shape — the counterpart of {@link InferShape}. */
export type InferShapeInput<S extends Shape> = Flatten<
  { [K in keyof S as undefined extends InferInput<S[K]> ? never : K]: InferInput<S[K]> } & {
    [K in keyof S as undefined extends InferInput<S[K]> ? K : never]?: InferInput<S[K]>;
  }
>;

/** Decode an object against `shape`, threading `path` and collecting issues. */
function parseShape(
  shape: Shape,
  input: unknown,
  path: ReadonlyArray<PropertyKey>,
): Internal<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail(path, "invalid_type", { expected: "object", received: typeName(input) });
  }
  const record = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const issues: Issue[] = [];
  for (const key of Object.keys(shape)) {
    const schema = shape[key];
    if (!schema) continue;
    const present = key in record;
    const result = schema._parse(record[key], [...path, key]);
    if (!result.ok) issues.push(...result.issues);
    else if (present || result.value !== undefined) out[key] = result.value;
  }
  return issues.length > 0 ? { ok: false, issues } : ok(out);
}

export class ObjectSchema<S extends Shape> extends Schema<InferShape<S>> {
  constructor(readonly shape: S) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<InferShape<S>> {
    return parseShape(this.shape, input, path) as Internal<InferShape<S>>;
  }
}

/** A {@link Shape} whose every field can encode — required by {@link objectCodec}. */
export type EncodableShape = Record<string, Codec<unknown, unknown>>;

/**
 * An encodable object: decodes like {@link ObjectSchema} and additionally
 * encodes field-by-field. Built by {@link objectCodec}; because every field
 * must be a {@link Codec}, a one-directional `transform` field cannot be used —
 * it fails to compile.
 */
export class ObjectCodec<S extends EncodableShape> extends Codec<
  InferShape<S>,
  InferShapeInput<S>
> {
  constructor(readonly shape: S) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<InferShape<S>> {
    return parseShape(this.shape, input, path) as Internal<InferShape<S>>;
  }

  encode(value: InferShape<S>): InferShapeInput<S> {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(this.shape)) {
      const field = this.shape[key];
      if (!field) continue;
      if (key in record) out[key] = field.encode(record[key]);
    }
    return out as InferShapeInput<S>;
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function string(): StringSchema {
  return new StringSchema();
}

export function number(): NumberSchema {
  return new NumberSchema();
}

export function boolean(): BooleanSchema {
  return new BooleanSchema();
}

export function literal<const L extends Literal>(value: L): LiteralSchema<L> {
  return new LiteralSchema(value);
}

export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return new OptionalSchema(schema);
}

export function array<T>(element: Schema<T>): ArraySchema<T> {
  return new ArraySchema(element);
}

export function object<S extends Shape>(shape: S): ObjectSchema<S> {
  return new ObjectSchema(shape);
}

/**
 * Build an encodable object (a {@link Codec}) — like {@link object}, but every
 * field must itself be a {@link Codec}, so the whole object round-trips:
 * `parse` decodes and `.encode(output)` reconstructs the input. A
 * one-directional `transform` field fails to compile here.
 *
 * @example
 *   const Event = objectCodec({
 *     id: string(),
 *     at: codec(string(), { decode: (s) => new Date(s), encode: (d) => d.toISOString() }),
 *   });
 *   const e = Event.parse({ id: "e1", at: "2026-06-20T00:00:00.000Z" }); // { id: string; at: Date }
 *   Event.encode(e); // { id: string; at: string }
 */
export function objectCodec<S extends EncodableShape>(shape: S): ObjectCodec<S> {
  return new ObjectCodec(shape);
}

/** An integer — `number` branded so a plain `number` can't stand in for it. */
export type Integer = Branded<number, "int">;

/** A number schema that also requires the value to be an integer. */
export function int(): Schema<Integer, number> {
  return number()
    .refine((n) => Number.isInteger(n), "Expected an integer")
    .brand<"int">();
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

/** Accepts exactly the literal values it was built with (a closed enum). */
class LiteralUnionSchema<T extends Literal> extends Codec<T> {
  private readonly allowed: ReadonlySet<Literal>;

  constructor(readonly values: readonly T[]) {
    super();
    this.allowed = new Set(values);
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T> {
    if (this.allowed.has(input as Literal)) return ok(input as T);
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
  ): Schema<T> => new LiteralUnionSchema<T>(values as readonly T[]) as unknown as Schema<T>;
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
  ): Schema<T> =>
    new DiscriminatedUnionSchema<T>(key, variants as unknown as ReadonlyArray<ObjectSchema<Shape>>);
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

/** Strict, non-distributive type equality. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

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
