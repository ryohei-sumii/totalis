import type { Issue } from "./errors";
import type { Infer, InferInput, NonEmptyArray, OptionalSchema } from "./schema";
import { Codec, optional, Schema } from "./schema";
import type { Internal } from "./util";
import { fail, mergeIntersection, ok, setKey, typeName } from "./util";

export class ArraySchema<T> extends Schema<T[]> {
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

/**
 * A schema resolved lazily, so it can reference itself — the building block for
 * RECURSIVE types (trees, linked lists, comment threads). TypeScript cannot
 * infer a recursive type, so the output is annotated (`lazy<Category>(...)` or
 * `const Category: Schema<Category> = lazy(...)`); the getter must then return a
 * `Schema<Category>`, so the schema still cannot drift from the type — and
 * wrapping `schemaFor<Category>()({...})` inside keeps the EXACT per-field
 * guarantee. The getter is memoized, so the recursive schema is built once.
 *
 * Because `lazy` lets the INPUT drive recursion depth, a cyclic input would
 * otherwise recurse forever; `_parse` detects a cycle (an input that is its own
 * ancestor) and returns a normal failure, so `safeParse` keeps its no-throw
 * contract. A non-cyclic shared reference (a DAG) is fine — the guard is
 * stack-disciplined (cleared on the way back up), so it only flags ancestors.
 */
class LazySchema<O, I> extends Schema<O, I> {
  private cached: Schema<O, I> | undefined;
  /** Object inputs currently on this schema's parse stack (ancestors). */
  private readonly inProgress = new WeakSet<object>();

  constructor(private readonly getter: () => Schema<O, I>) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<O> {
    this.cached ??= this.getter();
    // Only objects can form a cycle; primitives parse directly.
    if (typeof input !== "object" || input === null) {
      return this.cached._parse(input, path);
    }
    if (this.inProgress.has(input)) {
      return fail(path, "invalid_type", {
        expected: "a finite (non-circular) value",
        received: "circular reference",
      });
    }
    this.inProgress.add(input);
    try {
      return this.cached._parse(input, path);
    } finally {
      this.inProgress.delete(input);
    }
  }
}

/**
 * Validate against BOTH schemas and deep-merge the results — the runtime side
 * of `A & B`. Decode-only (a plain {@link Schema}, not a {@link Codec}):
 * encoding an intersection is ambiguous, so it isn't supported, like
 * `transform`. Issues from both sides are reported together.
 */
class IntersectionSchema<A, B> extends Schema<A & B> {
  constructor(
    private readonly left: Schema<A>,
    private readonly right: Schema<B>,
  ) {
    super();
  }

  _parse(input: unknown, path: ReadonlyArray<PropertyKey>): Internal<A & B> {
    const a = this.left._parse(input, path);
    const b = this.right._parse(input, path);
    if (!a.ok || !b.ok) {
      return { ok: false, issues: [...(a.ok ? [] : a.issues), ...(b.ok ? [] : b.issues)] };
    }
    return ok(mergeIntersection(a.value, b.value) as A & B);
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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

/**
 * Validate against both `left` and `right`, producing `A & B` — input must
 * satisfy both schemas, and (for objects) the parsed result carries the fields
 * of both. Useful for combining independent contracts; for two object schemas
 * you control, `a.merge(b)` / `a.extend(...)` is usually clearer.
 *
 * @example
 *   const Entity = object({ id: string() });
 *   const Timestamped = object({ createdAt: date() });
 *   const Row = intersection(Entity, Timestamped); // { id: string } & { createdAt: Date }
 */
export function intersection<A, B>(left: Schema<A>, right: Schema<B>): Schema<A & B> {
  return new IntersectionSchema(left, right);
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
