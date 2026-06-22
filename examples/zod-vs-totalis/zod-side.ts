/**
 * Zod side — proof that `schema satisfies z.ZodType<T>` SILENTLY ACCEPTS a
 * schema whose output is NARROWER than `T`.
 *
 * Every statement below compiles with NO error (verified with zod@4.4.3,
 * typescript@6.0.3). A clean `tsc --noEmit` over this file therefore proves
 * that Zod's reverse-check waves through all four drifts.
 *
 * Why: `z.ZodType<out Output, ...>` is COVARIANT in its output param, so a
 * schema whose output is a strict SUBTYPE of `T` stays assignable to
 * `z.ZodType<T>`. The check is one-directional assignability, not equality.
 *
 * (Schemas whose output is too WIDE or wrong-typed ARE caught — see the two
 * control cases at the bottom, kept commented out so this file stays clean.)
 */
import { z } from "zod";

// ① literal narrowing — `T` says role: string, schema pins it to "admin".
type User = { id: number; role: string };
const narrowed = z.object({ id: z.number(), role: z.literal("admin") });
narrowed satisfies z.ZodType<User>; // ✅ compiles — drift accepted

// ② enum coverage gap — "deleted" is never covered.
type Status = "active" | "archived" | "deleted";
const partialEnum = z.enum(["active", "archived"]);
partialEnum satisfies z.ZodType<Status>; // ✅ compiles — gap accepted

// ③ required-where-optional — `T` allows name?, schema makes it required.
type Profile = { name?: string };
const required = z.object({ name: z.string() });
required satisfies z.ZodType<Profile>; // ✅ compiles — narrowing accepted

// ④ missing union variant — `T` is click | key, schema only has click.
type Event = { type: "click"; x: number } | { type: "key"; code: string };
const oneVariant = z.object({ type: z.literal("click"), x: z.number() });
oneVariant satisfies z.ZodType<Event>; // ✅ compiles — variant loss accepted

// ── Control: these DO error in Zod (output too wide / wrong type), which is
// why they are commented out — uncomment to confirm tsc reports them.
//
// const tooWide = z.object({ name: z.string().optional() });
// tooWide satisfies z.ZodType<{ name: string }>; // ✗ string | undefined ⊄ string
//
// const wrongType = z.object({ id: z.number(), role: z.number() });
// wrongType satisfies z.ZodType<User>; // ✗ number ⊄ string
