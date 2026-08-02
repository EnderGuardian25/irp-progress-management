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

export const BATCH_CREATE_BODY = {
  type: "object",
  required: ["name", "startDate", "endDate"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    startDate: { type: "string", format: "date" },
    endDate: { type: "string", format: "date" },
  },
} as const;

export const UUID_PARAM = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", format: "uuid" } },
} as const;

export const ROSTER_QUERY = {
  type: "object",
  additionalProperties: false,
  properties: { date: { type: "string", format: "date" } },
} as const;

export const TRANSITION_BODY = {
  type: "object",
  required: ["to"],
  additionalProperties: false,
  properties: {
    to: { type: "string", enum: ["InReview", "Evaluated"] },
  },
} as const;

export const DAY_RECORD_BODY = {
  type: "object",
  required: ["attended", "tasksCompleted"],
  additionalProperties: false,
  properties: {
    attended: { type: "boolean" },
    tasksCompleted: { type: "boolean" },
    note: { type: "string", maxLength: 500 },
  },
} as const;

export const STUDENT_DATE_PARAM = {
  type: "object",
  required: ["id", "date"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    date: { type: "string", format: "date" },
  },
} as const;
