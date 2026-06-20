import { describe, expect, it } from "vitest";

import { array, codec, number, object, objectCodec, string } from "./totalis";

const isoDateCodec = codec(string(), {
  decode: (s: string) => new Date(s),
  encode: (d: Date) => d.toISOString(),
});

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

  it("a thunk default yields a fresh value each parse (not shared)", () => {
    const s = object({ tags: array(string()).default(() => []) });
    const a = s.parse({});
    const b = s.parse({});
    expect(a.tags).not.toBe(b.tags); // distinct instances
    a.tags.push("x");
    expect(b.tags).toEqual([]); // mutating one must not affect the other
  });

  it("supports a thunk default (called fresh each parse)", () => {
    let n = 0;
    const s = object({ id: number().default(() => ++n) });
    expect(s.parse({})).toEqual({ id: 1 });
    expect(s.parse({})).toEqual({ id: 2 });
  });

  it("a class-instance (Date) default is returned as-is, prototype intact", () => {
    const now = new Date(0);
    const dateFromIso = codec(string(), { decode: (v) => new Date(v), encode: (d) => d.toISOString() });
    const s = object({ at: dateFromIso.default(now) });
    const parsed = s.parse({});
    expect(parsed.at).toBe(now); // not cloned
    expect(parsed.at).toBeInstanceOf(Date); // prototype intact
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

describe("objectCodec (object-level encode)", () => {
  const Event = objectCodec({
    id: string(),
    at: isoDateCodec,
    label: string().optional(),
  });

  it("decodes input -> output via parse", () => {
    const decoded = Event.parse({ id: "e1", at: "2026-06-20T00:00:00.000Z" });
    expect(decoded.id).toBe("e1");
    expect(decoded.at).toBeInstanceOf(Date);
  });

  it("encodes output -> input field-by-field", () => {
    const encoded = Event.encode({ id: "e1", at: new Date(0) });
    expect(encoded).toEqual({ id: "e1", at: "1970-01-01T00:00:00.000Z" });
  });

  it("round-trips", () => {
    const input = { id: "e1", at: "2026-06-20T12:34:56.000Z", label: "launch" };
    expect(Event.encode(Event.parse(input))).toEqual(input);
  });

  it("handles an optional codec field on encode", () => {
    expect(Event.encode({ id: "e1", at: new Date(0) })).not.toHaveProperty("label");
  });

  it("nests another objectCodec", () => {
    const Outer = objectCodec({ when: isoDateCodec, inner: Event });
    const decoded = Outer.parse({
      when: "2026-01-01T00:00:00.000Z",
      inner: { id: "x", at: "2026-02-02T00:00:00.000Z" },
    });
    expect(decoded.when).toBeInstanceOf(Date);
    expect(decoded.inner.at).toBeInstanceOf(Date);
    const reencoded = Outer.encode(decoded);
    expect(reencoded.inner.at).toBe("2026-02-02T00:00:00.000Z");
  });

  it("still validates on decode", () => {
    expect(Event.safeParse({ id: 1, at: "2026-06-20T00:00:00.000Z" }).success).toBe(false);
  });
});
