import { describe, expect, it } from "vitest";
import type { StandardSchemaV1 as OfficialStandardSchemaV1 } from "@standard-schema/spec";

import { array, number, object, string, VENDOR } from "./totalis";

/**
 * A minimal stand-in for how a downstream library (tRPC, Hono, React Hook
 * Form, ...) consumes ANY Standard Schema. It only ever touches the
 * `~standard` property, typed against the OFFICIAL published spec — so if our
 * schemas pass through this, they genuinely conform.
 */
async function standardValidate<T extends OfficialStandardSchemaV1>(
  schema: T,
  input: unknown,
): Promise<OfficialStandardSchemaV1.InferOutput<T>> {
  let result = schema["~standard"].validate(input);
  if (result instanceof Promise) result = await result;
  if (result.issues) {
    throw new Error(JSON.stringify(result.issues, null, 2));
  }
  return result.value as OfficialStandardSchemaV1.InferOutput<T>;
}

describe("Standard Schema v1 conformance — `~standard` props", () => {
  const schema = string();

  it("exposes version 1", () => {
    expect(schema["~standard"].version).toBe(1);
  });

  it("reports the totalis vendor", () => {
    expect(schema["~standard"].vendor).toBe(VENDOR);
    expect(schema["~standard"].vendor).toBe("totalis");
  });

  it("exposes a validate function", () => {
    expect(typeof schema["~standard"].validate).toBe("function");
  });

  it("structurally matches the spec's required props", () => {
    expect(Object.keys(schema["~standard"]).sort()).toEqual(["validate", "vendor", "version"]);
  });
});

describe("Standard Schema v1 conformance — validate() results", () => {
  it("returns a SuccessResult with `value` and no `issues`", () => {
    const result = string()["~standard"].validate("hello");
    expect(result).not.toBeInstanceOf(Promise);
    if (result instanceof Promise) throw new Error("expected sync result");
    expect(result.issues).toBeUndefined();
    if (result.issues) throw new Error("expected success");
    expect(result.value).toBe("hello");
  });

  it("returns a FailureResult with a non-empty `issues` array", () => {
    const result = number()["~standard"].validate("not a number");
    if (result instanceof Promise) throw new Error("expected sync result");
    expect(result.issues).toBeDefined();
    if (!result.issues) throw new Error("expected failure");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(typeof result.issues[0]!.message).toBe("string");
  });

  it("uses an empty path for top-level issues", () => {
    const result = number()["~standard"].validate(true);
    if (result instanceof Promise || !("issues" in result) || !result.issues) {
      throw new Error("expected sync failure");
    }
    expect(result.issues[0]!.path).toEqual([]);
  });

  it("threads a property path for nested object issues", () => {
    const schema = object({ user: object({ name: string() }) });
    const result = schema["~standard"].validate({ user: { name: 42 } });
    if (result instanceof Promise || !result.issues) throw new Error("expected sync failure");
    expect(result.issues[0]!.path).toEqual(["user", "name"]);
  });

  it("threads a numeric index path for array issues", () => {
    const schema = object({ tags: array(string()) });
    const result = schema["~standard"].validate({ tags: ["ok", 123, "fine"] });
    if (result instanceof Promise || !result.issues) throw new Error("expected sync failure");
    expect(result.issues[0]!.path).toEqual(["tags", 1]);
  });

  it("reports every failing field, not just the first", () => {
    const schema = object({ a: string(), b: number() });
    const result = schema["~standard"].validate({ a: 1, b: "x" });
    if (result instanceof Promise || !result.issues) throw new Error("expected sync failure");
    expect(result.issues.map((i) => i.path)).toEqual([["a"], ["b"]]);
  });
});

describe("Standard Schema v1 conformance — consumed as a generic Standard Schema", () => {
  it("validates valid input through a spec-only consumer", async () => {
    const schema = object({ name: string(), age: number() });
    await expect(standardValidate(schema, { name: "Ada", age: 36 })).resolves.toEqual({
      name: "Ada",
      age: 36,
    });
  });

  it("rejects invalid input through a spec-only consumer", async () => {
    const schema = object({ name: string(), age: number() });
    await expect(standardValidate(schema, { name: "Ada", age: "old" })).rejects.toThrow();
  });
});
