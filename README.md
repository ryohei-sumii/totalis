# totalis

> A TypeScript-first runtime validation library where your schema can never drift from your type.
>
> スキーマと型が二度と食い違わない、TypeScript ファーストなランタイムバリデーションライブラリ。

[English](#english) ・ [日本語](#日本語)

---

## English

> **Reach for totalis when the type is the contract** — your domain type is
> authored elsewhere (OpenAPI / GraphQL / Prisma codegen, a shared type package,
> an API contract) and your boundary validator must *provably* match it.
> Regenerate the type and the validator fails to compile until it matches again.
> totalis breaks on *any* drift — including the narrowing/coverage drift (a
> too-narrow field, a missing enum member or union variant) that stays
> assignable to the type and so slips past Zod's `satisfies z.ZodType<T>`. See
> the living demo in [`contract.test-d.ts`](./contract.test-d.ts).

### Concept

Like Zod, **the schema is the single source of truth** — both the runtime
validator and the static type are derived from one object
(`Infer<typeof schema>`).

totalis does **not** try to beat Zod on the general case, Valibot on bundle
size, or ArkType on raw speed. Those axes are taken. Our axis is **totality
(全域性)** — a *total* function is defined for every input in its domain, with
no "this can't happen" branches.

> **You write the runtime check exactly once, at the boundary; in exchange the
> type system guarantees you never need a defensive check again, and the bugs
> that would have been `if (x == null) throw` become compile errors.**

This is "parse, don't validate." A validator is the one place a runtime check
is irreducible (network, user input, JSON). totalis doesn't pretend to remove
runtime checks — it *concentrates* them at the boundary, and in return makes
downstream defensive code (`?.`, `as`, re-validation, `default: throw`)
unnecessary. We deliver it as **two promises**:

1. **Completeness** — the boundary's output type never lies, because the schema
   cannot drift from the type it claims to validate. If a TS type gains a
   field, the schema must *fail to compile* until updated (`schemaFor<T>()`).
2. **Totality** — the output type is the *narrowest type that is true*, and
   unions are exhaustive, so downstream code physically cannot represent a bug:
   - **make illegal states unrepresentable** — brands and refinements
     (`string().brand<"Email">()`, `int()`, `array(...).nonempty()`) encode the
     invariant the validator checked into the type itself.
   - **exhaustive unions** — `discriminatedUnion` + `match` force every consumer
     to handle every variant; adding one breaks every call site until handled.
   - **no silent widening / no `any` leaks** — verified with type-level tests,
     not just runtime tests.

### Why totalis? (vs TypeScript and Zod)

**vs the TypeScript type system alone** — types are erased at runtime, so a
cast is just a promise you hope is true:

```ts
interface User { id: string; email: string }

// TypeScript only: the cast is a LIE. Nothing checked the shape.
const u1 = JSON.parse(body) as User;
u1.email.toUpperCase(); // 💥 runtime crash if `email` was missing — TS swore it existed

// totalis: ONE runtime check at the boundary, and the type is now true.
const User = object({ id: string(), email: string() });
const u2 = User.parse(JSON.parse(body)); // throws ValidationError if the shape is wrong
u2.email.toUpperCase(); // safe — guaranteed by the check, not by a cast
```

**vs Zod — your schema cannot silently drift from your domain type.** In Zod
the type is *derived from* the schema (`z.infer`), so when you keep a
hand-written domain type (shared package, codegen, an API contract), nothing
forces the schema to stay complete:

```ts
interface User { id: string; email: string; age: number }

// Zod: a separate domain type and a schema that forgot a field both compile.
const ZUser = z.object({ id: z.string(), email: z.string() }); // 🙈 no `age`
// z.infer<typeof ZUser> is { id, email } — quietly NOT User. The gap only
// surfaces later (if ever), far from the schema.

// totalis: completeness is enforced AT THE SCHEMA, with a native per-field error.
const User = schemaFor<User>()({
  id: string(),
  email: string(),
}); // ❌ compile error: Property 'age' is missing in type '{ id: ...; email: ... }'
```

Add a field to `User` and **every** schema claiming to validate it fails to
compile until updated.

`schemaFor<T>()` goes further than Zod's closest tool, `schema satisfies
z.ZodType<T>`. That check is one-directional **assignability** — the schema's
output need only be *assignable to* `T` — so it silently accepts a schema that
is **narrower** than `T`. `schemaFor<T>()` demands a per-field **exact** match,
catching drift Zod misses:

```ts
interface Profile { role: string; age?: number }

// Zod-style assignability ACCEPTS all of these (they're subtypes of Profile):
const loose = {
  role: literal("admin"),    // 🙈 narrower than string — schema rejects valid roles
  age: number(),             // 🙈 required where Profile.age is optional
} satisfies SchemaFor<Profile>; // ✅ compiles (this is what `satisfies z.ZodType` does)

// totalis EXACT rejects each, naming the field:
schemaFor<Profile>()({
  role: literal("admin"), // ❌ field 'role' must validate EXACTLY the declared type
  age: number(),          // ❌ field 'age' must validate EXACTLY (it's optional)
});
```

So your domain type and your validator can never *silently* disagree — not even
by being too strict.

**vs Zod — validation is recorded in the type, so you can't forget it.** A
branded output means an unvalidated value is a *compile* error, not a runtime
surprise:

```ts
type Email = Branded<string, "Email">;
const Email = string().brand<"Email">();
declare function sendInvite(to: Email): void;

sendInvite(Email.parse(input)); // ✅
sendInvite(input);              // ❌ compile error: a raw string is not an Email
```

We are **not** trying to beat Zod in general (ecosystem, plugins, breadth).
totalis bets on one axis: **totality** — concentrate the runtime check at the
boundary, and make every defensive check past it a compile error instead.

### Standard Schema v1.0

totalis implements the [Standard Schema v1](https://standardschema.dev)
interface (the `~standard` property) on every schema. That means it plugs
directly into the ecosystem — tRPC, Hono, React Hook Form, and anything else
that targets Standard Schema — **with no adapter**.

```ts
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { object, string, number } from "totalis";

const user = object({ name: string(), age: number() });

// Consumed by any Standard Schema-aware library:
const props: StandardSchemaV1.Props = user["~standard"];
props.version; // 1
props.vendor;  // "totalis"
```

### Installation

```bash
pnpm add totalis
```

> No runtime dependencies. The Standard Schema interface is vendored, so the
> core stays dependency-free and tree-shakable.

### Usage

#### Define a schema and infer its type

```ts
import { object, string, number, boolean, array, literal, type Infer } from "totalis";

const user = object({
  name: string(),
  age: number(),
  active: boolean(),
  role: literal("admin"),
  tags: array(string()),
  nickname: string().optional(), // -> optional KEY: `nickname?: string`
});

type User = Infer<typeof user>;
// {
//   name: string;
//   age: number;
//   active: boolean;
//   role: "admin";
//   tags: string[];
//   nickname?: string | undefined;
// }
```

Note: a field whose schema admits `undefined` becomes an **optional key**
(`nickname?: string`), not `nickname: string | undefined`.

#### Parse values

```ts
// Throws a ValidationError on failure:
const data = user.parse(input);

// Or get a discriminated result instead of throwing:
const result = user.safeParse(input);
if (result.success) {
  result.data; // User
} else {
  result.error.issues; // [{ message, path }, ...]
}
```

Errors carry a full path into the input for nested values:

```ts
const schema = object({ user: object({ name: string() }) });
const r = schema.safeParse({ user: { name: 42 } });
// r.error.issues[0].path === ["user", "name"]
```

#### Completeness: `schemaFor<T>()` and `SchemaFor<T>`

This is the core differentiator. Build a schema that is **guaranteed** to match
a type `T`. A missing, extra, wrong, or too-loose field **fails to compile**
with a **native, per-field error** that points at the exact key.

```ts
import { schemaFor, string, number } from "totalis";

interface Account {
  id: string;
  balance: number;
}

const account = schemaFor<Account>()({
  id: string(),
  balance: number(),
}); // ✅ compiles; Infer<typeof account> is exactly Account

// If `Account` later gains `currency: string`, this stops compiling:
//   Property 'currency' is missing in type '{ id: ...; balance: ... }'
//   but required in type 'SchemaFor<Account>'.
```

Prefer the `satisfies` style when you want to **keep more precise field types**
(brands, narrowed literals) on the schema. `SchemaFor<T>` is the helper, and it
also accepts `codec` fields whose input differs from `T[K]`:

```ts
import { object, string, number, type SchemaFor } from "totalis";

const shape = {
  id: string().brand<"AccountId">(), // kept as a branded schema
  balance: number(),
} satisfies SchemaFor<Account>;

const account = object(shape);
```

#### Totality: make illegal states unrepresentable

Brands and refinements push the invariant the validator checked into the type,
so the "did I validate this?" guard disappears at compile time.

```ts
import { string, int, array } from "totalis";

const Email = string().brand<"Email">();
type Email = Infer<typeof Email>; // string & Brand<"Email">

declare function sendTo(email: Email): void;

sendTo(Email.parse(input)); // ✅ a validated value is branded
sendTo("a@b.com");          // ✗ compile error: a raw string is not an Email

int();                  // number & Brand<"int">  (rejects 1.5 at runtime)
array(string()).nonempty(); // [string, ...string[]]
```

This also strengthens completeness: `schemaFor<{ email: Email }>()` cannot be
satisfied by a plain `string()` — only `string().brand<"Email">()` will compile.

#### Exhaustive unions: forgetting a case is a compile error

```ts
import { discriminatedUnion, object, literal, number, string, match } from "totalis";

const shape = discriminatedUnion("kind", [
  object({ kind: literal("circle"), radius: number() }),
  object({ kind: literal("square"), side: number() }),
]);
type Shape = Infer<typeof shape>;

const area = (s: Shape): number =>
  match(s, "kind", {
    circle: (c) => Math.PI * c.radius ** 2,
    square: (q) => q.side ** 2,
  });
// Add a "triangle" variant and every `match` call stops compiling until handled.
// In a hand-written `switch`, use `assertNever(x)` in the default branch for
// the same guarantee.
```

When the union/enum type is declared **independently** (codegen, a shared
package), `enumFor<T>()` / `unionFor<T>()` enforce that the schema covers it
**exactly** — a missing member fails to compile. Zod infers unions *from* the
schema, so it cannot check coverage of a type you authored elsewhere:

```ts
import { enumFor, unionFor, object, literal, number } from "totalis";

type Role = "admin" | "user" | "guest";
const Role = enumFor<Role>()(["admin", "user", "guest"]);
//                            ^ drop "guest" → ❌ enum is missing declared member: guest

type Shape = { kind: "circle"; r: number } | { kind: "square"; s: number };
const Shape = unionFor<Shape>()("kind", [
  object({ kind: literal("circle"), r: number() }),
  object({ kind: literal("square"), s: number() }),
]); // drop a variant → ❌ union is missing declared variant(s)
```

#### Transform, default, and bidirectional codecs

`Schema<Output, Input>` tracks two types: the decoded `Output` and the `Input`
it decodes from. They diverge for `transform`, `default`, and `codec`.

```ts
import { string, number, codec, type Infer, type InferInput } from "totalis";

// transform: one-directional. Output changes; Input is preserved.
const length = string().transform((s) => s.length);
length.parse("hello"); // 5  (Infer = number, InferInput = string)
// length.encode(...) ✗ does not exist — a transform may not be invertible.

// default: the Input gains `undefined`, the Output stays present.
const page = number().default(1);
page.parse(undefined); // 1  (Infer = number, InferInput = number | undefined)

// codec: bidirectional and type-safe in BOTH directions.
const isoDate = codec(string(), {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
});
type Decoded = Infer<typeof isoDate>;     // Date
type Encoded = InferInput<typeof isoDate>; // string

const d = isoDate.parse("2026-06-20T00:00:00.000Z"); // Date
isoDate.encode(d);                                    // string — round-trips
```

`objectCodec` lifts codecs to whole objects — every field must be a codec, so a
one-directional `transform` field **fails to compile**:

```ts
import { objectCodec, string } from "totalis";

const Event = objectCodec({ id: string(), at: isoDate });
const e = Event.parse({ id: "e1", at: "2026-06-20T00:00:00.000Z" }); // { id: string; at: Date }
Event.encode(e); // { id: string; at: string }  — the whole object round-trips
```

When **both** ends of a serialization boundary are declared types (a wire DTO
and a domain model, both from codegen), `codecFor<Decoded, Encoded>()` pins the
codec to both — and the base must decode **exactly** to `Encoded`, so a drift in
either contract fails to compile. Zod's `z.codec` infers the input from the
base, so it can't check it against an independently-authored `Encoded`:

```ts
import { codecFor, object, string } from "totalis";

interface WireUser { createdAt: string } // the API contract
interface User { createdAt: Date }        // your domain model

const User = codecFor<User, WireUser>()(object({ createdAt: string() }), {
  decode: (w) => ({ createdAt: new Date(w.createdAt) }),
  encode: (u) => ({ createdAt: u.createdAt.toISOString() }),
});
User.parse({ createdAt: "2026-06-20T00:00:00.000Z" }); // { createdAt: Date }
User.encode({ createdAt: new Date(0) });               // { createdAt: string }
// change WireUser and the base no longer decodes exactly to it → ❌ compile error
```

Codecs are the lightweight, standalone answer to Effect Schema's bidirectional
transforms — without pulling in a runtime.

#### Structured, i18n-ready errors

Every issue is machine-readable (`code` + `params`); the English `message` is
only a fallback, so localization is just a function you pass in. `safeParse`
gives you the discriminated result, and `ValidationError` can render a tree or
a flat form map.

```ts
import { object, string, number, type Localizer } from "totalis";

const user = object({ name: string(), age: number() });
const result = user.safeParse({ name: 1, age: "x" });

if (!result.success) {
  result.error.issues;
  // [{ code: "invalid_type", path: ["name"], params: { expected: "string", ... }, message: "..." }, ...]

  result.error.flatten();
  // { formErrors: [], fieldErrors: { name: ["Expected string, received number"], age: [...] } }

  result.error.format();
  // { errors: [], properties: { name: { errors: ["..."] }, age: { errors: ["..."] } } }

  // i18n: re-render from `code` + `params`, no locale files shipped by totalis.
  const ja: Localizer = (issue) =>
    issue.code === "invalid_type" ? `${String(issue.params.expected)} が必要です` : issue.message;
  result.error.flatten(ja);
}
```

#### What fails, and when

totalis splits failures into two kinds: bad **data** fails at runtime (where you
asked for the check), and a bad **schema/usage** fails at compile time (so it
never ships).

```ts
const User = schemaFor<{ id: string; tags: [string, ...string[]] }>()({
  id: string(),
  tags: array(string()).nonempty(),
});

// ── Runtime failures (invalid DATA at the boundary) ──────────────────────────
User.parse({ id: 1, tags: ["a"] });        // throws: Expected string, received number at id
User.parse({ id: "x", tags: [] });         // throws: Expected a non-empty array at tags
User.safeParse({}).success;                // false — issues: [{code:"invalid_type", path:["id"]}, ...]
int().parse(1.5);                          // throws: Expected an integer

// ── Compile-time failures (invalid SCHEMA / USAGE — never reach runtime) ─────
schemaFor<{ id: string; n: number }>()({ id: string() });
//        ❌ Property 'n' is missing                     (incomplete schema)
schemaFor<{ email: Email }>()({ email: string() });
//        ❌ string is not Schema<Branded<string,"Email">> (must .brand<"Email">())
objectCodec({ n: string().transform((s) => s.length) });
//        ❌ a transform field is not a Codec            (can't round-trip)
match(shape, "kind", { circle: (c) => c.radius });
//        ❌ Property 'square' is missing                (non-exhaustive)
const e: Email = "raw@example.com";
//        ❌ string is not assignable to Email           (skipped validation)
```

The rule of thumb: **if it depends on a runtime value, it throws at the
boundary; if it depends only on types, it won't compile.**

### Development

```bash
pnpm install        # pnpm only — `npm`/`yarn` are blocked by a preinstall guard
pnpm run typecheck  # tsc --noEmit — authoritative full-project gate
pnpm test           # runtime + type-level tests (Vitest, typecheck enabled)
pnpm run test:types # only the *.test-d.ts type tests
```

Every feature ships with **both** a runtime test and a type-level test.

---

## 日本語

> **「型が契約」のときに totalis を使う** — ドメイン型が別の場所で authored され
> （OpenAPI / GraphQL / Prisma のコード生成、共有型パッケージ、API 契約）、境界の
> バリデータがそれに*証明可能に*一致しなければならない場面。型を再生成すると、
> 一致するまでバリデータがコンパイルを通らなくなる。totalis は*あらゆる*ドリフトで
> 壊れます — 型に代入可能なまま Zod の `satisfies z.ZodType<T>` をすり抜ける
> 「狭すぎるフィールド・enum/ユニオンの取りこぼし」も含めて。生きたデモは
> [`contract.test-d.ts`](./contract.test-d.ts)。

### コンセプト

Zod と同じく、**スキーマを唯一の正（source of truth）**とします。ランタイムの
バリデータも静的な型も、一つのオブジェクトから導出されます
（`Infer<typeof schema>`）。

totalis は一般的なユースケースで Zod に、バンドルサイズで Valibot に、生の速度で
ArkType に勝とうとはしません。それらの軸はすでに埋まっています。私たちの軸は
**全域性（totality）**です。全域関数とは、定義域のすべての入力に対して定義され、
「これは起きないはず」という分岐を持たない関数のことです。

> **検査はただ一箇所、境界（boundary）でだけ書く。その代わり、境界の外では防御
> コードが二度と要らないことを型が保証し、本来 `if (x == null) throw` だった
> バグはコンパイルエラーになる。**

これは "parse, don't validate"（検証ではなくパースする）です。バリデータは、
ランタイム検査が原理的に避けられない唯一の場所（ネットワーク・ユーザー入力・JSON）
です。totalis はランタイム検査をなくすふりはしません。検査を境界に**集約**し、その
見返りに、境界の外の防御コード（`?.`・`as`・再検査・`default: throw`）を不要に
します。これを**2つの約束**として提供します。

1. **完全性 (Completeness)** — 境界の出力型は決して嘘をつかない。スキーマが、検証
   すると謳う型からドリフトできないからです。TS の型にフィールドが増えたら、更新
   するまでスキーマは*コンパイルエラーになる*（`schemaFor<T>()`）。
2. **全域性 (Totality)** — 出力型は「真である最も狭い型」であり、ユニオンは網羅的。
   だから下流のコードは物理的にバグを表現できません:
   - **不正な状態を表現不能にする** — ブランドと精製型
     （`string().brand<"Email">()`・`int()`・`array(...).nonempty()`）が、
     バリデータの検査した不変条件を型そのものに焼き込む。
   - **網羅的なユニオン** — `discriminatedUnion` ＋ `match` が、全消費者に全バリアント
     の対応を強制する。1つ追加すれば、対応するまで全呼び出し箇所が壊れる。
   - **暗黙の拡大なし／`any` の漏れなし** — ランタイムテストだけでなく型レベル
     テストでも検証。

### なぜ totalis か（TypeScript・Zod との比較）

**TypeScript の型システム単体との比較** — 型は実行時に消えるので、キャストは
「そうであってほしい」という願望にすぎません:

```ts
interface User { id: string; email: string }

// TypeScript だけ: このキャストは嘘。形は何も検査されていない。
const u1 = JSON.parse(body) as User;
u1.email.toUpperCase(); // 💥 email が無ければ実行時クラッシュ。TS は「ある」と断言したのに

// totalis: 境界で一度だけ実行時検査し、その後は型が真になる。
const User = object({ id: string(), email: string() });
const u2 = User.parse(JSON.parse(body)); // 形が違えば ValidationError を throw
u2.email.toUpperCase(); // 安全 — キャストではなく検査が保証する
```

**Zod との比較 — スキーマがドメイン型から黙ってドリフトできない。** Zod では型は
スキーマから *導出* されます（`z.infer`）。そのため手書きのドメイン型（共有パッケージ・
コード生成・API 契約）を併用すると、スキーマが完全であり続ける保証がありません:

```ts
interface User { id: string; email: string; age: number }

// Zod: 別個のドメイン型と、フィールドを忘れたスキーマが、両方ともコンパイルを通る。
const ZUser = z.object({ id: z.string(), email: z.string() }); // 🙈 age が無い
// z.infer<typeof ZUser> は { id, email } で、こっそり User ではない。
// ずれはずっと後（あるいは永遠に気づかれず）、スキーマから離れた場所で表面化する。

// totalis: 完全性をスキーマの定義時点で、フィールド単位のネイティブエラーで強制。
const User = schemaFor<User>()({
  id: string(),
  email: string(),
}); // ❌ コンパイルエラー: Property 'age' is missing in type '{ id: ...; email: ... }'
```

`User` にフィールドを足せば、それを検証すると謳う**すべての**スキーマが、更新するまで
コンパイルを通らなくなります。

`schemaFor<T>()` は、Zod の最も近い手段 `schema satisfies z.ZodType<T>` より**踏み込みます**。
その検査は一方向の**代入可能性**（スキーマ出力が `T` に代入可能ならよい）なので、`T` より
**狭い**スキーマを黙って受け入れます。`schemaFor<T>()` はフィールド単位の**厳密一致**を要求し、
Zod が見逃すドリフトを捕まえます:

```ts
interface Profile { role: string; age?: number }

// Zod 流の代入可能性は以下を全部「通す」（どれも Profile の部分型だから）:
const loose = {
  role: literal("admin"),    // 🙈 string より狭い — 有効な role を弾くスキーマ
  age: number(),             // 🙈 Profile.age は任意なのに必須
} satisfies SchemaFor<Profile>; // ✅ 通る（これが `satisfies z.ZodType` の挙動）

// totalis の EXACT は各々を、フィールドを名指しして拒否:
schemaFor<Profile>()({
  role: literal("admin"), // ❌ field 'role' must validate EXACTLY the declared type
  age: number(),          // ❌ field 'age' must validate EXACTLY（任意キー）
});
```

これで、ドメイン型とバリデータが**黙って食い違う**ことは——「厳しすぎる」方向であっても——
起きなくなります。

**Zod との比較 — 検証したことが型に刻まれるので、検証し忘れられない。** ブランド付き
出力は、未検証の値を**コンパイル**エラーにします（実行時の不意打ちではなく）:

```ts
type Email = Branded<string, "Email">;
const Email = string().brand<"Email">();
declare function sendInvite(to: Email): void;

sendInvite(Email.parse(input)); // ✅
sendInvite(input);              // ❌ コンパイルエラー: 生の string は Email ではない
```

一般論で Zod に勝とうとはしていません（エコシステム・プラグイン・機能幅）。totalis は
一点に賭けます — **全域性**: 実行時検査を境界に集約し、その先のあらゆる防御チェックを
コンパイルエラーに置き換える。

### Standard Schema v1.0 対応

totalis は全てのスキーマに [Standard Schema v1](https://standardschema.dev) の
インターフェース（`~standard` プロパティ）を実装しています。これにより、tRPC・
Hono・React Hook Form をはじめ Standard Schema に対応したエコシステムへ、
**アダプタなし**でそのまま接続できます。

```ts
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { object, string, number } from "totalis";

const user = object({ name: string(), age: number() });

// Standard Schema 対応ライブラリからそのまま利用できる:
const props: StandardSchemaV1.Props = user["~standard"];
props.version; // 1
props.vendor;  // "totalis"
```

### インストール

```bash
pnpm add totalis
```

> ランタイム依存はありません。Standard Schema のインターフェースは同梱（vendoring）
> しているため、コアは依存ゼロかつツリーシェイク可能なまま保たれます。

### 使い方

#### スキーマを定義して型を推論する

```ts
import { object, string, number, boolean, array, literal, type Infer } from "totalis";

const user = object({
  name: string(),
  age: number(),
  active: boolean(),
  role: literal("admin"),
  tags: array(string()),
  nickname: string().optional(), // -> 任意「キー」になる: `nickname?: string`
});

type User = Infer<typeof user>;
// {
//   name: string;
//   age: number;
//   active: boolean;
//   role: "admin";
//   tags: string[];
//   nickname?: string | undefined;
// }
```

ポイント: `undefined` を許容するスキーマのフィールドは、
`nickname: string | undefined` ではなく**任意キー**（`nickname?: string`）に
なります。

#### 値をパースする

```ts
// 失敗時は ValidationError を throw する:
const data = user.parse(input);

// もしくは throw せず、判別可能な結果を受け取る:
const result = user.safeParse(input);
if (result.success) {
  result.data; // User
} else {
  result.error.issues; // [{ message, path }, ...]
}
```

エラーはネストした値に対して、入力内の完全なパスを保持します。

```ts
const schema = object({ user: object({ name: string() }) });
const r = schema.safeParse({ user: { name: 42 } });
// r.error.issues[0].path === ["user", "name"]
```

#### 完全性: `schemaFor<T>()` と `SchemaFor<T>`

これが核心の差別化要素です。型 `T` に一致することが**保証された**スキーマを作ります。
フィールドの不足・余分・型のズレ・緩すぎる型があれば、**該当キーを名指しする
フィールド単位のネイティブなエラー**で**コンパイルエラー**になります。

```ts
import { schemaFor, string, number } from "totalis";

interface Account {
  id: string;
  balance: number;
}

const account = schemaFor<Account>()({
  id: string(),
  balance: number(),
}); // ✅ コンパイルが通る。Infer<typeof account> はちょうど Account

// 後で `Account` に `currency: string` が増えると、こうなる:
//   Property 'currency' is missing in type '{ id: ...; balance: ... }'
//   but required in type 'SchemaFor<Account>'.
```

スキーマに**より精密な型**（ブランド・絞り込んだリテラル）を残したいときは
`satisfies` スタイルを使います。ヘルパーが `SchemaFor<T>` で、`T[K]` と入力型が
異なる `codec` フィールドも受け付けます。

```ts
import { object, string, number, type SchemaFor } from "totalis";

const shape = {
  id: string().brand<"AccountId">(), // ブランド付きのまま保持される
  balance: number(),
} satisfies SchemaFor<Account>;

const account = object(shape);
```

#### 全域性: 不正な状態を表現不能にする

ブランドと精製型は、バリデータが検査した不変条件を型に押し込みます。これにより
「これ検証したっけ?」という防御チェックがコンパイル時に消えます。

```ts
import { string, int, array } from "totalis";

const Email = string().brand<"Email">();
type Email = Infer<typeof Email>; // string & Brand<"Email">

declare function sendTo(email: Email): void;

sendTo(Email.parse(input)); // ✅ 検証済みの値はブランド付き
sendTo("a@b.com");          // ✗ コンパイルエラー: 生の string は Email ではない

int();                      // number & Brand<"int">  (実行時に 1.5 を弾く)
array(string()).nonempty(); // [string, ...string[]]
```

これは完全性も強化します。`schemaFor<{ email: Email }>()` は素の `string()` では
満たせず、`string().brand<"Email">()` でなければコンパイルが通りません。

#### 網羅的ユニオン: ケースの取りこぼしはコンパイルエラー

```ts
import { discriminatedUnion, object, literal, number, string, match } from "totalis";

const shape = discriminatedUnion("kind", [
  object({ kind: literal("circle"), radius: number() }),
  object({ kind: literal("square"), side: number() }),
]);
type Shape = Infer<typeof shape>;

const area = (s: Shape): number =>
  match(s, "kind", {
    circle: (c) => Math.PI * c.radius ** 2,
    square: (q) => q.side ** 2,
  });
// "triangle" バリアントを追加すると、対応するまで全ての `match` 呼び出しが
// コンパイルエラーになる。手書きの `switch` では default 分岐で `assertNever(x)`
// を使えば同じ保証が得られる。
```

ユニオン/列挙の型を**外部で宣言**している場合（コード生成・共有パッケージ）、
`enumFor<T>()` / `unionFor<T>()` がスキーマの**過不足ない網羅**を強制します。メンバーが
欠けるとコンパイルエラー。Zod はユニオンをスキーマ*から* infer するので、別の場所で
authored した型のカバレッジは検査できません:

```ts
import { enumFor, unionFor, object, literal, number } from "totalis";

type Role = "admin" | "user" | "guest";
const Role = enumFor<Role>()(["admin", "user", "guest"]);
//                            ^ "guest" を削ると → ❌ enum is missing declared member: guest

type Shape = { kind: "circle"; r: number } | { kind: "square"; s: number };
const Shape = unionFor<Shape>()("kind", [
  object({ kind: literal("circle"), r: number() }),
  object({ kind: literal("square"), s: number() }),
]); // バリアントを削ると → ❌ union is missing declared variant(s)
```

#### transform・default・双方向 codec

`Schema<Output, Input>` は2つの型を追跡します。デコード後の `Output` と、その
デコード元の `Input` です。`transform`・`default`・`codec` でこの2つが分岐します。

```ts
import { string, number, codec, type Infer, type InferInput } from "totalis";

// transform: 一方向。Output が変わり、Input は保たれる。
const length = string().transform((s) => s.length);
length.parse("hello"); // 5  (Infer = number, InferInput = string)
// length.encode(...) ✗ 存在しない — transform は可逆とは限らないため。

// default: Input が `undefined` を許容し、Output は常に存在する。
const page = number().default(1);
page.parse(undefined); // 1  (Infer = number, InferInput = number | undefined)

// codec: 双方向。両方向とも型安全。
const isoDate = codec(string(), {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
});
type Decoded = Infer<typeof isoDate>;     // Date
type Encoded = InferInput<typeof isoDate>; // string

const d = isoDate.parse("2026-06-20T00:00:00.000Z"); // Date
isoDate.encode(d);                                    // string — ラウンドトリップ
```

`objectCodec` は codec をオブジェクト全体に持ち上げます。全フィールドが codec で
なければならないので、一方向の `transform` フィールドは**コンパイルエラー**:

```ts
import { objectCodec, string } from "totalis";

const Event = objectCodec({ id: string(), at: isoDate });
const e = Event.parse({ id: "e1", at: "2026-06-20T00:00:00.000Z" }); // { id: string; at: Date }
Event.encode(e); // { id: string; at: string } — オブジェクト全体がラウンドトリップ
```

シリアライズ境界の**両端**が宣言済みの型（ワイヤ DTO とドメインモデル、両方とも
コード生成）のときは、`codecFor<Decoded, Encoded>()` が codec を両端に固定します。
base は `Encoded` に**厳密に**デコードしなければならず、どちらの契約がドリフトしても
コンパイルエラー。Zod の `z.codec` は base から入力型を infer するので、独立宣言した
`Encoded` に対して検査できません:

```ts
import { codecFor, object, string } from "totalis";

interface WireUser { createdAt: string } // API 契約
interface User { createdAt: Date }        // ドメインモデル

const User = codecFor<User, WireUser>()(object({ createdAt: string() }), {
  decode: (w) => ({ createdAt: new Date(w.createdAt) }),
  encode: (u) => ({ createdAt: u.createdAt.toISOString() }),
});
User.parse({ createdAt: "2026-06-20T00:00:00.000Z" }); // { createdAt: Date }
User.encode({ createdAt: new Date(0) });               // { createdAt: string }
// WireUser を変えると base が厳密一致しなくなる → ❌ コンパイルエラー
```

codec は、Effect Schema の双方向変換に対する「ランタイムを引き込まない、単体で
軽量な」答えです。

#### 構造化された i18n 対応エラー

すべての issue は機械可読（`code` ＋ `params`）で、英語の `message` はフォール
バックにすぎません。だからローカライズは関数を渡すだけです。`safeParse` で判別
可能な結果が得られ、`ValidationError` はツリーやフラットなフォーム用マップを
生成できます。

```ts
import { object, string, number, type Localizer } from "totalis";

const user = object({ name: string(), age: number() });
const result = user.safeParse({ name: 1, age: "x" });

if (!result.success) {
  result.error.issues;
  // [{ code: "invalid_type", path: ["name"], params: { expected: "string", ... }, message: "..." }, ...]

  result.error.flatten();
  // { formErrors: [], fieldErrors: { name: ["Expected string, received number"], age: [...] } }

  result.error.format();
  // { errors: [], properties: { name: { errors: ["..."] }, age: { errors: ["..."] } } }

  // i18n: `code` + `params` から再描画。totalis 自身はロケールファイルを持たない。
  const ja: Localizer = (issue) =>
    issue.code === "invalid_type" ? `${String(issue.params.expected)} が必要です` : issue.message;
  result.error.flatten(ja);
}
```

#### 何が・いつ失敗するか

totalis は失敗を2種類に分けます。不正な**データ**は（検査を頼んだ）実行時に失敗し、
不正な**スキーマ/使い方**はコンパイル時に失敗します（だから出荷されない）。

```ts
const User = schemaFor<{ id: string; tags: [string, ...string[]] }>()({
  id: string(),
  tags: array(string()).nonempty(),
});

// ── 実行時の失敗（境界での不正な「データ」）─────────────────────────────────
User.parse({ id: 1, tags: ["a"] });        // throw: Expected string, received number at id
User.parse({ id: "x", tags: [] });         // throw: Expected a non-empty array at tags
User.safeParse({}).success;                // false — issues: [{code:"invalid_type", path:["id"]}, ...]
int().parse(1.5);                          // throw: Expected an integer

// ── コンパイル時の失敗（不正な「スキーマ/使い方」— 実行時に到達しない）─────────
schemaFor<{ id: string; n: number }>()({ id: string() });
//        ❌ Property 'n' is missing                     （不完全なスキーマ）
schemaFor<{ email: Email }>()({ email: string() });
//        ❌ string は Schema<Branded<string,"Email">> ではない（.brand<"Email">() が必要）
objectCodec({ n: string().transform((s) => s.length) });
//        ❌ transform フィールドは Codec ではない         （ラウンドトリップ不可）
match(shape, "kind", { circle: (c) => c.radius });
//        ❌ Property 'square' is missing                 （網羅的でない）
const e: Email = "raw@example.com";
//        ❌ string は Email に代入不可                    （検証を飛ばした）
```

目安: **実行時の値に依存するなら境界で throw、型だけに依存するならコンパイルが通らない。**

### 開発

```bash
pnpm install        # pnpm 専用（`npm`/`yarn` は preinstall ガードで弾かれる）
pnpm run typecheck  # tsc --noEmit — プロジェクト全体の最終ゲート
pnpm test           # ランタイム + 型レベルテスト (Vitest, typecheck 有効)
pnpm run test:types # *.test-d.ts の型テストのみ
```

すべての機能は、ランタイムテストと型レベルテストの**両方**を伴って提供されます。
