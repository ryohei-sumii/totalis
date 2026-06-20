/**
 * Type-level conformance for Standard Schema v1, as vitest type tests
 * (run by `npm test` via `typecheck`, and by `tsc --noEmit`).
 *
 * Guarantees that runtime tests cannot:
 *   1. The vendored `StandardSchemaV1` stays bidirectionally assignable with
 *      the OFFICIAL published `@standard-schema/spec` — it can't drift.
 *   2. Every totalis schema is assignable to the official `StandardSchemaV1`.
 *   3. The spec's `InferOutput` recovers exactly the validated type, no `any`.
 */
import { assertType, describe, expectTypeOf, test } from "vitest";
import type { StandardSchemaV1 as OfficialStandardSchemaV1 } from "@standard-schema/spec";

import {
  array,
  boolean,
  literal,
  number,
  object,
  string,
  type StandardSchemaV1 as VendoredStandardSchemaV1,
} from "./totalis";

const str = string();
const lit = literal("on");
const user = object({ name: string(), age: number(), nickname: string().optional() });

describe("vendored spec stays in sync with @standard-schema/spec", () => {
  test("Props is bidirectionally assignable with the official Props", () => {
    expectTypeOf<VendoredStandardSchemaV1.Props<{ a: string }>>().toEqualTypeOf<
      OfficialStandardSchemaV1.Props<{ a: string }>
    >();
  });

  test("the interface is bidirectionally assignable with the official one", () => {
    expectTypeOf<VendoredStandardSchemaV1<{ a: string }>>().toEqualTypeOf<
      OfficialStandardSchemaV1<{ a: string }>
    >();
  });
});

describe("totalis schemas satisfy the official Standard Schema interface", () => {
  test("primitives", () => {
    assertType<OfficialStandardSchemaV1<string, string>>(string());
    assertType<OfficialStandardSchemaV1<number, number>>(number());
    assertType<OfficialStandardSchemaV1<boolean, boolean>>(boolean());
    assertType<OfficialStandardSchemaV1<"on", "on">>(literal("on"));
    assertType<OfficialStandardSchemaV1<string[], string[]>>(array(string()));
  });

  test("objects (including optional keys)", () => {
    const user = object({ name: string(), age: number(), nickname: string().optional() });
    assertType<OfficialStandardSchemaV1>(user);
  });
});

describe("InferOutput recovers the exact validated type", () => {
  test("primitives and literals", () => {
    expectTypeOf<OfficialStandardSchemaV1.InferOutput<typeof str>>().toEqualTypeOf<string>();
    expectTypeOf<OfficialStandardSchemaV1.InferOutput<typeof lit>>().toEqualTypeOf<"on">();
  });

  test("objects, agreeing with the vendored InferOutput, with no `any` leak", () => {
    type Expected = { name: string; age: number; nickname?: string | undefined };
    expectTypeOf<OfficialStandardSchemaV1.InferOutput<typeof user>>().toEqualTypeOf<Expected>();
    expectTypeOf<
      VendoredStandardSchemaV1.InferOutput<typeof user>
    >().toEqualTypeOf<OfficialStandardSchemaV1.InferOutput<typeof user>>();
    expectTypeOf<OfficialStandardSchemaV1.InferOutput<typeof user>>().not.toBeAny();
  });
});
