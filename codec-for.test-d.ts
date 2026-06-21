/**
 * Type-level guarantees for `codecFor` — exact completeness on BOTH directions
 * of a codec, the wedge Zod's `z.codec` can't express (it infers the input
 * type from the base, so it can't check the base against a declared `Encoded`).
 */
import { describe, expectTypeOf, test } from "vitest";

import { codecFor, enumFor, object, string, type Infer, type InferInput } from "./totalis";

interface WireUser {
  createdAt: string;
}
interface User {
  createdAt: Date;
}

describe("codecFor pins both ends to the declared contracts", () => {
  const UserCodec = codecFor<User, WireUser>()(object({ createdAt: string() }), {
    decode: (w) => ({ createdAt: new Date(w.createdAt) }),
    encode: (u) => ({ createdAt: u.createdAt.toISOString() }),
  });

  test("Infer is exactly Decoded, InferInput is exactly Encoded", () => {
    expectTypeOf<Infer<typeof UserCodec>>().toEqualTypeOf<User>();
    expectTypeOf<InferInput<typeof UserCodec>>().toEqualTypeOf<WireUser>();
  });
});

describe("a base that doesn't decode EXACTLY to Encoded fails to compile", () => {
  test("a too-narrow base is rejected (assignable to string, but not exact)", () => {
    codecFor<number, string>()(
      // @ts-expect-error — base decodes to "a", not exactly `string` (Encoded drift).
      enumFor<"a">()(["a"]),
      { decode: (s) => s.length, encode: (n) => String(n) },
    );
  });
});
