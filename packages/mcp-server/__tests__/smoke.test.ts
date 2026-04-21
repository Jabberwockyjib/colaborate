import { describe, expect, it } from "vitest";
import { PACKAGE_VERSION } from "../src/index.js";

describe("@colaborate/mcp-server smoke", () => {
  it("exports PACKAGE_VERSION matching a semver string", () => {
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });
});
