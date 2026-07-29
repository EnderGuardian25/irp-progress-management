import { describe, expect, it } from "vitest";
import { createClient, createConfig } from "@irp/client/client";
import { getCurrentUser } from "@irp/client";

describe("@irp/client subpath export", () => {
  it("exposes createClient and createConfig from the ./client subpath", () => {
    expect(typeof createClient).toBe("function");
    expect(typeof createConfig).toBe("function");
  });

  it("builds an isolated client that does not share the module singleton", () => {
    const a = createClient(createConfig({ baseUrl: "http://a.test" }));
    const b = createClient(createConfig({ baseUrl: "http://b.test" }));
    expect(a).not.toBe(b);
    expect(a.getConfig().baseUrl).toBe("http://a.test");
    expect(b.getConfig().baseUrl).toBe("http://b.test");
  });

  it("still exposes the generated SDK operations from the root export", () => {
    expect(typeof getCurrentUser).toBe("function");
  });
});
