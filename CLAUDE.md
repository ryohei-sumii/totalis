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

Those three axes are taken. **Our axis is COMPLETENESS / EXHAUSTIVENESS (完全性・網羅性).**

### The thesis

Every existing library is fundamentally one-directional: schema → type. They
let your runtime schema and your domain types silently drift apart. Our selling
point is the reverse guarantee, made first-class instead of a side feature:

1. **type → schema completeness**: if a TS type gains a field, the schema that
   claims to validate it must FAIL TO COMPILE until updated. (Prototype:
   `schemaFor<T>()` in `totalis.ts`, using an `Equals<A,B>` mutual-assignability
   check. Generalize this to the whole API.)
2. **exhaustive unions**: discriminated unions get compile-time exhaustiveness;
   adding a variant forces every consumer to handle it (`assertNever` pattern,
   but built into the schema, not bolted on by the user).
3. **no silent widening / no `any` leaks**: the type-level code must never
   degrade to `any`. Tested with type-level assertions, not just runtime tests.

If a feature doesn't serve "your schema cannot drift from your type," it is not
our priority.

## Non-negotiable: Standard Schema v1.0

Standard Schema reached v1.0 in 2025. React Hook Form, Hono, tRPC, etc. now
target it, so any new validator that implements the spec plugs into the whole
ecosystem without us building adapters. **Implement the Standard Schema
interface (`~standard` property) from day one.** Without it we are dead on
arrival regardless of how good the completeness story is. Verify the current
spec at https://standardschema.dev before implementing.

## Current architecture (in totalis.ts)

- `Schema<Output>` abstract base, with a phantom `declare readonly _output`
  field. `Infer<S> = S["_output"]` recovers the type.
- Primitives: string / number / boolean / literal (literal uses `const L` to
  preserve literal types).
- `ObjectSchema` uses mapped types. Key detail: keys whose schema admits
  `undefined` become OPTIONAL keys (`age?: number`), not `age: number | undefined`.
- `_parse(input, path)` threads a path for nested error reporting; `safeParse`
  returns a discriminated `{ success: true; data } | { success: false; error }`.
- `schemaFor<T>()` is the completeness primitive — extend its spirit everywhere.

## Roadmap (in priority order)

1. **Standard Schema v1.0 conformance** + a conformance test.
2. **Two type params `Schema<Input, Output>`** so `transform` / `default` /
   codec (encode+decode) are type-safe. Bidirectional codecs are a secondary
   differentiator worth leaning into (Effect Schema has them but drags in all of
   Effect; we can be the lightweight standalone option).
3. **First-class completeness API**: ergonomic `schemaFor<T>()`, plus a
   `satisfies`-style helper and good error messages when a schema is incomplete
   (the current `& "Schema does not match T"` trick is ugly — improve the DX).
4. **Exhaustive discriminated unions** with compile-time variant coverage.
5. Type-level test suite (e.g. `expectTypeOf` / `tsd` / `vitest` type tests).
   Type-level correctness is the product, so it must be tested as rigorously as
   runtime behavior.
6. Structured/tree errors + i18n-ready messages (errors aimed at end users, an
   underserved niche).

## Conventions

- Strict TypeScript. `tsconfig` must have `"strict": true`. Treat any `any`
  in the public type surface as a bug.
- No runtime deps in the core. Keep it tree-shakable.
- Every feature ships with BOTH a runtime test and a type-level test.

## Commands

```bash
npm install            # deps
npx tsc --noEmit       # typecheck (the real test for this project)
# add when set up:
# npm test             # runtime + type-level tests
```

## House rules for Claude Code

- When in doubt, optimize for the completeness/exhaustiveness thesis over
  feature breadth.
- Before adding API surface, ask: does this keep schema and type from drifting?
- Don't reintroduce the things that make Zod heavy; bundle-size and
  tree-shaking discipline matter.
