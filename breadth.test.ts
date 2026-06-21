import { describe, expect, it } from "vitest";

import { date, nullable, number, object, string, union } from "./totalis";

describe("date", () => {
  it("accepts a valid Date", () => {
    const d = new Date(0);
    expect(date().parse(d)).toBe(d);
  });

  it("rejects a non-Date", () => {
    expect(date().safeParse("2026-01-01").success).toBe(false);
    expect(date().safeParse(0).success).toBe(false);
  });

  it("rejects an invalid Date (NaN time)", () => {
    expect(date().safeParse(new Date("nope")).success).toBe(false);
  });
});

describe("nullable", () => {
  const schema = object({ note: string().nullable() });

  it("accepts null", () => {
    expect(schema.parse({ note: null })).toEqual({ note: null });
  });

  it("accepts the inner type", () => {
    expect(schema.parse({ note: "hi" })).toEqual({ note: "hi" });
  });

  it("rejects other types", () => {
    expect(schema.safeParse({ note: 42 }).success).toBe(false);
  });

  it("is distinct from optional (null required, not absent)", () => {
    // `note` is nullable but NOT optional, so a missing key fails.
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("works via the standalone helper too", () => {
    expect(nullable(number()).parse(null)).toBe(null);
    expect(nullable(number()).parse(5)).toBe(5);
  });
});

describe("union (non-discriminated)", () => {
  const schema = union([string(), number()]);

  it("accepts any member", () => {
    expect(schema.parse("a")).toBe("a");
    expect(schema.parse(3)).toBe(3);
  });

  it("rejects a value matching no member, with invalid_union", () => {
    const result = schema.safeParse(true);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.code).toBe("invalid_union");
      expect(result.error.issues[0]!.message).toContain("union");
    }
  });

  it("tries members in order", () => {
    expect(union([number(), string()]).parse("x")).toBe("x");
  });
});
