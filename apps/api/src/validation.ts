import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { FastifySchemaCompiler } from "fastify";

/**
 * The one Ajv instance the service validates with.
 *
 * `ajv/dist/2020` — the spec is OpenAPI 3.1, whose schemas are JSON Schema
 * 2020-12. Fastify's default ajv is draft-07 and silently misinterprets 2020-12
 * keywords (ADR-0006). `ajv-formats` is mandatory: the document uses
 * format: uuid / email / uri-reference, and an unknown format throws at
 * compile time — the API would fail at boot, not on a bad request.
 */
export function buildAjv(): Ajv {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    coerceTypes: false,
    removeAdditional: false,
    useDefaults: false,
  });
  addFormats(ajv);
  return ajv;
}

export function createValidatorCompiler(ajv: Ajv): FastifySchemaCompiler<unknown> {
  return ({ schema }) => ajv.compile(schema as object);
}
