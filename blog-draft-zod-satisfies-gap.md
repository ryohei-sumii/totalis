# その Zod スキーマ、本当に型と一致してる？──`satisfies z.ZodType<T>` の片側性

## TL;DR

- Zod の `schema satisfies z.ZodType<T>` は、スキーマが型 `T` と一致しているかを確かめる定番のイディオムだ。
- だがこのチェックは **一方向の代入可能性** しか見ない。スキーマの出力が `T` より **狭い**（真部分型になる）場合、**コンパイルは黙って通る**。
- 具体的には「フィールドをうっかり literal に狭めた」「enum / ユニオンの一部しか覆っていない」「任意フィールドを必須にした」がすべてすり抜ける。
- 原因は `z.ZodType<out Output, …>` が出力について **共変** だから。部分型は代入可能なので `satisfies` を満たしてしまう。
- これは Zod のバグではなく、「型 → スキーマ」を assignability で検査することの構造的な限界。フィールド単位の **等価（exact）** チェックが必要になる。
- 末尾に zod@4.4.3 / typescript@6.0.3 で誰でも再現できるコードを置いた。

---

## 1. 型チェックを通り抜けるバグ

こんなコードを書いたとする。ユーザーの型は別のどこか（OpenAPI / Prisma / GraphQL の codegen、あるいは社内の共有型パッケージ）で定義されていて、こちら側はその境界バリデータを Zod で書く。

```ts
import { z } from "zod";

// ↓ この型は「別の場所」で生成・管理されている契約
type User = {
  id: number;
  role: string;          // "admin" | "member" | … 何でも入りうる
};

const userSchema = z.object({
  id: z.number(),
  role: z.literal("admin"),   // ← うっかり literal で固定してしまった
});

// 型と一致しているか確認するつもりの一行
userSchema satisfies z.ZodType<User>;
```

`role` は `User` では `string` なのに、スキーマでは `z.literal("admin")` に狭めてしまっている。`role: "member"` のユーザーは弾かれる。これは明確なバグだ。

ところが、**この `satisfies` はコンパイルを通る。** 赤い波線は出ない。`tsc` も何も言わない。

「型に合わせたはずのスキーマ」が、実は型より狭い。そしてそれを検出するために書いた `satisfies` が、それを見逃す。

## 2. すり抜けるのは1つじゃない

同じ穴は、ドリフトの「狭める方向」全部に空いている。以下はすべて **エラーにならない**（zod@4.4.3 で確認）。

```ts
// ① フィールドを literal に狭める（上の例）
type User = { id: number; role: string };
z.object({ id: z.number(), role: z.literal("admin") })
  satisfies z.ZodType<User>;                              // ✅ 通る

// ② enum の網羅漏れ："deleted" を覆っていない
type Status = "active" | "archived" | "deleted";
z.enum(["active", "archived"])
  satisfies z.ZodType<Status>;                            // ✅ 通る

// ③ 任意フィールドを必須にする：T では name? なのにスキーマは必須
type Profile = { name?: string };
z.object({ name: z.string() })
  satisfies z.ZodType<Profile>;                           // ✅ 通る

// ④ ユニオンの変種欠落：T は click | key なのにスキーマは click だけ
type Event =
  | { type: "click"; x: number }
  | { type: "key"; code: string };
z.object({ type: z.literal("click"), x: z.number() })
  satisfies z.ZodType<Event>;                             // ✅ 通る
```

②④ が地味に怖い。`Status` に `"deleted"` を足したり、`Event` に新しい変種を足したりしても、**既存のスキーマはコンパイルが通り続ける**。型を増やしたのにバリデータが追従していない、という最悪のズレが静かに残る。

## 3. なぜ通ってしまうのか

逆に、Zod が **ちゃんと検出する** ケースもある。

```ts
// 出力が T より「広い」→ エラーになる
type Account = { token: string };
z.object({ token: z.string().optional() })
  satisfies z.ZodType<Account>;     // ✗ string | undefined は string に代入不可

// 型が違う → エラーになる
z.object({ id: z.number(), role: z.number() })
  satisfies z.ZodType<User>;        // ✗ number は string に代入不可
```

つまりギャップは **「狭める方向」だけ** に存在する。ここに原理がある。

Zod の型定義はこうなっている（v4.4.3、第3引数 `Internals` は省略）。

```ts
interface ZodType<
  out Output = unknown,
  out Input = unknown,
  /* out Internals … */
> { … }
```

`out` は **共変（covariance）** の注釈だ。出力型 `S` が `T` の部分型（`S <: T`）なら、`z.ZodType<S>` は `z.ZodType<T>` に代入できる。

`satisfies z.ZodType<T>` は「このスキーマは `z.ZodType<T>` に代入可能か？」を問うだけ。だから出力が `T` の部分型になっているスキーマ──`literal` への狭め、enum / ユニオンの一部、必須化したフィールド──はすべて「代入可能＝OK」と判定される。

`satisfies` が見ているのは **assignability（代入可能性）であって equality（等価）ではない。** そして assignability は片側通行だ。

これは Zod の不具合ではない。「型を別に持っていて、それにスキーマを突き合わせる」という使い方を assignability で検査すれば、原理的にこうなる。

> 補足：Zod の主たる使い方は `type User = z.infer<typeof userSchema>`、つまり **スキーマが真実の源** で型をそこから導く流儀だ。この流儀ならズレは起きようがない（型はスキーマの写しだから）。問題が出るのは「型が先にあって、スキーマをそれに合わせる」という逆向きの場面に限られる。

## 4. では何が必要か──assignability ではなく equality

ズレを「狭める方向」も含めて捕まえたいなら、`Infer<schema>` と `T` が **代入可能** であることではなく、**等しい** ことをフィールド単位で要求すればいい。型レベルではこう書ける。

```ts
// 相互に代入可能 = 等価
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
```

`Equals` は片側通行ではないので、`"admin"` と `string` のような部分型関係を「不一致」と判定する。

これを核に据えて作ってみたのが [totalis](https://github.com/ryohei-sumii/totalis) という小さな検証ライブラリだ。`satisfies` の代わりに `schemaFor<T>()` を使う。

```ts
import { schemaFor, enumFor, unionFor, object, number, string, literal } from "totalis";

// ① literal への狭めを名指しで拒否
type User = { id: number; role: string };
schemaFor<User>()({
  id: number(),
  role: literal("admin"),
  // ^ コンパイルエラー:
  //   ✗ field 'role' must validate EXACTLY the declared type
  //     (too loose, too narrow, branded, or optional-mismatch)
});

// ② enum 網羅漏れを名指しで拒否
type Status = "active" | "archived" | "deleted";
enumFor<Status>()(["active", "archived"]);
//  ✗ enum is missing declared member: deleted

// ④ ユニオン変種欠落を拒否
type Event =
  | { type: "click"; x: number }
  | { type: "key"; code: string };
unionFor<Event>()("type", [
  object({ type: literal("click"), x: number() }),
]); // ✗ union is missing the "key" variant
```

`Status` に `"deleted"` を足した瞬間、`enumFor<Status>()([...])` は **コンパイルが通らなくなる**。型を直すまでビルドが赤いままになる。これが欲しかった性質だ。「型を増やしたらバリデータも直さざるを得ない」。

## 5. 正直な立ち位置

念のため言っておくと、これは「Zod を倒す」話ではない。

- **エコシステム・普及・機能の広さ** は Zod が圧倒的で、そこを取りに行く意味はない。
- **バンドルサイズ** なら Valibot、**生の速度や型from文字列** なら ArkType が上だ。
- 上で見たギャップも、Zod の主流の使い方（`z.infer` でスキーマを源にする）では **そもそも発生しない。**

この exact チェックが効くのは、ただ一つの状況に限る──**型が契約であるとき。** ドメイン型を別の場所（codegen / 共有型パッケージ / 手書きの API 契約）で持っていて、境界のバリデータがそれと **証明可能に一致** していてほしい。型を再生成したらズレが即コンパイルエラーになってほしい。そういう場面だ。

その一点では、`satisfies z.ZodType<T>` の assignability では構造的に届かない保証が要る、という話だった。

## 付録：再現

zod@4.4.3 / typescript@6.0.3 で確認した。自己検証する最小コードを置いてある。

- `zod-side.ts` … 抑制ディレクティブなし。`tsc` がクリーン＝4つの `satisfies` が全部受理された（＝Zod がドリフトを通した）証明。
- `totalis-side.ts` … 同じ4ドリフトを `@ts-expect-error` で標識。totalis が捕捉をやめたら「未使用ディレクティブ」で `tsc` が落ちる。クリーン＝全部まだコンパイルエラーである証明。

```bash
git clone https://github.com/ryohei-sumii/totalis
cd totalis/examples/zod-vs-totalis
pnpm install
pnpm run verify   # tsc --noEmit → exit 0（Zod は全受理 / totalis は全拒否を同時に証明）
```

`zod-side.ts` をエディタで開けば、4つの `satisfies` 行に赤い波線が出ないことが目で確認できる。`totalis-side.ts` の `@ts-expect-error` をどれか消して再実行すれば、名指しのエラーメッセージが現れる。
