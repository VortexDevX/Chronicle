/**
 * Typed application errors.
 * Each carries a machine-readable `code` and HTTP `status`.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = "VALIDATION_ERROR") {
    super(code, message, 400);
    this.name = "ValidationError";
  }
}

export class AuthError extends AppError {
  constructor(
    message = "Unauthorized",
    code = "UNAUTHORIZED",
  ) {
    super(code, message, 401);
    this.name = "AuthError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", code = "NOT_FOUND") {
    super(code, message, 404);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    super(
      "RATE_LIMITED",
      `Too many requests. Retry in ${retryAfterSec}s`,
      429,
    );
    this.name = "RateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(code, message, 409);
    this.name = "ConflictError";
  }
}
