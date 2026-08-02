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

export const ABSENCE_CREATE_BODY = {
  type: "object",
  required: ["date", "reason"],
  additionalProperties: false,
  properties: {
    date: { type: "string", format: "date" },
    reason: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

export const DATE_PARAM = {
  type: "object",
  required: ["date"],
  additionalProperties: false,
  properties: { date: { type: "string", format: "date" } },
} as const;
