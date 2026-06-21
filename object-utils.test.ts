import { describe, expect, it } from "vitest";

import { number, object, string } from "./totalis";

const User = object({
  id: string(),
  name: string(),
  age: number(),
});

describe("object().pick", () => {
  it("keeps only the named fields and rejects extras silently dropped", () => {
    const schema = User.pick(["id", "name"]);
    const r = schema.safeParse({ id: "u1", name: "Ada", age: 30 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ id: "u1", name: "Ada" });
  });

  it("still requires the picked fields", () => {
    expect(User.pick(["id", "name"]).safeParse({ id: "u1" }).success).toBe(false);
  });
});

describe("object().omit", () => {
  it("drops the named fields", () => {
    const schema = User.omit(["age"]);
    const r = schema.safeParse({ id: "u1", name: "Ada" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ id: "u1", name: "Ada" });
  });

  it("no longer validates the omitted field", () => {
    // age is gone, so a bad age no longer fails the schema
    expect(User.omit(["age"]).safeParse({ id: "u1", name: "Ada", age: "nope" }).success).toBe(true);
  });
});

describe("object().partial", () => {
  it("makes every field optional", () => {
    const schema = User.partial();
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ name: "Ada" }).success).toBe(true);
  });

  it("still validates fields that ARE present", () => {
    expect(User.partial().safeParse({ age: "nope" }).success).toBe(false);
  });
});

describe("object().extend", () => {
  it("adds new fields", () => {
    const schema = User.extend({ admin: string() });
    expect(schema.safeParse({ id: "u1", name: "Ada", age: 30, admin: "yes" }).success).toBe(true);
    expect(schema.safeParse({ id: "u1", name: "Ada", age: 30 }).success).toBe(false);
  });

  it("overrides a colliding field with the new schema", () => {
    // age was number(); override with string()
    const schema = User.extend({ age: string() });
    expect(schema.safeParse({ id: "u1", name: "Ada", age: "thirty" }).success).toBe(true);
    expect(schema.safeParse({ id: "u1", name: "Ada", age: 30 }).success).toBe(false);
  });
});

describe("object().merge", () => {
  it("combines two object schemas", () => {
    const Timestamps = object({ createdAt: string() });
    const schema = User.merge(Timestamps);
    expect(
      schema.safeParse({ id: "u1", name: "Ada", age: 30, createdAt: "2026-01-01" }).success,
    ).toBe(true);
    expect(schema.safeParse({ id: "u1", name: "Ada", age: 30 }).success).toBe(false);
  });
});

describe("derived schemas do not mutate the source", () => {
  it("pick/omit/extend leave the original intact", () => {
    User.pick(["id"]);
    User.omit(["id"]);
    User.extend({ extra: string() });
    expect(User.safeParse({ id: "u1", name: "Ada", age: 30 }).success).toBe(true);
    // the original still requires all three fields
    expect(User.safeParse({ id: "u1", name: "Ada" }).success).toBe(false);
  });
});
