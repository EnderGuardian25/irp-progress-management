export const problemSchema = {
  type: "object",
  required: ["type", "title", "status", "traceId"],
  additionalProperties: true,
  properties: {
    type: { type: "string", format: "uri-reference" },
    title: { type: "string" },
    status: { type: "integer", minimum: 100, maximum: 599 },
    detail: { type: "string" },
    instance: { type: "string", format: "uri-reference" },
    traceId: { type: "string" },
  },
} as const;
