import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User } from "./_utils/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { checkRateLimit, getClientIp } from "./_utils/rateLimit.js";
import { logInternalError, logSecurityEvent } from "./_utils/log.js";
import { handleOptions, setCors, jsonOk, jsonError } from "./_utils/http.js";
import { getRequiredEnv } from "./_utils/config.js";

const MAX_USERNAME = 30;
const MIN_USERNAME = 3;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCors(req, res);

  if (req.method !== "POST") {
    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  try {
    const { action, username, password } = req.body || {};
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");
    const ip = getClientIp(req);

    const authLimit =
      action === "register"
        ? await checkRateLimit(`auth:register:${ip}`, 8, 15 * 60 * 1000)
        : await checkRateLimit(`auth:login:${ip}`, 18, 10 * 60 * 1000);

    if (!authLimit.allowed) {
      logSecurityEvent("rate_limit_block", {
        route: "auth",
        action: String(action || "unknown"),
        ip,
        retry_after_sec: authLimit.retryAfterSec,
      });
      return jsonError(
        res,
        "RATE_LIMITED",
        `Too many attempts. Retry in ${authLimit.retryAfterSec}s`,
        429,
      );
    }

    await connectDB();

    if (!normalizedUsername || !normalizedPassword) {
      return jsonError(res, "MISSING_CREDENTIALS", "Missing credentials", 400);
    }

    if (action === "register") {
      if (
        normalizedUsername.length < MIN_USERNAME ||
        normalizedUsername.length > MAX_USERNAME
      ) {
        return jsonError(
          res,
          "INVALID_USERNAME",
          `Username must be between ${MIN_USERNAME} and ${MAX_USERNAME} characters`,
          400,
        );
      }

      if (normalizedPassword.length < MIN_PASSWORD) {
        return jsonError(
          res,
          "WEAK_PASSWORD",
          `Password must be at least ${MIN_PASSWORD} characters`,
          400,
        );
      }

      if (normalizedPassword.length > MAX_PASSWORD) {
        return jsonError(
          res,
          "WEAK_PASSWORD",
          `Password must be at most ${MAX_PASSWORD} characters`,
          400,
        );
      }

      const existing = await User.findOne({ username: normalizedUsername });
      if (existing) {
        return jsonError(res, "USERNAME_TAKEN", "Username taken", 409);
      }

      const password_hash = await bcrypt.hash(normalizedPassword, 10);
      const user = await User.create({
        username: normalizedUsername,
        password_hash,
      });

      let jwtSecret: string;
      try {
        jwtSecret = getRequiredEnv("JWT_SECRET");
      } catch {
        logInternalError("auth_handler_error", new Error("JWT_SECRET is missing"), {
          route: "auth",
        });
        return jsonError(
          res,
          "AUTH_INTERNAL_ERROR",
          "Server misconfiguration. Missing secret.",
          500,
        );
      }

      const token = jwt.sign({ userId: user._id }, jwtSecret, {
        expiresIn: "30d",
      });

      return jsonOk(res, { token, username: normalizedUsername });
    }

    if (action === "login") {
      const user = await User.findOne({ username: normalizedUsername });
      if (!user) {
        return jsonError(res, "INVALID_CREDENTIALS", "Invalid credentials", 401);
      }

      const isMatch = await bcrypt.compare(
        normalizedPassword,
        user.password_hash,
      );
      if (!isMatch) {
        return jsonError(res, "INVALID_CREDENTIALS", "Invalid credentials", 401);
      }

      let jwtSecret: string;
      try {
        jwtSecret = getRequiredEnv("JWT_SECRET");
      } catch {
        logInternalError("auth_handler_error", new Error("JWT_SECRET is missing"), {
          route: "auth",
        });
        return jsonError(
          res,
          "AUTH_INTERNAL_ERROR",
          "Server misconfiguration. Missing secret.",
          500,
        );
      }

      const token = jwt.sign({ userId: user._id }, jwtSecret, {
        expiresIn: "30d",
      });

      return jsonOk(res, { token, username: normalizedUsername });
    }

    return jsonError(res, "INVALID_ACTION", "Invalid action", 400);
  } catch (err) {
    logInternalError("auth_handler_error", err, { route: "auth" });
    return jsonError(res, "AUTH_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
