import { describe, expect, it } from "vitest";

import {
  array,
  assertNever,
  discriminatedUnion,
  int,
  literal,
  match,
  number,
  object,
  string,
} from "./totalis";

describe("brand & refine", () => {
  it("passes branded values through unchanged at runtime", () => {
    const email = string().brand<"Email">();
    expect(email.parse("a@b.com")).toBe("a@b.com");
    expect(email.safeParse(123).success).toBe(false);
  });

  it("applies the refinement predicate", () => {
    const positive = number().refine((n) => n > 0, "Expected a positive number");
    expect(positive.parse(5)).toBe(5);
    const result = positive.safeParse(-1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe("Expected a positive number");
  });
});

describe("int", () => {
  it("accepts integers and rejects non-integers", () => {
    expect(int().parse(42)).toBe(42);
    expect(int().safeParse(1.5).success).toBe(false);
    expect(int().safeParse("3").success).toBe(false);
  });
});

describe("array().nonempty()", () => {
  const schema = array(string()).nonempty();

  it("accepts a non-empty array", () => {
    expect(schema.parse(["a"])).toEqual(["a"]);
  });

  it("rejects an empty array", () => {
    const result = schema.safeParse([]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe("Expected a non-empty array");
  });
});

describe("discriminatedUnion", () => {
  const shape = discriminatedUnion("type", [
    object({ type: literal("circle"), radius: number() }),
    object({ type: literal("square"), side: number() }),
  ]);

  it("parses the matching variant", () => {
    expect(shape.parse({ type: "circle", radius: 2 })).toEqual({ type: "circle", radius: 2 });
    expect(shape.parse({ type: "square", side: 3 })).toEqual({ type: "square", side: 3 });
  });

  it("validates the matched variant's fields", () => {
    expect(shape.safeParse({ type: "circle", radius: "big" }).success).toBe(false);
  });

  it("rejects an unknown discriminant with a helpful message and path", () => {
    const result = shape.safeParse({ type: "triangle" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      expect(issue.path).toEqual(["type"]);
      expect(issue.message).toContain("circle");
      expect(issue.message).toContain("square");
    }
  });

  it("throws at construction on a duplicate discriminant (no unreachable variant)", () => {
    expect(() =>
      discriminatedUnion("type", [
        object({ type: literal("a"), x: number() }),
        object({ type: literal("a"), y: string() }),
      ]),
    ).toThrow(/duplicate discriminant/);
  });
});

describe("match & assertNever", () => {
  type Shape =
    | { type: "circle"; radius: number }
    | { type: "square"; side: number };

  const area = (shape: Shape): number =>
    match(shape, "type", {
      circle: (c) => Math.PI * c.radius ** 2,
      square: (s) => s.side ** 2,
    });

  it("dispatches to the correct handler", () => {
    expect(area({ type: "square", side: 4 })).toBe(16);
    expect(area({ type: "circle", radius: 1 })).toBeCloseTo(Math.PI);
  });

  it("assertNever throws when reached at runtime", () => {
    expect(() => assertNever("unexpected" as never)).toThrow(/Unhandled variant/);
  });
});
