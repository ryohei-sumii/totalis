/**
 * totalis side — the SAME four drifts as `zod-side.ts`, each rejected at
 * compile time.
 *
 * Every `@ts-expect-error` below MUST fire. If totalis ever stopped catching a
 * case, its directive would become an "unused '@ts-expect-error'" and tsc would
 * fail. So a clean `tsc --noEmit` over this file is a LIVE proof that all four
 * drifts are compile errors here — exactly the ones Zod waves through.
 *
 * The error messages name the offending field/member, e.g.
 *   ✗ field 'role' must validate EXACTLY the declared type ...
 *   ✗ enum is missing declared member: deleted
 */
import { schemaFor, enumFor, unionFor, object, number, string, literal } from "../../totalis";

// ① literal narrowing — role must be EXACTLY string, not the literal "admin".
type User = { id: number; role: string };
schemaFor<User>()({
  id: number(),
  // @ts-expect-error  role drifts narrower than `string`
  role: literal("admin"),
});

// ② enum coverage gap — "deleted" is a declared member and must be covered.
type Status = "active" | "archived" | "deleted";
// @ts-expect-error  enum is missing declared member "deleted"
enumFor<Status>()(["active", "archived"]);

// ③ required-where-optional — name is optional in `Profile`, required here.
type Profile = { name?: string };
schemaFor<Profile>()({
  // @ts-expect-error  name is optional in Profile but required by string()
  name: string(),
});

// ④ missing union variant — `Event` has click | key, schema only has click.
type Event = { type: "click"; x: number } | { type: "key"; code: string };
// @ts-expect-error  union is missing the "key" variant
unionFor<Event>()("type", [
  object({ type: literal("click"), x: number() }),
]);
