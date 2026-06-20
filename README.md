# totalis

> A TypeScript-first runtime validation library where your schema can never drift from your type.
>
> スキーマと型が二度と食い違わない、TypeScript ファーストなランタイムバリデーションライブラリ。

[English](#english) ・ [日本語](#日本語)

---

## English

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
npm install totalis
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

#### Completeness: `schemaFor<T>()`

This is the core differentiator. Build a schema that is **guaranteed** to match
a type `T`. If a field is missing, extra, or its type drifts, the call **fails
to compile**.

```ts
import { schemaFor, string, number } from "totalis";

interface Account {
  id: string;
  balance: number;
}

const account = schemaFor<Account>()({
  id: string(),
  balance: number(),
}); // ✅ compiles

// If `Account` later gains `currency: string`, this stops compiling
// until you add the field — your schema can no longer drift from the type.
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

### Development

```bash
npm install
npm run typecheck   # tsc --noEmit — the real test for the type-level guarantees
npm test            # runtime conformance tests (vitest)
```

Every feature ships with **both** a runtime test and a type-level test.

---

## 日本語

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
npm install totalis
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

#### 完全性: `schemaFor<T>()`

これが核心の差別化要素です。型 `T` に一致することが**保証された**スキーマを
作ります。フィールドの不足・余分・型のズレがあれば、その呼び出しは
**コンパイルエラー**になります。

```ts
import { schemaFor, string, number } from "totalis";

interface Account {
  id: string;
  balance: number;
}

const account = schemaFor<Account>()({
  id: string(),
  balance: number(),
}); // ✅ コンパイルが通る

// 後で `Account` に `currency: string` が増えると、フィールドを追加するまで
// これはコンパイルが通らなくなる — スキーマが型から乖離できなくなる。
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

### 開発

```bash
npm install
npm run typecheck   # tsc --noEmit —型レベル保証にとっての本当のテスト
npm test            # ランタイム適合テスト (vitest)
```

すべての機能は、ランタイムテストと型レベルテストの**両方**を伴って提供されます。
