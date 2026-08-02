/**
 * Route-level JSON Schemas (2020-12), mirroring spec/openapi.yaml request
 * shapes. The spec is the source of truth; these literals exist because
 * Fastify validates per-route and the generated packages export TypeScript
 * types, not JSON Schema. A mismatch here is a bug — fix the spec first,
 * then this mirror. Keep additionalProperties: false on every body.
 */
export const ENTRY_CREATE_BODY = {
  type: "object",
  required: ["entryDate", "body"],
  additionalProperties: false,
  properties: {
    entryDate: { type: "string", format: "date" },
    body: { type: "string", minLength: 1, maxLength: 4000 },
  },
} as const;
