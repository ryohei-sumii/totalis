/**
 * Type-level shape of the structured error API (roadmap 6), as vitest type
 * tests.
 */
import { describe, expectTypeOf, test } from "vitest";

import {
  number,
  object,
  string,
  ValidationError,
  type ErrorTree,
  type Issue,
  type IssueCode,
  type Localizer,
} from "./totalis";

describe("Issue is machine-readable and i18n-ready", () => {
  test("Issue carries code / path / message / params", () => {
    expectTypeOf<Issue["code"]>().toEqualTypeOf<IssueCode>();
    expectTypeOf<Issue["path"]>().toEqualTypeOf<ReadonlyArray<PropertyKey>>();
    expectTypeOf<Issue["message"]>().toEqualTypeOf<string>();
    expectTypeOf<Issue["params"]>().toEqualTypeOf<Readonly<Record<string, unknown>>>();
  });

  test("IssueCode is a closed union", () => {
    expectTypeOf<IssueCode>().toEqualTypeOf<
      "invalid_type" | "invalid_literal" | "too_small" | "invalid_union" | "custom"
    >();
  });

  test("a Localizer maps an Issue to a string", () => {
    expectTypeOf<Localizer>().toEqualTypeOf<(issue: Issue) => string>();
  });
});

describe("ValidationError exposes structured views", () => {
  const error = (() => {
    const r = object({ name: string(), age: number() }).safeParse({});
    if (r.success) throw new Error("unreachable");
    return r.error;
  })();

  test("flatten() returns form + field errors", () => {
    expectTypeOf(error.flatten()).toEqualTypeOf<{
      formErrors: string[];
      fieldErrors: Record<string, string[]>;
    }>();
  });

  test("format() returns an ErrorTree", () => {
    expectTypeOf(error.format()).toEqualTypeOf<ErrorTree>();
  });

  test("both accept a Localizer", () => {
    expectTypeOf(error.flatten).parameter(0).toEqualTypeOf<Localizer | undefined>();
    expectTypeOf(error.format).parameter(0).toEqualTypeOf<Localizer | undefined>();
  });

  test("instanceof narrows to ValidationError", () => {
    expectTypeOf<ValidationError["issues"]>().toEqualTypeOf<ReadonlyArray<Issue>>();
  });
});
