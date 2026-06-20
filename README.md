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
size, or ArkType on raw speed. Those axes are taken. Our axis is
**completeness / exhaustiveness (完全性・網羅性)**.

Every other library is fundamentally one-directional: *schema → type*. They let
your runtime schema and your domain types silently drift apart. totalis makes
the **reverse guarantee** first-class:

1. **type → schema completeness** — if a TS type gains a field, the schema that
   claims to validate it must *fail to compile* until it is updated
   (`schemaFor<T>()`).
2. **exhaustive unions** — discriminated unions get compile-time exhaustiveness;
   adding a variant forces every consumer to handle it. *(on the roadmap)*
3. **no silent widening / no `any` leaks** — the type-level code never degrades
   to `any`, and that is verified with type-level tests, not just runtime tests.

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
**完全性・網羅性（completeness / exhaustiveness）**です。

既存ライブラリは本質的に一方向、つまり *スキーマ → 型* です。そのため、ランタイムの
スキーマとドメインの型が知らないうちに食い違っていきます。totalis は、その**逆方向の
保証**を主役に据えます。

1. **型 → スキーマの完全性** — TS の型にフィールドが増えたら、それを検証すると
   謳うスキーマは更新するまで*コンパイルエラーになる*（`schemaFor<T>()`）。
2. **網羅的なユニオン** — 判別可能なユニオンにコンパイル時の網羅性検査を与え、
   バリアントを追加すると全ての利用箇所で対応が強制される。*（ロードマップ）*
3. **暗黙の拡大（widening）なし／`any` の漏れなし** — 型レベルのコードが `any` に
   退化しないことを、ランタイムテストだけでなく型レベルテストでも検証します。

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

### 開発

```bash
npm install
npm run typecheck   # tsc --noEmit —型レベル保証にとっての本当のテスト
npm test            # ランタイム適合テスト (vitest)
```

すべての機能は、ランタイムテストと型レベルテストの**両方**を伴って提供されます。
