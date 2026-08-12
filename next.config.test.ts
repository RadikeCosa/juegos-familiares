import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("nextConfig", () => {
  it("keeps generated agent rule files disabled", () => {
    expect(nextConfig.agentRules).toBe(false);
  });
});
