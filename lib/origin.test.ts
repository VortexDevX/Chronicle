import { afterEach, describe, expect, it } from "vitest";
import {
  getAllowedCorsOrigin,
  getAppOrigins,
  getPrimaryAppOrigin,
} from "@/lib/origin";

const originalAppOrigin = process.env.APP_ORIGIN;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.APP_ORIGIN = originalAppOrigin;
  Object.defineProperty(process.env, "NODE_ENV", {
    value: originalNodeEnv,
    configurable: true,
    enumerable: true,
    writable: true,
  });
});

describe("origin helpers", () => {
  it("parses comma-separated origins", () => {
    process.env.APP_ORIGIN = "https://a.example.com, https://b.example.com/";

    expect(getAppOrigins()).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("uses first configured origin for generated links", () => {
    process.env.APP_ORIGIN = "https://a.example.com,https://b.example.com";

    expect(getPrimaryAppOrigin("http://localhost:3000")).toBe("https://a.example.com");
  });

  it("allows only configured CORS origins", () => {
    process.env.APP_ORIGIN = "https://a.example.com,https://b.example.com";

    expect(getAllowedCorsOrigin("https://b.example.com")).toBe("https://b.example.com");
    expect(getAllowedCorsOrigin("https://c.example.com")).toBeNull();
  });

  it("does not allow arbitrary production origins when APP_ORIGIN is empty", () => {
    process.env.APP_ORIGIN = "";
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      enumerable: true,
      writable: true,
    });

    expect(getAllowedCorsOrigin("https://random.example.com")).toBeNull();
  });
});
