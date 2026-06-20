import { describe, expect, it } from "vitest";

import { array, literal, number, object, string, type Localizer } from "./totalis";

describe("structured issues (code + params)", () => {
  it("carries a machine-readable code and params for type errors", () => {
    const result = number().safeParse("x");
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues[0]!;
    expect(issue.code).toBe("invalid_type");
    expect(issue.params).toEqual({ expected: "number", received: "string" });
    expect(issue.message).toBe("Expected number, received string");
  });

  it("uses invalid_literal with the expected/received values", () => {
    const result = literal("on").safeParse("off");
    if (result.success) return;
    const issue = result.error.issues[0]!;
    expect(issue.code).toBe("invalid_literal");
    expect(issue.params).toEqual({ expected: "on", received: "off" });
  });
});

describe("ValidationError.format() — tree", () => {
  const schema = object({
    name: string(),
    address: object({ city: string(), zip: number() }),
    tags: array(string()),
  });
  const result = schema.safeParse({
    name: 1,
    address: { city: 2, zip: "x" },
    tags: ["ok", 3],
  });

  it("mirrors the input shape", () => {
    if (result.success) throw new Error("expected failure");
    const tree = result.error.format();
    expect(tree.errors).toEqual([]);
    expect(tree.properties?.name?.errors).toHaveLength(1);
    expect(tree.properties?.address?.properties?.city?.errors).toHaveLength(1);
    expect(tree.properties?.address?.properties?.zip?.errors).toHaveLength(1);
    expect(tree.properties?.tags?.items?.[1]?.errors).toHaveLength(1);
    // index 0 was valid, so it has no node
    expect(tree.properties?.tags?.items?.[0]).toBeUndefined();
  });
});

describe("ValidationError.flatten()", () => {
  it("splits top-level (form) errors from per-field errors", () => {
    const schema = object({ name: string(), age: number() });
    const result = schema.safeParse({ name: 1, age: "x" });
    if (result.success) throw new Error("expected failure");
    const flat = result.error.flatten();
    expect(flat.formErrors).toEqual([]);
    expect(Object.keys(flat.fieldErrors).sort()).toEqual(["age", "name"]);
    expect(flat.fieldErrors.name).toHaveLength(1);
  });

  it("puts a top-level type error under formErrors", () => {
    const result = number().safeParse("x");
    if (result.success) throw new Error("expected failure");
    const flat = result.error.flatten();
    expect(flat.formErrors).toHaveLength(1);
    expect(flat.fieldErrors).toEqual({});
  });
});

describe("i18n via a Localizer", () => {
  const ja: Localizer = (issue) =>
    issue.code === "invalid_type"
      ? `型が違います: ${String(issue.params.expected)} を期待`
      : issue.message;

  it("re-renders messages in flatten()", () => {
    const result = object({ name: string() }).safeParse({ name: 1 });
    if (result.success) throw new Error("expected failure");
    expect(result.error.flatten(ja).fieldErrors.name?.[0]).toBe("型が違います: string を期待");
  });

  it("re-renders messages in format()", () => {
    const result = object({ name: string() }).safeParse({ name: 1 });
    if (result.success) throw new Error("expected failure");
    expect(result.error.format(ja).properties?.name?.errors[0]).toBe("型が違います: string を期待");
  });
});
