// ---------------------------------------------------------------------------
// Errors & results
// ---------------------------------------------------------------------------

/**
 * A machine-readable issue code. Pair it with {@link Issue.params} to render a
 * localized message; the English {@link Issue.message} is only the fallback, so
 * totalis errors are i18n-ready without shipping locale files.
 */
export type IssueCode =
  | "invalid_type"
  | "invalid_literal"
  | "invalid_value"
  | "invalid_string"
  | "too_small"
  | "too_big"
  | "not_multiple_of"
  | "invalid_union"
  | "custom";

/** A single validation failure, located by `path` and described by `code`. */
export interface Issue {
  /** Machine-readable code, for localization or branching. */
  readonly code: IssueCode;
  /** The path into the input value (object keys + array indices). */
  readonly path: ReadonlyArray<PropertyKey>;
  /** Default (English) human-readable message. */
  readonly message: string;
  /** Structured data behind the message, for localized re-rendering. */
  readonly params: Readonly<Record<string, unknown>>;
}

/** Render an {@link Issue} into a (possibly localized) string. */
export type Localizer = (issue: Issue) => string;

/**
 * A tree of error messages mirroring the shape of the input — the natural
 * structure for rendering per-field errors in a form UI.
 */
export interface ErrorTree {
  /** Errors attached at this node. */
  errors: string[];
  /** Errors nested under object keys. */
  properties?: { [key: string]: ErrorTree };
  /** Errors nested under array indices. */
  items?: ErrorTree[];
}

const identityLocalizer: Localizer = (issue) => issue.message;

/** The error thrown by {@link Schema.parse} and surfaced by `safeParse`. */
export class ValidationError extends Error {
  readonly issues: ReadonlyArray<Issue>;

  constructor(issues: ReadonlyArray<Issue>) {
    super(ValidationError.summarize(issues));
    this.name = "ValidationError";
    this.issues = issues;
  }

  /** A one-line summary, e.g. `Expected number, received string at age`. */
  private static summarize(issues: ReadonlyArray<Issue>): string {
    if (issues.length === 0) return "Validation failed";
    return issues
      .map((issue) => {
        const where = issue.path.length > 0 ? ` at ${issue.path.map(String).join(".")}` : "";
        return `${issue.message}${where}`;
      })
      .join("; ");
  }

  /**
   * Group issues into `{ formErrors, fieldErrors }`: top-level issues vs. issues
   * keyed by their first path segment. Ideal for simple, flat forms. Pass a
   * {@link Localizer} to translate messages.
   */
  flatten(localize: Localizer = identityLocalizer): {
    formErrors: string[];
    fieldErrors: Record<string, string[]>;
  } {
    const formErrors: string[] = [];
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of this.issues) {
      const key = issue.path[0];
      if (key === undefined) formErrors.push(localize(issue));
      else (fieldErrors[String(key)] ??= []).push(localize(issue));
    }
    return { formErrors, fieldErrors };
  }

  /**
   * Build a tree mirroring the input shape, with messages at each node. Ideal
   * for deeply-nested per-field errors. Pass a {@link Localizer} to translate.
   */
  format(localize: Localizer = identityLocalizer): ErrorTree {
    const root: ErrorTree = { errors: [] };
    for (const issue of this.issues) {
      let node = root;
      for (const segment of issue.path) {
        if (typeof segment === "number") {
          const items = (node.items ??= []);
          // Keep `items` dense: fill any gap with empty nodes so the array
          // never contains holes (which would violate its `ErrorTree[]` type
          // and crash consumers iterating with `for...of`).
          while (items.length <= segment) items.push({ errors: [] });
          node = items[segment] ?? (items[segment] = { errors: [] });
        } else {
          const properties = (node.properties ??= {});
          node = properties[String(segment)] ??= { errors: [] };
        }
      }
      node.errors.push(localize(issue));
    }
    return root;
  }
}

/** Build the default (English) message for an issue code from its params. */
export function defaultMessage(code: IssueCode, params: Readonly<Record<string, unknown>>): string {
  switch (code) {
    case "invalid_type":
      return `Expected ${String(params.expected)}, received ${String(params.received)}`;
    case "invalid_literal":
      return `Expected ${JSON.stringify(params.expected)}, received ${JSON.stringify(params.received)}`;
    case "invalid_value":
      return `Expected one of ${String(params.options)}, received ${JSON.stringify(params.received)}`;
    case "too_small":
      return `Expected at least ${String(params.minimum)} item(s)`;
    case "too_big":
      return `Expected at most ${String(params.maximum)} item(s)`;
    case "invalid_string":
      return `Invalid ${String(params.validation)}`;
    case "not_multiple_of":
      return `Expected a multiple of ${String(params.multipleOf)}`;
    case "invalid_union":
      return "options" in params
        ? `Expected discriminant ${String(params.options)}, received ${JSON.stringify(params.received)}`
        : "Input did not match any union member";
    case "custom":
      return typeof params.message === "string" ? params.message : "Invalid input";
  }
}
