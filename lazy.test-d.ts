/**
 * lazy carries the annotated output type through unchanged, so a recursive
 * schema's `Infer` equals the recursive type it claims to validate. Because the
 * getter must return `Schema<T>`, the schema cannot drift from `T` — and
 * wrapping `schemaFor<T>()` inside keeps the EXACT per-field guarantee, so a
 * drifting field fails to compile.
 */
import { describe, expectTypeOf, test } from "vitest";

import { array, lazy, number, object, schemaFor, string, type Infer, type Schema } from "./totalis";

interface Category {
  name: string;
  subcategories: Category[];
}

const Category: Schema<Category> = lazy(() =>
  object({ name: string(), subcategories: array(Category) }),
);

describe("lazy keeps Infer equal to the recursive type", () => {
  test("Infer of a recursive schema is the recursive type", () => {
    expectTypeOf<Infer<typeof Category>>().toEqualTypeOf<Category>();
  });

  test("a non-recursive lazy preserves its output", () => {
    const S = lazy(() => object({ n: number() }));
    expectTypeOf<Infer<typeof S>>().toEqualTypeOf<{ n: number }>();
  });
});

describe("lazy still cannot drift from the type", () => {
  test("a getter returning the wrong shape fails to compile", () => {
    // subcategories is missing -> object's Infer is not assignable to Category
    // @ts-expect-error schema drifted from the annotated recursive type
    const Drifted: Schema<Category> = lazy(() => object({ name: string() }));
    void Drifted;
  });

  test("schemaFor inside lazy keeps the EXACT per-field guarantee", () => {
    const Exact: Schema<Category> = lazy(() =>
      schemaFor<Category>()({ name: string(), subcategories: array(Category) }),
    );
    expectTypeOf<Infer<typeof Exact>>().toEqualTypeOf<Category>();

    const TooNarrow: Schema<Category> = lazy(() =>
      // @ts-expect-error a too-narrow field (literal) fails EXACT schemaFor
      schemaFor<Category>()({ name: string().brand<"X">(), subcategories: array(Category) }),
    );
    void TooNarrow;
  });
});
