import { describe, expect, it } from "vitest";

import { codec, number, object, string } from "./totalis";

describe("transform", () => {
  it("maps the decoded value", () => {
    const len = string().transform((s) => s.length);
    expect(len.parse("hello")).toBe(5);
  });

  it("runs only after the base validates", () => {
    const len = string().transform((s) => s.length);
    expect(len.safeParse(123).success).toBe(false);
  });

  it("composes inside objects", () => {
    const schema = object({ name: string().transform((s) => s.toUpperCase()) });
    expect(schema.parse({ name: "ada" })).toEqual({ name: "ADA" });
  });
});

describe("default", () => {
  const schema = object({
    page: number().default(1),
    q: string().optional(),
  });

  it("fills in the default when the key is missing", () => {
    expect(schema.parse({})).toEqual({ page: 1 });
  });

  it("fills in the default when the value is undefined", () => {
    expect(schema.parse({ page: undefined })).toEqual({ page: 1 });
  });

  it("keeps a provided value", () => {
    expect(schema.parse({ page: 3 })).toEqual({ page: 3 });
  });

  it("still validates a provided value", () => {
    expect(schema.safeParse({ page: "nope" }).success).toBe(false);
  });
});

describe("codec (bidirectional)", () => {
  const isoDate = codec(string(), {
    decode: (s) => new Date(s),
    encode: (d) => d.toISOString(),
  });

  it("decodes input -> output via parse", () => {
    const decoded = isoDate.parse("2026-06-20T00:00:00.000Z");
    expect(decoded).toBeInstanceOf(Date);
    expect(decoded.getUTCFullYear()).toBe(2026);
  });

  it("encodes output -> input via encode", () => {
    expect(isoDate.encode(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
  });

  it("round-trips", () => {
    const input = "2026-06-20T12:34:56.000Z";
    expect(isoDate.encode(isoDate.parse(input))).toBe(input);
  });

  it("validates the input representation before decoding", () => {
    expect(isoDate.safeParse(42).success).toBe(false);
  });

  it("exposes the decode direction through Standard Schema", () => {
    const result = isoDate["~standard"].validate("2026-06-20T00:00:00.000Z");
    if (result instanceof Promise || result.issues) throw new Error("expected sync success");
    expect(result.value).toBeInstanceOf(Date);
  });
});
