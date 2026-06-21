import { describe, expect, it } from "vitest";

import { codecFor, object, string } from "./totalis";

// Two independently-declared contracts: the wire shape and the domain model.
interface WireUser {
  createdAt: string;
}
interface User {
  createdAt: Date;
}

describe("codecFor (exact, bidirectional codec)", () => {
  const User = codecFor<User, WireUser>()(object({ createdAt: string() }), {
    decode: (w) => ({ createdAt: new Date(w.createdAt) }),
    encode: (u) => ({ createdAt: u.createdAt.toISOString() }),
  });

  it("decodes the wire type into the domain type", () => {
    const decoded = User.parse({ createdAt: "2026-06-20T00:00:00.000Z" });
    expect(decoded.createdAt).toBeInstanceOf(Date);
    expect(decoded.createdAt.getUTCFullYear()).toBe(2026);
  });

  it("encodes the domain type back to the wire type", () => {
    expect(User.encode({ createdAt: new Date(0) })).toEqual({
      createdAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("round-trips", () => {
    const wire = { createdAt: "2026-06-20T12:34:56.000Z" };
    expect(User.encode(User.parse(wire))).toEqual(wire);
  });

  it("validates the wire representation before decoding", () => {
    expect(User.safeParse({ createdAt: 42 }).success).toBe(false);
  });
});
