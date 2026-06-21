# CLAUDE.md — Project Context

**Project name: `totalis`** (npm package name confirmed available).
Tagline direction: a validation library where your schema can never drift from
your type — totality / completeness as the core promise.

## What this project is

A TypeScript-first runtime validation library (a "Zod-like"). The single core
idea is the standard one: **the schema is the source of truth, and both the
runtime validator AND the static type are derived from the same object**
(`Infer<typeof schema>`).

The working prototype lives in `totalis.ts`. Treat it as the seed, not the
final API.

## The differentiation — READ THIS FIRST

We are NOT trying to beat Zod on the general case. That fight is lost:

- **Ecosystem / default choice** → Zod (37.8k stars, ~31M weekly downloads;
  v4 already closed the speed + bundle gaps with JIT, JSON Schema, Zod Mini).
- **Bundle size** → Valibot (1.37kB vs Zod ~15kB on a login form, via
  tree-shakable composable functions).
- **Raw runtime speed + type-from-string syntax** → ArkType (parses TS-like
  string literals into types; often 3–4x faster than Zod).

Those three axes are taken. **Our axis is TOTALITY (全域性) — completeness +
exhaustiveness.** The name is the promise: a *total* function is defined for
every input in its domain, with no partiality and no "this can't happen"
branches.

**The one thing Zod v4 cannot do (our wedge):** Zod's reverse check,
`schema satisfies z.ZodType<T>`, is one-directional *assignability* — it accepts
any schema whose output is assignable to `T`, so a schema NARROWER than `T`
(an unintended `literal`/brand, a required field where `T` is optional) passes
silently. `schemaFor<T>()` enforces a per-field **EXACT** match
(`Equals<Infer, T[K]>`) and names the drifting field. Lean into guarantees that
assignability-based checks structurally cannot express; do not try to win on
breadth/perf/ecosystem.

**Who it's for (positioning):** `use totalis when the type is the contract` —
the domain type is authored ELSEWHERE (OpenAPI/GraphQL/Prisma codegen, a shared
type package, a hand-maintained API contract) and the boundary validator must
*provably* match it. That is exactly where Zod's infer-from-schema model is
weakest. The living proof is `contract.test-d.ts`: regenerate the type and the
schema fails to compile until fixed — for *any* drift, and crucially for the
narrowing/coverage drift (too-narrow field, missing enum member / union
variant) that stays assignable to the type and so slips past
`satisfies z.ZodType<T>`. Keep that demo green and front-and-center.

### The thesis — one sentence

> **You write the runtime check exactly once, at the boundary; in exchange the
> type system guarantees you never need a defensive check again, and the bugs
> that would have been `if (x == null) throw` become compile errors.**

This is "parse, don't validate": a validation library is the ONE place runtime
checking is irreducible (network, user input, JSON). We do not pretend to
remove runtime checks — we *concentrate* them at the boundary and, in return,
make downstream defensive code (`?.`, `as`, re-validation, `default: throw`)
unnecessary. Selling "no runtime checks" would be dishonest; selling "no
*defensive* checks past the boundary" is exactly what we deliver.

### Two promises

**Promise 1 — Completeness (soundness of the boundary).** The boundary's output
type never lies, because the schema cannot drift from the type it claims to
validate.

- **type → schema completeness**: if a TS type gains a field, the schema that
  claims to validate it must FAIL TO COMPILE until updated (`schemaFor<T>()`,
  via an `Equals<A,B>` mutual-assignability check). Generalize its spirit
  everywhere.

**Promise 2 — Totality (precision + exhaustiveness past the boundary).** The
output type is the *narrowest type that is true*, and unions are exhaustive, so
downstream code physically cannot represent a bug.

- **make illegal states unrepresentable**: the parsed output should encode the
  invariant the validator checked. Brands (`string().brand<"Email">()` →
  `string & Brand<"Email">`) and refinements (`int()`, `array(...).nonempty()`
  → `[T, ...T[]]`) mean a function that takes an `Email` can never be handed an
  unvalidated string — the "did I check this?" guard disappears at compile time.
  Note this STRENGTHENS Promise 1: `schemaFor<{ email: Email }>()` cannot be
  satisfied by a plain `string()`.
- **exhaustive unions**: discriminated unions get compile-time exhaustiveness;
  adding a variant forces every consumer to handle it. Built into the library
  (`discriminatedUnion`, `match`, `assertNever`), not bolted on by the user.
- **no silent widening / no `any` leaks**: the type-level code must never
  degrade to `any`. Tested with type-level assertions, not just runtime tests.

If a feature doesn't serve "check once at the boundary, never write defensive
code again," it is not our priority.

## Non-negotiable: Standard Schema v1.0

Standard Schema reached v1.0 in 2025. React Hook Form, Hono, tRPC, etc. now
target it, so any new validator that implements the spec plugs into the whole
ecosystem without us building adapters. **Implement the Standard Schema
interface (`~standard` property) from day one.** Without it we are dead on
arrival regardless of how good the completeness story is. Verify the current
spec at https://standardschema.dev before implementing.

## Current architecture (in totalis.ts)

- `Schema<Output, Input = Output>` abstract base, with phantom
  `declare readonly _output` / `_input` fields. `Infer<S> = S["_output"]` and
  `InferInput<S> = S["_input"]` recover them. `Output` is first because it is
  what callers want 95% of the time; `Input` defaults to it, so the single-arg
  `Schema<T>` still means `Schema<T, T>`. `Input` diverges only for
  `transform` / `default` / `codec`.
- `transform(fn)` (decode-only, `Output` changes, `Input` preserved),
  `default(value)` (`Input` gains `undefined`, `Output` does not), and the
  bidirectional `Codec<Output, Input>` built by `codec(base, { decode, encode })`
  with a type-safe `.encode(output): input`. Transformed schemas are decode-only
  by design — there is no `encode` to call.
- Primitives: string / number / boolean / literal (literal uses `const L` to
  preserve literal types).
- `ObjectSchema` uses mapped types. Key detail: keys whose schema admits
  `undefined` become OPTIONAL keys (`age?: number`), not `age: number | undefined`.
- `_parse(input, path)` threads a path for nested error reporting; `safeParse`
  returns a discriminated `{ success: true; data } | { success: false; error }`.
- Errors are structured + i18n-ready: `Issue` = `{ code, path, message, params }`
  (machine-readable `IssueCode` + `params`, English `message` as fallback);
  `ValidationError.format()` / `.flatten()` render a tree / `{ formErrors,
  fieldErrors }`, and both take an optional `Localizer`.
- Completeness primitives: `schemaFor<T>()` is EXACT (per-field
  `Equals<Infer, T[K]>` via a self-referential `ExactSchemaFor<T, S>`; readable
  `FieldMismatch`/`ExtraField` messages; rejects too-narrow/brand/optional-drift
  — the Zod-`satisfies`-can't-do-this wedge). `SchemaFor<T>` is the looser,
  assignability-based variant for the `satisfies` style (precision-preserving).
  Extend the EXACT spirit everywhere.
- **Standard Schema v1**: every schema implements `~standard`
  (`StandardSchemaV1<Input, Output>`, `validate` = the decode direction); the
  spec interface is vendored to keep the core dependency-free.
- **Totality primitives**: `brand<B>()` / `refine()` on the base, plus `int()`
  and `array(...).nonempty()` for precise output types; `discriminatedUnion`,
  `match` (compile-enforced exhaustive handling) and `assertNever`.
- **Exhaustive completeness for unions/enums** (the exact wedge, extended):
  `enumFor<T>()(values)` covers a literal union EXACTLY and `unionFor<T>()(key,
  variants)` covers a declared discriminated union EXACTLY — a missing member /
  variant fails to compile (named). Zod infers unions from the schema, so it
  cannot enforce coverage of an independently-declared union/enum.
- **Bidirectional completeness for codecs** (the exact wedge, both directions):
  `codecFor<Decoded, Encoded>()(base, { decode, encode })` pins both ends of a
  serialization boundary to independently-declared contracts — the base must
  decode EXACTLY to `Encoded` (`Equals`, not assignability), and `decode`/
  `encode` are typed against `Decoded`/`Encoded`. Zod's `z.codec` infers the
  input from the base, so it cannot check it against an authored `Encoded` type.
- **Encodability is in the type**: `Codec<Output, Input>` (abstract) is "a
  schema that can also `encode`". Primitives are identity codecs; `codec(...)`
  and `objectCodec(...)` build real ones; `.brand()` / `.optional()` on a codec
  stay codecs. `transform` returns a plain `Schema` (no `encode`), so a
  non-invertible field cannot enter `objectCodec(...)` — it fails to compile.

## Roadmap (in priority order)

1. ~~**Standard Schema v1.0 conformance** + a conformance test.~~ ✅ Done
   (`standard-schema.test.ts` runtime + `standard-schema.test-d.ts` type-level).
4. ~~**Exhaustive discriminated unions** with compile-time variant coverage.~~
   ✅ Done (`discriminatedUnion` + `match` + `assertNever`; brands/refinements
   for "illegal states unrepresentable"). Both pulled forward as the clearest
   embodiment of Promise 2 (totality).
2. ~~**Two type params `Schema<Input, Output>`** so `transform` / `default` /
   codec (encode+decode) are type-safe.~~ ✅ Done (`Schema<Output, Input>`,
   `transform` / `default` / `codec` + `Codec.encode`; `transform-codec.test.ts`
   + `transform-codec.test-d.ts`). Bidirectional codecs are the lightweight
   standalone alternative to Effect Schema. Object-level encode is done too:
   `objectCodec(...)` round-trips an object whose fields are all codecs (encode
   is type-gated, so `transform` fields fail to compile).
3. ~~**First-class completeness API**~~ ✅ Done, then sharpened into the Zod
   wedge: `schemaFor<T>()` is now EXACT (per-field `Equals<Infer, T[K]>`), so it
   rejects too-narrow / unintended-brand / optional-mismatch fields that
   `satisfies z.ZodType<T>` (assignability) accepts silently, with readable
   `FieldMismatch`/`ExtraField` messages. `SchemaFor<T>` remains the
   assignability-based `satisfies`-style helper (precision-preserving, allows
   codec fields). `completeness.test-d.ts` includes a side-by-side proving the
   same too-narrow shape PASSES assignability but FAILS the exact check.
5. ~~Type-level test suite (e.g. `expectTypeOf` / `tsd` / `vitest` type
   tests).~~ ✅ Done. `*.test-d.ts` are vitest type tests (`expectTypeOf` /
   `assertType` + `@ts-expect-error` negatives) run via `typecheck` (Vitest
   config `typecheck.enabled`), so `pnpm test` runs runtime AND type tests
   together; `tsc --noEmit` remains the authoritative full-project gate.
6. ~~Structured/tree errors + i18n-ready messages (errors aimed at end users,
   an underserved niche).~~ ✅ Done. Each `Issue` carries a machine-readable
   `code` + `params` (English `message` is just the fallback, so localization
   is a `Localizer = (issue) => string` you pass in). `ValidationError` exposes
   `.format()` (a tree mirroring the input) and `.flatten()`
   (`{ formErrors, fieldErrors }`). (`errors.test.ts` + `errors.test-d.ts`.)

## Conventions

- Strict TypeScript. `tsconfig` must have `"strict": true`. Treat any `any`
  in the public type surface as a bug.
- No runtime deps in the core. Keep it tree-shakable.
- Every feature ships with BOTH a runtime test and a type-level test.
- **pnpm only.** `packageManager` is pinned and a `preinstall` (`only-allow
  pnpm`) blocks `npm`/`yarn`. Use `pnpm` for all install/script commands; the
  committed lockfile is `pnpm-lock.yaml`.

## Commands

```bash
pnpm install           # deps (pnpm only — `npm`/`yarn` are blocked by preinstall)
pnpm run typecheck     # tsc --noEmit — typecheck the whole project (authoritative gate)
pnpm test              # runtime + type-level tests (Vitest, typecheck enabled)
pnpm run test:types    # only the *.test-d.ts type tests
```

## House rules for Claude Code

- When in doubt, optimize for the completeness/exhaustiveness thesis over
  feature breadth.
- Before adding API surface, ask: does this keep schema and type from drifting?
- Don't reintroduce the things that make Zod heavy; bundle-size and
  tree-shaking discipline matter.
