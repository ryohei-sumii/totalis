import { describe, expect, it } from "vitest";

import { number, record, string, tuple } from "./totalis";

describe("record", () => {
  const scores = record(number());

  it("accepts a dictionary of valid values", () => {
    expect(scores.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(scores.parse({})).toEqual({});
  });

  it("rejects a non-object", () => {
    expect(scores.safeParse([]).success).toBe(false);
    expect(scores.safeParse("x").success).toBe(false);
    expect(scores.safeParse(null).success).toBe(false);
  });

  it("validates each value and reports the offending key in the path", () => {
    const result = scores.safeParse({ a: 1, b: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual(["b"]);
  });
});

describe("tuple", () => {
  const pair = tuple([string(), number()]);

  it("accepts a tuple with the right shape", () => {
    expect(pair.parse(["a", 1])).toEqual(["a", 1]);
  });

  it("rejects a non-array", () => {
    expect(pair.safeParse({ 0: "a", 1: 1 }).success).toBe(false);
  });

  it("rejects a wrong length", () => {
    expect(pair.safeParse(["a"]).success).toBe(false);
    expect(pair.safeParse(["a", 1, 2]).success).toBe(false);
  });

  it("validates each position and reports the index in the path", () => {
    const result = pair.safeParse([1, 2]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual([0]);
  });
});
