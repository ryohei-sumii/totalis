import { describe, expect, it } from "vitest";

import { coerce, int, number } from "./totalis";

describe("coerce.number", () => {
  it("coerces a numeric string", () => {
    const r = coerce.number().safeParse("42");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(42);
  });

  it("rejects an un-coercible string (NaN)", () => {
    expect(coerce.number().safeParse("abc").success).toBe(false);
  });

  it("runs the refined base AFTER coercing", () => {
    const port = coerce.number(number().min(1).max(65535));
    expect(port.safeParse("0").success).toBe(false);
    expect(port.safeParse("8080").success).toBe(true);
    if (port.safeParse("8080").success) {
      const r = port.safeParse("8080");
      if (r.success) expect(r.data).toBe(8080);
    }
  });

  it("preserves a branded base like int()", () => {
    expect(coerce.number(int()).safeParse("7").success).toBe(true);
    expect(coerce.number(int()).safeParse("7.5").success).toBe(false);
  });
});

describe("coerce never throws (safeParse contract) on throwing coercions", () => {
  it("returns a failure instead of throwing on a symbol / bigint", () => {
    // Number(symbol) and new Date(bigint) throw TypeError in JS.
    expect(() => coerce.number().safeParse(Symbol("x"))).not.toThrow();
    expect(coerce.number().safeParse(Symbol("x")).success).toBe(false);
    expect(() => coerce.date().safeParse(10n)).not.toThrow();
    expect(coerce.date().safeParse(10n).success).toBe(false);
  });
});

describe("coerce.string", () => {
  it("coerces a number to its string form", () => {
    const r = coerce.string().safeParse(42);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("42");
  });
});

describe("coerce.boolean", () => {
  it("uses JS truthiness", () => {
    const r1 = coerce.boolean().safeParse(1);
    expect(r1.success && r1.data).toBe(true);
    const r0 = coerce.boolean().safeParse(0);
    expect(r0.success && r0.data).toBe(false);
  });
});

describe("coerce.date", () => {
  it("coerces an ISO string to a Date", () => {
    const r = coerce.date().safeParse("2026-01-01T00:00:00.000Z");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeInstanceOf(Date);
  });

  it("passes a Date through unchanged", () => {
    const d = new Date("2026-06-21");
    const r = coerce.date().safeParse(d);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.getTime()).toBe(d.getTime());
  });

  it("rejects an un-coercible date string", () => {
    expect(coerce.date().safeParse("nope").success).toBe(false);
  });
});
