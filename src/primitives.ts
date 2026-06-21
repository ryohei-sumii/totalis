import type { IssueCode } from "./errors";
import type { Branded } from "./schema";
import { Codec, Schema } from "./schema";
import type { Internal } from "./util";
import { fail, ok, typeName } from "./util";

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
export interface Check<T> {
  readonly run: (value: T) => boolean;
  readonly code: IssueCode;
  readonly params: Readonly<Record<string, unknown>>;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export class StringSchema extends Codec<string> {
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

export class DateSchema extends Codec<Date> {
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

export class NumberSchema extends Codec<number> {
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

export class BooleanSchema extends Codec<boolean> {
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
export class CoerceSchema<O> extends Schema<O, unknown> {
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

/** Literal primitive values that can be matched exactly. */
export type Literal = string | number | boolean | null;

export class LiteralSchema<L extends Literal> extends Codec<L> {
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
