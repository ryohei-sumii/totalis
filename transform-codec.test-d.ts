/**
 * Type-level guarantees for the two-param `Schema<Output, Input>` (roadmap 2).
 * Validated by `tsc --noEmit`.
 *
 *   - transform / default / codec are type-safe: Output and Input diverge
 *     exactly as expected, and `Infer` / `InferInput` recover both.
 *   - codecs are bidirectional and round-trip-typed; transformed schemas are
 *     decode-only — calling `.encode()` on one must NOT compile.
 */
import type { StandardSchemaV1 as OfficialStandardSchemaV1 } from "@standard-schema/spec";

import {
  codec,
  number,
  string,
  type Infer,
  type InferInput,
} from "./totalis";

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// --- transform: Output changes, Input is preserved --------------------------

const len = string().transform((s) => s.length);
type _TOut = Expect<Equals<Infer<typeof len>, number>>;
type _TIn = Expect<Equals<InferInput<typeof len>, string>>;

// A transformed schema is decode-only: there is no `encode` to call.
// @ts-expect-error — transform is one-directional; `encode` does not exist.
len.encode(5);

// --- default: Input gains undefined, Output does not ------------------------

const withDefault = number().default(1);
type _DOut = Expect<Equals<Infer<typeof withDefault>, number>>;
type _DIn = Expect<Equals<InferInput<typeof withDefault>, number | undefined>>;

// --- codec: bidirectional, both directions typed ----------------------------

const isoDate = codec(string(), {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
});
type _COut = Expect<Equals<Infer<typeof isoDate>, Date>>;
type _CIn = Expect<Equals<InferInput<typeof isoDate>, string>>;

const decoded: Date = isoDate.parse("2026-06-20T00:00:00.000Z");
const encoded: string = isoDate.encode(decoded); // ✅ encode is typed Output -> Input

// @ts-expect-error — encode takes the Output type (Date), not a string.
isoDate.encode("2026-06-20");

// --- Standard Schema reflects the input/output split ------------------------

type _StdOut = Expect<
  Equals<OfficialStandardSchemaV1.InferOutput<typeof isoDate>, Date>
>;
type _StdIn = Expect<
  Equals<OfficialStandardSchemaV1.InferInput<typeof isoDate>, string>
>;
isoDate satisfies OfficialStandardSchemaV1<string, Date>;

export const _roadmap2Witnesses = [len, withDefault, isoDate, decoded, encoded];
