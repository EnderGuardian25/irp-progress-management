import { describe, it, expect } from "vitest";
import * as core from "@irp/core";

describe("@irp/core dist consumption", () => {
  it("resolves the built package and exposes classifyDay", () => {
    // @irp/core.main points at dist/index.js — this fails unless core was built.
    expect(typeof core.classifyDay).toBe("function");
  });
});
