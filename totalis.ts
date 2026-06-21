/**
 * totalis — a TypeScript-first runtime validation library.
 *
 * The single core idea: the schema is the source of truth, and both the
 * runtime validator AND the static type are derived from the same object
 * (`Infer<typeof schema>`). The differentiator is COMPLETENESS — a schema
 * must not be able to silently drift from the type it claims to validate.
 *
 * This module is a thin barrel: the implementation lives in `./src/*`, split
 * into layered, acyclic modules. Everything below is re-exported so the public
 * API (and every test importing from `"./totalis"`) is unchanged.
 */

// Standard Schema v1 (vendored).
export { VENDOR } from "./src/standard-schema";
export type { StandardSchemaV1 } from "./src/standard-schema";

// Errors & results.
export { ValidationError } from "./src/errors";
export type { ErrorTree, Issue, IssueCode, Localizer } from "./src/errors";

// Schema base, Codec, brands, wrappers, and their factories.
export { Codec, codec, nullable, optional, Schema } from "./src/schema";
export type {
  Brand,
  Branded,
  Infer,
  InferInput,
  NonEmptyArray,
  ParseResult,
} from "./src/schema";

// Primitives.
export { boolean, coerce, date, int, literal, number, string } from "./src/primitives";
export type { Integer } from "./src/primitives";

// Collections & objects.
export {
  array,
  intersection,
  lazy,
  object,
  objectCodec,
  ObjectCodec,
  ObjectSchema,
  record,
  tuple,
} from "./src/collections";
export type {
  EncodableShape,
  ExtendShape,
  InferShape,
  InferShapeInput,
  InferTuple,
  PartialShape,
  Shape,
} from "./src/collections";

// Unions, enums & exhaustiveness helpers.
export {
  assertNever,
  discriminatedUnion,
  enumFor,
  match,
  union,
  unionFor,
} from "./src/unions";

// Completeness API.
export { codecFor, schemaFor } from "./src/completeness";
export type { SchemaFor } from "./src/completeness";
