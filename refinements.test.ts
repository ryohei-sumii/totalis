import { describe, expect, it } from "vitest";

import { number, string } from "./totalis";

describe("string refinements", () => {
  it("min / max / length on character count", () => {
    expect(string().min(2).safeParse("a").success).toBe(false);
    expect(string().min(2).safeParse("ab").success).toBe(true);
    expect(string().max(2).safeParse("abc").success).toBe(false);
    expect(string().length(3).safeParse("abc").success).toBe(true);
    expect(string().length(3).safeParse("ab").success).toBe(false);
  });

  it("chains, running all checks", () => {
    const schema = string().min(2).max(4);
    expect(schema.safeParse("a").success).toBe(false);
    expect(schema.safeParse("abc").success).toBe(true);
    expect(schema.safeParse("abcde").success).toBe(false);
  });

  it("email / url / uuid / regex", () => {
    expect(string().email().safeParse("a@b.com").success).toBe(true);
    expect(string().email().safeParse("nope").success).toBe(false);
    expect(string().url().safeParse("https://example.com").success).toBe(true);
    expect(string().url().safeParse("not a url").success).toBe(false);
    expect(string().uuid().safeParse("00000000-0000-0000-0000-000000000000").success).toBe(true);
    expect(string().uuid().safeParse("xyz").success).toBe(false);
    expect(string().regex(/^a+$/).safeParse("aaa").success).toBe(true);
    expect(string().regex(/^a+$/).safeParse("aab").success).toBe(false);
  });

  it("reports a structured code for a format failure", () => {
    const result = string().email().safeParse("nope");
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues[0]!.code).toBe("invalid_string");
    expect(result.error.issues[0]!.params).toMatchObject({ validation: "email" });
  });

  it("still rejects non-strings before running checks", () => {
    expect(string().min(2).safeParse(42).success).toBe(false);
  });
});

describe("number refinements", () => {
  it("min / max / positive / nonnegative", () => {
    expect(number().min(0).safeParse(-1).success).toBe(false);
    expect(number().max(10).safeParse(11).success).toBe(false);
    expect(number().positive().safeParse(0).success).toBe(false);
    expect(number().positive().safeParse(1).success).toBe(true);
    expect(number().nonnegative().safeParse(0).success).toBe(true);
    expect(number().nonnegative().safeParse(-1).success).toBe(false);
  });

  it("multipleOf", () => {
    expect(number().multipleOf(5).safeParse(10).success).toBe(true);
    expect(number().multipleOf(5).safeParse(7).success).toBe(false);
    const result = number().multipleOf(5).safeParse(7);
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues[0]!.code).toBe("not_multiple_of");
  });

  it("chains", () => {
    const port = number().min(1).max(65535);
    expect(port.safeParse(0).success).toBe(false);
    expect(port.safeParse(8080).success).toBe(true);
  });
});
