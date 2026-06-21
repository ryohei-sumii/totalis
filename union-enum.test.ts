import { describe, expect, it } from "vitest";

import { enumFor, literal, number, object, objectCodec, unionFor } from "./totalis";

describe("enumFor (exhaustive literal enum)", () => {
  type Role = "admin" | "user" | "guest";
  const Role = enumFor<Role>()(["admin", "user", "guest"]);

  it("accepts declared members", () => {
    expect(Role.parse("admin")).toBe("admin");
    expect(Role.parse("guest")).toBe("guest");
  });

  it("rejects a non-member with invalid_value", () => {
    const result = Role.safeParse("root");
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      expect(issue.code).toBe("invalid_value");
      expect(issue.message).toContain("admin");
    }
  });

  it("is an identity codec — usable as an objectCodec field that round-trips", () => {
    const rec = objectCodec({ role: enumFor<"a" | "b">()(["a", "b"]) });
    expect(rec.parse({ role: "a" })).toEqual({ role: "a" });
    expect(rec.encode({ role: "b" })).toEqual({ role: "b" });
  });
});

describe("unionFor (exhaustive discriminated union)", () => {
  type Shape = { kind: "circle"; r: number } | { kind: "square"; s: number };
  const Shape = unionFor<Shape>()("kind", [
    object({ kind: literal("circle"), r: number() }),
    object({ kind: literal("square"), s: number() }),
  ]);

  it("parses each covered variant", () => {
    expect(Shape.parse({ kind: "circle", r: 2 })).toEqual({ kind: "circle", r: 2 });
    expect(Shape.parse({ kind: "square", s: 3 })).toEqual({ kind: "square", s: 3 });
  });

  it("rejects an unknown discriminant", () => {
    const result = Shape.safeParse({ kind: "triangle" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual(["kind"]);
  });

  it("validates the matched variant's fields", () => {
    expect(Shape.safeParse({ kind: "circle", r: "big" }).success).toBe(false);
  });
});
