# Zod vs totalis — the one-directional `satisfies` gap

A reproducible, self-verifying head-to-head for the claim at the heart of
totalis:

> Zod's reverse check `schema satisfies z.ZodType<T>` is **one-directional
> assignability**. It catches schemas whose output is too *wide* or wrong-typed,
> but **silently accepts** a schema whose output is a strict *subtype* of `T`
> (too narrow). totalis's `schemaFor<T>()` / `enumFor<T>()` / `unionFor<T>()`
> require a per-field **exact** match, so the same drift is a compile error.

Verified with **zod@4.4.3** and **typescript@6.0.3**.

## The four drifts

| # | Drift | `satisfies z.ZodType<T>` | totalis |
|---|-------|--------------------------|---------|
| ① | field narrowed (`role: string` → `literal("admin")`) | ✅ accepted | ❌ compile error |
| ② | enum coverage gap (`"deleted"` not covered) | ✅ accepted | ❌ compile error |
| ③ | required where `T` is optional (`name?` → required) | ✅ accepted | ❌ compile error |
| ④ | missing union variant (`click \| key` → only `click`) | ✅ accepted | ❌ compile error |

Drifts that Zod **does** catch (output too wide / wrong type) are the two
commented-out control cases at the bottom of [`zod-side.ts`](./zod-side.ts) —
uncomment them to confirm tsc reports them. That asymmetry is the whole point:
the gap is precisely the *narrowing* direction.

## Why (the type-theory reason)

`z.ZodType<out Output, …>` is **covariant** in its output parameter (note the
`out`). So if a schema's output `S` is a subtype of `T` (`S <: T`), then
`z.ZodType<S>` is assignable to `z.ZodType<T>`, and the `satisfies` passes. An
unintended `literal`, a missing enum member, a missing union variant, or a
required-instead-of-optional field all make the output a *subtype* — assignable,
therefore invisible to the check.

totalis instead asks for `Equals<Infer<schema[K]>, T[K]>` per field (mutual
assignability, i.e. equality), so a subtype no longer satisfies it.

## How the proof is self-checking

- [`zod-side.ts`](./zod-side.ts) has **no** error-suppression. A clean `tsc`
  run means every `satisfies` there was accepted → Zod waved the drift through.
- [`totalis-side.ts`](./totalis-side.ts) marks every drift with
  `@ts-expect-error`. If totalis ever *stopped* catching one, the directive
  would be "unused" and `tsc` would fail. A clean run means every drift is still
  a compile error.

So a single `tsc --noEmit` exiting `0` proves **both** sides at once: Zod
accepts all four, totalis rejects all four.

## Reproduce

```bash
cd examples/zod-vs-totalis
pnpm install        # pulls zod@^4.4.3 + typescript@^6.0.3
pnpm run verify     # tsc --noEmit → exits 0
```

To *see* Zod accept the drift directly, open `zod-side.ts` in an editor: there
are no red squiggles on the four `satisfies` lines. To see the totalis errors,
delete any `@ts-expect-error` in `totalis-side.ts` and re-run — the named
message (`✗ field 'role' must validate EXACTLY …`) appears.
