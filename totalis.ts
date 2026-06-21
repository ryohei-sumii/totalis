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
  | "invalid_string"
  | "too_small"
  | "too_big"
  | "not_multiple_of"
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
    case "too_big":
      return `Expected at most ${String(params.maximum)} item(s)`;
    case "invalid_string":
      return `Invalid ${String(params.validation)}`;
    case "not_multiple_of":
      return `Expected a multiple of ${String(params.multipleOf)}`;
    case "invalid_union":
      return "options" in params
        ? `Expected discriminant ${String(params.options)}, received ${JSON.stringify(params.received)}`
        : "Input did not match any union member";
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

/**
 * Assign a parsed value onto an output object by key. Guards `"__proto__"`:
 * a plain `out[key] = value` for that key hits Object.prototype's setter
 * (changing the prototype and dropping the data, since the input key is
 * attacker-controlled in `record`). `defineProperty` stores it as an own data
 * property instead — so the output never lies and the prototype isn't polluted.
 */
function setKey(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    target[key] = value;
  }
}

// A constructor-bearing global since Node 18 / browsers; declared so the core
// needs neither the DOM lib nor `@types/node` (cf. `engines.node >= 20`).
declare const URL: { new (url: string): unknown };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** A chainable runtime refinement on a primitive (string/number), kept as data. */
interface Check<T> {
  readonly run: (value: T) => boolean;
  readonly code: IssueCode;
  readonly params: Readonly<Record<string, unknown>>;
  readonly message: string;
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
// Primitives
// ---------------------------------------------------------------------------

class StringSchema extends Codec<string> {
  constructor(private readonly checks: ReadonlyArray<Check<string>> = []) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<string> {
    if (typeof input !== "string") {
      return fail(path, "invalid_type", { expected: "string", received: typeName(input) });
    }
    for (const c of this.checks) {
      if (!c.run(input)) return fail(path, c.code, c.params, c.message);
    }
    return ok(input);
  }

  encode(value: string): string {
    return value;
  }

  // Refinements keep the type `string` (no brand) and stay encodable, so they
  // chain (`string().min(3).email()`) and work inside objectCodec.
  private and(check: Check<string>): StringSchema {
    return new StringSchema([...this.checks, check]);
  }

  min(length: number): StringSchema {
    return this.and({
      run: (s) => s.length >= length,
      code: "too_small",
      params: { minimum: length, type: "string" },
      message: `String must contain at least ${length} character(s)`,
    });
  }

  max(length: number): StringSchema {
    return this.and({
      run: (s) => s.length <= length,
      code: "too_big",
      params: { maximum: length, type: "string" },
      message: `String must contain at most ${length} character(s)`,
    });
  }

  length(length: number): StringSchema {
    return this.and({
      run: (s) => s.length === length,
      code: "invalid_string",
      params: { validation: "length", length },
      message: `String must contain exactly ${length} character(s)`,
    });
  }

  regex(regex: RegExp, message = "Invalid format"): StringSchema {
    return this.and({
      run: (s) => {
        // Reset lastIndex so a /g or /y flagged regex (which advances it on
        // each `test`) doesn't give alternating results across parses.
        regex.lastIndex = 0;
        return regex.test(s);
      },
      code: "invalid_string",
      params: { validation: "regex" },
      message,
    });
  }

  email(message = "Invalid email"): StringSchema {
    return this.and({
      run: (s) => EMAIL_REGEX.test(s),
      code: "invalid_string",
      params: { validation: "email" },
      message,
    });
  }

  url(message = "Invalid URL"): StringSchema {
    return this.and({ run: isUrl, code: "invalid_string", params: { validation: "url" }, message });
  }

  uuid(message = "Invalid UUID"): StringSchema {
    return this.and({
      run: (s) => UUID_REGEX.test(s),
      code: "invalid_string",
      params: { validation: "uuid" },
      message,
    });
  }
}

class DateSchema extends Codec<Date> {
  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Date> {
    // A `Date` carrying `NaN` (e.g. `new Date("nope")`) is not a valid value.
    return input instanceof Date && !Number.isNaN(input.getTime())
      ? ok(input)
      : fail(path, "invalid_type", { expected: "Date", received: typeName(input) });
  }

  encode(value: Date): Date {
    return value;
  }
}

class NumberSchema extends Codec<number> {
  constructor(private readonly checks: ReadonlyArray<Check<number>> = []) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<number> {
    if (typeof input !== "number") {
      return fail(path, "invalid_type", { expected: "number", received: typeName(input) });
    }
    if (Number.isNaN(input)) {
      return fail(path, "invalid_type", { expected: "number", received: "NaN" });
    }
    for (const c of this.checks) {
      if (!c.run(input)) return fail(path, c.code, c.params, c.message);
    }
    return ok(input);
  }

  encode(value: number): number {
    return value;
  }

  private and(check: Check<number>): NumberSchema {
    return new NumberSchema([...this.checks, check]);
  }

  min(value: number): NumberSchema {
    return this.and({
      run: (n) => n >= value,
      code: "too_small",
      params: { minimum: value, type: "number" },
      message: `Number must be >= ${value}`,
    });
  }

  max(value: number): NumberSchema {
    return this.and({
      run: (n) => n <= value,
      code: "too_big",
      params: { maximum: value, type: "number" },
      message: `Number must be <= ${value}`,
    });
  }

  positive(): NumberSchema {
    return this.and({
      run: (n) => n > 0,
      code: "too_small",
      params: { minimum: 0, exclusive: true, type: "number" },
      message: "Number must be positive",
    });
  }

  nonnegative(): NumberSchema {
    return this.and({
      run: (n) => n >= 0,
      code: "too_small",
      params: { minimum: 0, type: "number" },
      message: "Number must be non-negative",
    });
  }

  multipleOf(value: number): NumberSchema {
    return this.and({
      run: (n) => n % value === 0,
      code: "not_multiple_of",
      params: { multipleOf: value },
      message: `Number must be a multiple of ${value}`,
    });
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

/**
 * Coerce raw input with `coerceFn`, then validate with `base`. DECODE-ONLY (a
 * plain {@link Schema}, never a {@link Codec}): coercion widens the accepted
 * input and is not invertible — exactly like `transform` — so a coerced field
 * cannot enter {@link objectCodec}. The static input type is honestly
 * `unknown`, not the output type, so `InferInput` never lies about what the
 * boundary accepts.
 */
class CoerceSchema<O> extends Schema<O, unknown> {
  constructor(
    private readonly coerceFn: (input: unknown) => unknown,
    private readonly base: Schema<O, unknown>,
  ) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<O> {
    let coerced: unknown;
    try {
      coerced = this.coerceFn(input);
    } catch {
      // JS coercion throws on some inputs (e.g. `Number(symbol)`,
      // `new Date(bigint)`); `safeParse` must never throw, so report it as a
      // normal failure instead of letting the exception escape.
      return fail(path, "invalid_type", { expected: "coercible value", received: typeName(input) });
    }
    return this.base._parse(coerced, path);
  }
}

/**
 * A schema resolved lazily, so it can reference itself — the building block for
 * RECURSIVE types (trees, linked lists, comment threads). TypeScript cannot
 * infer a recursive type, so the output is annotated (`lazy<Category>(...)` or
 * `const Category: Schema<Category> = lazy(...)`); the getter must then return a
 * `Schema<Category>`, so the schema still cannot drift from the type — and
 * wrapping `schemaFor<Category>()({...})` inside keeps the EXACT per-field
 * guarantee. The getter is memoized, so the recursive schema is built once.
 */
class LazySchema<O, I> extends Schema<O, I> {
  private cached: Schema<O, I> | undefined;

  constructor(private readonly getter: () => Schema<O, I>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<O> {
    this.cached ??= this.getter();
    return this.cached._parse(input, path);
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

class NullableSchema<T, Input = T> extends Schema<T | null, Input | null> {
  constructor(readonly inner: Schema<T, Input>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T | null> {
    return input === null ? ok(null) : this.inner._parse(input, path);
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

class NullableCodec<T, Input> extends Codec<T | null, Input | null> {
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

/** Merge shape `E` over `S`, with `E`'s fields overriding `S`'s on key collision. */
export type ExtendShape<S extends Shape, E extends Shape> = Flatten<Omit<S, keyof E> & E>;

/** Wrap every field of `S` in {@link OptionalSchema}, so all keys become optional. */
export type PartialShape<S extends Shape> = { [K in keyof S]: OptionalSchema<Infer<S[K]>> };

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
    else if (present || result.value !== undefined) setKey(out, key, result.value);
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

  /**
   * Keep only the named fields. `Infer` of the result equals
   * `Pick<Infer<this>, K>`, so the schema can never claim to validate a key it
   * dropped.
   */
  pick<K extends keyof S>(keys: readonly K[]): ObjectSchema<Pick<S, K>> {
    const out: Shape = {};
    for (const key of keys) setKey(out, key as string, this.shape[key]);
    return new ObjectSchema(out as unknown as Pick<S, K>);
  }

  /** Drop the named fields — the dual of {@link pick}; `Infer` equals `Omit<Infer<this>, K>`. */
  omit<K extends keyof S>(keys: readonly K[]): ObjectSchema<Omit<S, K>> {
    const remove = new Set<keyof S>(keys);
    const out: Shape = {};
    for (const key of Object.keys(this.shape)) {
      if (!remove.has(key as keyof S)) setKey(out, key, this.shape[key]);
    }
    return new ObjectSchema(out as unknown as Omit<S, K>);
  }

  /** Make every field optional — `Infer` equals `Partial<Infer<this>>`. */
  partial(): ObjectSchema<PartialShape<S>> {
    const out: Shape = {};
    for (const key of Object.keys(this.shape)) {
      const field = this.shape[key];
      if (field) setKey(out, key, optional(field));
    }
    return new ObjectSchema(out as PartialShape<S>);
  }

  /** Add (or override) fields from `shape`; on a key collision the new field wins. */
  extend<E extends Shape>(shape: E): ObjectSchema<ExtendShape<S, E>> {
    return new ObjectSchema({ ...this.shape, ...shape } as ExtendShape<S, E>);
  }

  /** Merge another {@link ObjectSchema} in — `a.merge(b)` is `a.extend(b.shape)`. */
  merge<O extends Shape>(other: ObjectSchema<O>): ObjectSchema<ExtendShape<S, O>> {
    return this.extend(other.shape);
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

/** A dictionary with arbitrary string keys, every value validated by one schema. */
class RecordSchema<V> extends Schema<Record<string, V>> {
  constructor(readonly value: Schema<V>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<Record<string, V>> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return fail(path, "invalid_type", { expected: "object", received: typeName(input) });
    }
    const record = input as Record<string, unknown>;
    const out: Record<string, V> = {};
    const issues: Issue[] = [];
    for (const key of Object.keys(record)) {
      const result = this.value._parse(record[key], [...path, key]);
      if (result.ok) setKey(out, key, result.value);
      else issues.push(...result.issues);
    }
    return issues.length > 0 ? { ok: false, issues } : ok(out);
  }
}

/** Map a tuple of schemas to the (mutable) tuple of their output types. */
export type InferTuple<T extends ReadonlyArray<Schema<unknown>>> = {
  -readonly [I in keyof T]: T[I] extends Schema<infer O> ? O : never;
};

/** A fixed-length, positional tuple. */
class TupleSchema<T extends ReadonlyArray<Schema<unknown>>> extends Schema<InferTuple<T>> {
  constructor(readonly items: T) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<InferTuple<T>> {
    if (!Array.isArray(input)) {
      return fail(path, "invalid_type", { expected: "array", received: typeName(input) });
    }
    const arr = input as unknown[];
    if (arr.length !== this.items.length) {
      return fail(path, "invalid_type", {
        expected: `tuple of length ${this.items.length}`,
        received: `array of length ${arr.length}`,
      });
    }
    const out: unknown[] = [];
    const issues: Issue[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const schema = this.items[i];
      if (!schema) continue;
      const result = schema._parse(arr[i], [...path, i]);
      if (result.ok) out.push(result.value);
      else issues.push(...result.issues);
    }
    return issues.length > 0 ? { ok: false, issues } : ok(out as InferTuple<T>);
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

/** Validate a `Date` instance (rejecting an invalid `Date` whose time is `NaN`). */
export function date(): DateSchema {
  return new DateSchema();
}

export function literal<const L extends Literal>(value: L): LiteralSchema<L> {
  return new LiteralSchema(value);
}

export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return new OptionalSchema(schema);
}

/** Make `schema` also accept `null`, producing `T | null`. */
export function nullable<T, Input>(schema: Schema<T, Input>): Schema<T | null, Input | null> {
  return new NullableSchema<T, Input>(schema);
}

export function array<T>(element: Schema<T>): ArraySchema<T> {
  return new ArraySchema(element);
}

/**
 * Define a schema lazily so it can reference itself — for RECURSIVE types.
 * Annotate the output, since TS can't infer recursion:
 *
 * @example
 *   interface Category { name: string; children: Category[] }
 *   const Category: Schema<Category> = lazy(() =>
 *     object({ name: string(), children: array(Category) }));
 */
export function lazy<O, I = O>(getter: () => Schema<O, I>): Schema<O, I> {
  return new LazySchema(getter);
}

/** A dictionary `Record<string, V>` — arbitrary string keys, each value validated by `value`. */
export function record<V>(value: Schema<V>): Schema<Record<string, V>> {
  return new RecordSchema(value);
}

/** A fixed-length positional tuple — `tuple([string(), number()])` → `[string, number]`. */
export function tuple<const T extends ReadonlyArray<Schema<unknown>>>(
  items: T,
): Schema<InferTuple<T>> {
  return new TupleSchema<T>(items);
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

/**
 * Coerce input before validating — `coerce.number()` turns `"42"` into `42`.
 * Decode-only (the result is a {@link Schema}, not a {@link Codec}, and its
 * `InferInput` is honestly `unknown`). Pass a refined base to keep narrowing —
 * `coerce.number(number().min(0))`, `coerce.number(int())` — since any schema
 * with the right output is accepted, the output type (and any brand) is
 * preserved.
 *
 * Coercion uses the JS built-ins (`Number` / `String` / `Boolean` / `Date`),
 * so their quirks apply (e.g. `Number(null) === 0`, `Boolean("false") === true`);
 * an un-coercible value (`Number("abc")` is `NaN`, `new Date("nope")`) is
 * rejected by the base.
 */
export const coerce = {
  string<O extends string>(
    base: Schema<O, unknown> = string() as unknown as Schema<O, unknown>,
  ): Schema<O, unknown> {
    return new CoerceSchema((x) => String(x), base);
  },
  number<O extends number>(
    base: Schema<O, unknown> = number() as unknown as Schema<O, unknown>,
  ): Schema<O, unknown> {
    return new CoerceSchema((x) => Number(x), base);
  },
  boolean<O extends boolean>(
    base: Schema<O, unknown> = boolean() as unknown as Schema<O, unknown>,
  ): Schema<O, unknown> {
    return new CoerceSchema((x) => Boolean(x), base);
  },
  date(base: Schema<Date, unknown> = date()): Schema<Date, unknown> {
    return new CoerceSchema((x) => (x instanceof Date ? x : new Date(x as string | number)), base);
  },
};

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
