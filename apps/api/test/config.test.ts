import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

const base = {
  DATABASE_URL: "postgresql://irp:irp@localhost:5432/irp?schema=public",
  JWKS_URI: "https://example/keys",
  JWT_ISSUER: "https://issuer/v2.0",
  JWT_AUDIENCE: "api://irp",
};

describe("loadConfig", () => {
  it("applies defaults for optional vars", () => {
    const c = loadConfig({ ...base });
    expect(c.port).toBe(3001);
    expect(c.version).toBe("0.0.0");
    expect(c.nodeEnv).toBe("development");
  });

  it("parses PORT as a number", () => {
    expect(loadConfig({ ...base, PORT: "8080" }).port).toBe(8080);
  });

  it("throws listing every missing required var", () => {
    expect(() => loadConfig({})).toThrowError(
      /DATABASE_URL.*JWKS_URI.*JWT_ISSUER.*JWT_AUDIENCE/s,
    );
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => loadConfig({ ...base, PORT: "not-a-number" })).toThrowError(/PORT/);
  });
});
