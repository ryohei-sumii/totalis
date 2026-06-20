/**
 * Type-level conformance for Standard Schema v1.
 *
 * This file has no runtime behavior; it is validated purely by `tsc --noEmit`.
 * It guarantees three things that runtime tests cannot:
 *
 *   1. Our vendored `StandardSchemaV1` interface stays bidirectionally
 *      assignable with the OFFICIAL published `@standard-schema/spec` — so the
 *      vendored copy cannot silently drift from the spec.
 *   2. Every totalis schema is assignable to the official `StandardSchemaV1`.
 *   3. The spec's `InferOutput` recovers exactly the validated type — no
 *      widening, no `any` leak.
 */
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

// --- tiny type-level assertion kit -----------------------------------------

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Expect<T extends true> = T;

// --- 1. vendored spec <-> official spec are bidirectionally assignable ------

declare const vendoredProps: VendoredStandardSchemaV1.Props<{ a: string }, { a: string }>;
declare const officialProps: OfficialStandardSchemaV1.Props<{ a: string }, { a: string }>;

// Assigning each to the other proves structural equivalence in both directions.
const _propsVendoredToOfficial: OfficialStandardSchemaV1.Props<{ a: string }, { a: string }> =
  vendoredProps;
const _propsOfficialToVendored: VendoredStandardSchemaV1.Props<{ a: string }, { a: string }> =
  officialProps;

declare const vendoredSchema: VendoredStandardSchemaV1<{ a: string }, { a: string }>;
const _schemaVendoredToOfficial: OfficialStandardSchemaV1<{ a: string }, { a: string }> =
  vendoredSchema;

// --- 2. concrete totalis schemas satisfy the official interface -------------

const _str: OfficialStandardSchemaV1<string, string> = string();
const _num: OfficialStandardSchemaV1<number, number> = number();
const _bool: OfficialStandardSchemaV1<boolean, boolean> = boolean();
const _lit: OfficialStandardSchemaV1<"on", "on"> = literal("on");
const _arr: OfficialStandardSchemaV1<string[], string[]> = array(string());

const userSchema = object({
  name: string(),
  age: number(),
  nickname: string().optional(),
});
userSchema satisfies OfficialStandardSchemaV1;

// --- 3. InferOutput recovers the exact validated type -----------------------

type _InferString = Expect<Equals<OfficialStandardSchemaV1.InferOutput<typeof _str>, string>>;
type _InferLiteral = Expect<Equals<OfficialStandardSchemaV1.InferOutput<typeof _lit>, "on">>;
type _InferUser = Expect<
  Equals<
    OfficialStandardSchemaV1.InferOutput<typeof userSchema>,
    { name: string; age: number; nickname?: string | undefined }
  >
>;

// The vendored InferOutput must agree with the official one.
type _InferUserVendored = Expect<
  Equals<
    VendoredStandardSchemaV1.InferOutput<typeof userSchema>,
    OfficialStandardSchemaV1.InferOutput<typeof userSchema>
  >
>;

// Guard against `any` leaking into the inferred output.
type IsAny<T> = 0 extends 1 & T ? true : false;
type _NoAnyLeak = Expect<Equals<IsAny<OfficialStandardSchemaV1.InferOutput<typeof userSchema>>, false>>;

// Reference the assignment bindings so `noUnusedLocals`-style lints stay happy.
export const _conformanceWitnesses = [
  _propsVendoredToOfficial,
  _propsOfficialToVendored,
  _schemaVendoredToOfficial,
  _str,
  _num,
  _bool,
  _lit,
  _arr,
];
