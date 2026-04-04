import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  AuthError,
  NotFoundError,
  RateLimitError,
  ConflictError,
} from "../../api/utils/errors";

describe("AppError", () => {
  it("creates error with code, message, and status", () => {
    const err = new AppError("TEST_CODE", "Test message", 422);
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("Test message");
    expect(err.status).toBe(422);
    expect(err).toBeInstanceOf(Error);
  });

  it("defaults status to 400", () => {
    const err = new AppError("BAD", "Bad request");
    expect(err.status).toBe(400);
  });
});

describe("ValidationError", () => {
  it("creates 400 error with custom message", () => {
    const err = new ValidationError("Title is required");
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("Title is required");
  });
});

describe("AuthError", () => {
  it("creates 401 error with defaults", () => {
    const err = new AuthError();
    expect(err.status).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Unauthorized");
  });
});

describe("NotFoundError", () => {
  it("creates 404 error", () => {
    const err = new NotFoundError();
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("RateLimitError", () => {
  it("creates 429 error with retry info", () => {
    const err = new RateLimitError(30);
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(30);
    expect(err.message).toContain("30s");
  });
});

describe("ConflictError", () => {
  it("creates 409 error", () => {
    const err = new ConflictError("Duplicate title");
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Duplicate title");
  });
});
