import type { Issue, IssueCode } from "./errors";
import { defaultMessage } from "./errors";

/** Internal parse result threaded through `_parse`. */
export type Internal<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: Issue[] };

export function ok<T>(value: T): Internal<T> {
  return { ok: true, value };
}

export function fail(
  path: ReadonlyArray<PropertyKey>,
  code: IssueCode,
  params: Readonly<Record<string, unknown>> = {},
  message: string = defaultMessage(code, params),
): Internal<never> {
  return { ok: false, issues: [{ code, path, params, message }] };
}

export function typeName(value: unknown): string {
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
export function setKey(target: Record<string, unknown>, key: string, value: unknown): void {
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

/** A non-null, non-array object — the only shape that can be merged field-wise. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge two successfully-parsed values for an {@link IntersectionSchema}.
 * Each side's object/array schema strips fields it doesn't declare, so the
 * result is rebuilt from BOTH sides: objects key-by-key and arrays
 * element-by-element (recursing where a key/index is shared), since both sides
 * validated the same input and so agree on array length. Other scalars come
 * from validating the same input on both sides, so they are already equal — the
 * right value is returned. Uses {@link setKey} + own-key checks so a
 * `"__proto__"` data key can't pollute.
 */
export function mergeIntersection(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((item, i) => mergeIntersection(item, b[i]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(a)) setKey(out, key, a[key]);
  for (const key of Object.keys(b)) {
    const sharedWithA = Object.prototype.hasOwnProperty.call(a, key);
    setKey(out, key, sharedWithA ? mergeIntersection(a[key], b[key]) : b[key]);
  }
  return out;
}
