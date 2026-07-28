import { describe, it, expect } from "vitest";
import { buildAjv } from "../src/validation.js";

describe("buildAjv", () => {
  it("enforces additionalProperties:false at runtime", () => {
    const ajv = buildAjv();
    const validate = ajv.compile({
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: { name: { type: "string" } },
    });
    expect(validate({ name: "ok" })).toBe(true);
    expect(validate({ name: "ok", extra: "nope" })).toBe(false);
  });

  it("compiles format: uuid / email / uri-reference without throwing (ajv-formats present)", () => {
    const ajv = buildAjv();
    // Missing ajv-formats makes this THROW at compile time (the boot-failure trap, ADR-0006).
    expect(() =>
      ajv.compile({
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          type: { type: "string", format: "uri-reference" },
        },
      }),
    ).not.toThrow();
  });

  it("interprets 2020-12 keywords (prefixItems) rather than draft-07", () => {
    const ajv = buildAjv();
    const validate = ajv.compile({
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      items: false,
      minItems: 2,
      maxItems: 2,
    });
    expect(validate(["a", 1])).toBe(true);
    expect(validate(["a", 1, "extra"])).toBe(false);
  });
});
