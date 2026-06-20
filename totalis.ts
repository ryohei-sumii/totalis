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

/** A single validation failure, with a path into the input value. */
export interface Issue {
  readonly message: string;
  readonly path: ReadonlyArray<PropertyKey>;
}

/** The error thrown by {@link Schema.parse} and surfaced by `safeParse`. */
export class ValidationError extends Error {
  readonly issues: ReadonlyArray<Issue>;

  constructor(issues: ReadonlyArray<Issue>) {
    super(ValidationError.format(issues));
    this.name = "ValidationError";
    this.issues = issues;
  }

  private static format(issues: ReadonlyArray<Issue>): string {
    if (issues.length === 0) return "Validation failed";
    return issues
      .map((issue) => {
        const where = issue.path.length > 0 ? ` at ${issue.path.map(String).join(".")}` : "";
        return `${issue.message}${where}`;
      })
      .join("; ");
  }
}

/** The discriminated result returned by {@link Schema.safeParse}. */
export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ValidationError };

/** Internal parse result threaded through `_parse`. */
type Internal<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: Issue[] };

function ok<T>(value: T): Internal<T> {
  return { ok: true, value };
}

function fail(path: ReadonlyArray<PropertyKey>, message: string): Internal<never> {
  return { ok: false, issues: [{ message, path }] };
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
 * `_output` is a phantom field: it carries the validated output type at the
 * type level without ever existing at runtime. {@link Infer} recovers it.
 *
 * Implementing `StandardSchemaV1<Output, Output>` makes every schema plug into
 * the Standard Schema ecosystem (tRPC, Hono, React Hook Form, ...) for free.
 */
export abstract class Schema<Output> implements StandardSchemaV1<Output, Output> {
  declare readonly _output: Output;

  /** Validate `input`, threading `path` for nested error reporting. */
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
  optional(): OptionalSchema<Output> {
    return new OptionalSchema(this);
  }

  /** The Standard Schema v1 entry point. */
  readonly "~standard": StandardSchemaV1.Props<Output, Output> = {
    version: 1,
    vendor: VENDOR,
    validate: (value: unknown): StandardSchemaV1.Result<Output> => {
      const result = this._parse(value, []);
      return result.ok ? { value: result.value } : { issues: result.issues };
    },
  };
}

/** Recover the validated output type of a schema. */
export type Infer<S extends Schema<unknown>> = S["_output"];

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

class StringSchema extends Schema<string> {
  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<string> {
    return typeof input === "string"
      ? ok(input)
      : fail(path, `Expected string, received ${typeName(input)}`);
  }
}

class NumberSchema extends Schema<number> {
  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<number> {
    if (typeof input !== "number") return fail(path, `Expected number, received ${typeName(input)}`);
    if (Number.isNaN(input)) return fail(path, "Expected number, received NaN");
    return ok(input);
  }
}

class BooleanSchema extends Schema<boolean> {
  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<boolean> {
    return typeof input === "boolean"
      ? ok(input)
      : fail(path, `Expected boolean, received ${typeName(input)}`);
  }
}

/** Literal primitive values that can be matched exactly. */
type Literal = string | number | boolean | null;

class LiteralSchema<L extends Literal> extends Schema<L> {
  constructor(readonly value: L) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<L> {
    return input === this.value
      ? ok(this.value)
      : fail(path, `Expected ${JSON.stringify(this.value)}, received ${JSON.stringify(input)}`);
  }
}

class OptionalSchema<T> extends Schema<T | undefined> {
  constructor(readonly inner: Schema<T>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T | undefined> {
    return input === undefined ? ok(undefined) : this.inner._parse(input, path);
  }
}

class ArraySchema<T> extends Schema<T[]> {
  constructor(readonly element: Schema<T>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<T[]> {
    if (!Array.isArray(input)) return fail(path, `Expected array, received ${typeName(input)}`);
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
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

/** A record of named schemas describing an object's fields. */
export type Shape = Record<string, Schema<unknown>>;

/** Collapse an intersection into a single readable object type. */
type Flatten<T> = { [K in keyof T]: T[K] } & {};

/**
 * Derive an object type from a {@link Shape}. Keys whose schema admits
 * `undefined` become OPTIONAL keys (`age?: number`) rather than
 * `age: number | undefined`.
 */
export type InferShape<S extends Shape> = Flatten<
  { [K in keyof S as undefined extends Infer<S[K]> ? never : K]: Infer<S[K]> } & {
    [K in keyof S as undefined extends Infer<S[K]> ? K : never]?: Infer<S[K]>;
  }
>;

export class ObjectSchema<S extends Shape> extends Schema<InferShape<S>> {
  constructor(readonly shape: S) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<InferShape<S>> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return fail(path, `Expected object, received ${typeName(input)}`);
    }
    const record = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const issues: Issue[] = [];
    for (const key of Object.keys(this.shape)) {
      const schema = this.shape[key];
      if (!schema) continue;
      const present = key in record;
      const result = schema._parse(record[key], [...path, key]);
      if (!result.ok) {
        issues.push(...result.issues);
      } else if (present || result.value !== undefined) {
        out[key] = result.value;
      }
    }
    return issues.length > 0 ? { ok: false, issues } : ok(out as InferShape<S>);
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

// ---------------------------------------------------------------------------
// Completeness primitive
// ---------------------------------------------------------------------------

/** Strict (non-distributive) type equality. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * The completeness primitive: build an object schema that is GUARANTEED to
 * match the type `T` exactly. If the shape is missing a field, has an extra
 * field, or a field's type drifts, the call FAILS TO COMPILE.
 *
 * @example
 *   interface User { name: string; age: number }
 *   const user = schemaFor<User>()({ name: string(), age: number() });
 */
export function schemaFor<T>() {
  return <S extends Shape>(
    shape: Equals<InferShape<S>, T> extends true ? S : S & "Schema does not match T",
  ): ObjectSchema<S> => new ObjectSchema(shape as S);
}
