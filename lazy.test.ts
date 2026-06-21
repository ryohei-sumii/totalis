import { describe, expect, it } from "vitest";

import { array, lazy, number, object, string, type Schema } from "./totalis";

interface Category {
  name: string;
  subcategories: Category[];
}

const Category: Schema<Category> = lazy(() =>
  object({ name: string(), subcategories: array(Category) }),
);

describe("lazy (recursive schemas)", () => {
  it("parses an arbitrarily nested structure", () => {
    const tree = {
      name: "root",
      subcategories: [
        { name: "a", subcategories: [] },
        { name: "b", subcategories: [{ name: "b1", subcategories: [] }] },
      ],
    };
    const r = Category.safeParse(tree);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(tree);
  });

  it("rejects a deep invalid node and reports its path", () => {
    const bad = {
      name: "root",
      subcategories: [{ name: 123, subcategories: [] }],
    };
    const r = Category.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.path).toEqual(["subcategories", 0, "name"]);
    }
  });

  it("builds the inner schema only once (getter is memoized)", () => {
    let calls = 0;
    const Tree: Schema<Category> = lazy(() => {
      calls++;
      return object({ name: string(), subcategories: array(Tree) });
    });
    Tree.parse({
      name: "root",
      subcategories: [{ name: "a", subcategories: [{ name: "a1", subcategories: [] }] }],
    });
    expect(calls).toBe(1);
  });

  it("supports mutual recursion", () => {
    interface Folder {
      name: string;
      files: File[];
    }
    interface File {
      filename: string;
      parent: Folder | null;
    }
    const Folder: Schema<Folder> = lazy(() =>
      object({ name: string(), files: array(File) }),
    );
    const File: Schema<File> = lazy(() =>
      object({ filename: string(), parent: Folder.nullable() }),
    );
    const r = Folder.safeParse({
      name: "docs",
      files: [{ filename: "readme.md", parent: null }],
    });
    expect(r.success).toBe(true);
  });

  it("works with a non-recursive lazy (deferred reference)", () => {
    const Inner: Schema<{ n: number }> = lazy(() => object({ n: number() }));
    expect(Inner.safeParse({ n: 1 }).success).toBe(true);
    expect(Inner.safeParse({ n: "x" }).success).toBe(false);
  });

  it("returns a failure (never throws) on a cyclic input", () => {
    const a: { name: string; subcategories: unknown[] } = { name: "x", subcategories: [] };
    a.subcategories.push(a); // a is its own descendant
    expect(() => Category.safeParse(a)).not.toThrow();
    const r = Category.safeParse(a);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.params).toMatchObject({ received: "circular reference" });
    }
  });

  it("accepts a non-cyclic shared reference (DAG), not just a tree", () => {
    // `shared` appears twice as a sibling — not a cycle — so it must validate.
    const shared = { name: "shared", subcategories: [] };
    const root = { name: "root", subcategories: [shared, shared] };
    expect(Category.safeParse(root).success).toBe(true);
  });
});
