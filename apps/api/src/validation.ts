import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { FastifySchemaCompiler } from "fastify";

export interface AjvOptions {
  /**
   * Coerce scalars to the declared type. Correct for `querystring`, `params`
   * and `headers` — those arrive as strings over the wire, so a spec parameter
   * declared `type: integer` can never validate without it. Wrong for bodies:
   * JSON already carries types, so a string where an integer is declared is a
   * real client bug and must be rejected, not silently repaired.
   */
  coerceTypes?: boolean;
}

/**
 * An Ajv instance configured for this service.
 *
 * `ajv/dist/2020` — the spec is OpenAPI 3.1, whose schemas are JSON Schema
 * 2020-12. Fastify's default ajv is draft-07 and silently misinterprets 2020-12
 * keywords (ADR-0006). `ajv-formats` is mandatory: the document uses
 * format: uuid / email / uri-reference, and an unknown format throws at
 * compile time — the API would fail at boot, not on a bad request.
 *
 * The no-argument call is the strict, body-shaped instance; that is the
 * signature `test/validation.test.ts` exercises.
 */
export function buildAjv(options: AjvOptions = {}): Ajv {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    coerceTypes: options.coerceTypes ?? false,
    removeAdditional: false,
    useDefaults: false,
  });
  addFormats(ajv);
  return ajv;
}

/**
 * The validator compiler Fastify calls once per route schema.
 *
 * Fastify passes the `httpPart` being compiled — `body`, `querystring`,
 * `params` or `headers` — and the right ajv configuration is not the same for
 * all four. Handing every part the strict, non-coercing instance makes the
 * first `type: integer` parameter in the spec fail on every request with
 * "must be integer", while the spec, the generated types and the client all
 * look correct. So: two instances, selected on `httpPart`.
 */
export function createValidatorCompiler(): FastifySchemaCompiler<unknown> {
  const bodyAjv = buildAjv();
  const wireAjv = buildAjv({ coerceTypes: true });
  return ({ schema, httpPart }) =>
    (httpPart === "body" ? bodyAjv : wireAjv).compile(schema as object);
}
