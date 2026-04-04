import { describe, it, expect } from "vitest";
import {
  getRequiredEnv,
  getOptionalEnv,
  ConfigError,
} from "../../api/utils/config";

describe("getRequiredEnv", () => {
  it("returns the value when set", () => {
    process.env.TEST_REQUIRED = "test-value";
    expect(getRequiredEnv("TEST_REQUIRED")).toBe("test-value");
    delete process.env.TEST_REQUIRED;
  });

  it("throws ConfigError when missing", () => {
    delete process.env.MISSING_VAR;
    expect(() => getRequiredEnv("MISSING_VAR")).toThrow(ConfigError);
    expect(() => getRequiredEnv("MISSING_VAR")).toThrow(
      /Missing required environment variable/,
    );
  });
});

describe("getOptionalEnv", () => {
  it("returns the value when set", () => {
    process.env.TEST_OPTIONAL = "optional-value";
    expect(getOptionalEnv("TEST_OPTIONAL")).toBe("optional-value");
    delete process.env.TEST_OPTIONAL;
  });

  it("returns fallback when missing", () => {
    delete process.env.MISSING_OPTIONAL;
    expect(getOptionalEnv("MISSING_OPTIONAL", "default")).toBe("default");
  });

  it("returns empty string as default fallback", () => {
    delete process.env.EMPTY_OPTIONAL;
    expect(getOptionalEnv("EMPTY_OPTIONAL")).toBe("");
  });
});
