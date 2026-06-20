import { describe, expect, it } from "vitest";

import { codec, number, object, schemaFor, string, type Infer, type SchemaFor } from "./totalis";

interface User {
  name: string;
  age: number;
  nickname?: string;
}

describe("schemaFor", () => {
  const user = schemaFor<User>()({
    name: string(),
    age: number(),
    nickname: string().optional(),
  });

  it("builds a working schema", () => {
    expect(user.parse({ name: "Ada", age: 36 })).toEqual({ name: "Ada", age: 36 });
    expect(user.parse({ name: "Ada", age: 36, nickname: "A" })).toEqual({
      name: "Ada",
      age: 36,
      nickname: "A",
    });
  });

  it("rejects invalid input", () => {
    expect(user.safeParse({ name: "Ada" }).success).toBe(false);
    expect(user.safeParse({ name: 1, age: "x" }).success).toBe(false);
  });
});

describe("SchemaFor (satisfies style)", () => {
  it("checks a shape while keeping it usable, including codec fields", () => {
    interface Event {
      id: string;
      at: Date;
    }
    const shape = {
      id: string(),
      at: codec(string(), { decode: (s) => new Date(s), encode: (d) => d.toISOString() }),
    } satisfies SchemaFor<Event>;

    const event = object(shape);
    const parsed: Infer<typeof event> = event.parse({
      id: "e1",
      at: "2026-06-20T00:00:00.000Z",
    });
    expect(parsed.id).toBe("e1");
    expect(parsed.at).toBeInstanceOf(Date);
  });
});
