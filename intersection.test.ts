import { describe, expect, it } from "vitest";

import { array, date, intersection, number, object, string } from "./totalis";

describe("intersection (A & B)", () => {
  const Entity = object({ id: string() });
  const Timestamped = object({ createdAt: date() });
  const Row = intersection(Entity, Timestamped);

  it("requires the fields of both and carries them in the output", () => {
    const at = new Date("2026-01-01");
    const r = Row.safeParse({ id: "r1", createdAt: at });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ id: "r1", createdAt: at });
  });

  it("fails when either side is unsatisfied", () => {
    expect(Row.safeParse({ id: "r1" }).success).toBe(false); // missing createdAt
    expect(Row.safeParse({ createdAt: new Date() }).success).toBe(false); // missing id
  });

  it("reports issues from both sides together", () => {
    const r = Row.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("id");
      expect(paths).toContain("createdAt");
    }
  });

  it("deep-merges shared object-valued keys (each side strips its own)", () => {
    // Each side declares a different sub-field of `meta`; the object schema
    // strips undeclared keys, so the merge must reunite them.
    const A = object({ meta: object({ a: string() }) });
    const B = object({ meta: object({ b: number() }) });
    const r = intersection(A, B).safeParse({ meta: { a: "x", b: 1 } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ meta: { a: "x", b: 1 } });
  });

  it("deep-merges array elements (each side strips its own fields)", () => {
    const A = object({ items: array(object({ a: string() })) });
    const B = object({ items: array(object({ b: number() })) });
    const r = intersection(A, B).safeParse({ items: [{ a: "x", b: 1 }, { a: "y", b: 2 }] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ items: [{ a: "x", b: 1 }, { a: "y", b: 2 }] });
    }
  });

  it("combines primitive refinements (output stays the primitive)", () => {
    const between = intersection(string().min(3), string().max(5));
    expect(between.safeParse("ab").success).toBe(false);
    expect(between.safeParse("abcd").success).toBe(true);
    expect(between.safeParse("abcdef").success).toBe(false);
    const r = between.safeParse("abcd");
    if (r.success) expect(r.data).toBe("abcd");
  });

  it("does not pollute via a '__proto__' data key while merging", () => {
    const A = object({ ["__proto__"]: string() });
    const B = object({ id: string() });
    const r = intersection(A, B).safeParse({ ["__proto__"]: "x", id: "i" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Object.getPrototypeOf(r.data)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(r.data, "__proto__")).toBe(true);
    }
  });
});
