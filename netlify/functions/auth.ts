import { Handler } from "@netlify/functions";
import { connectDB, User } from "./utils/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { checkRateLimit, getClientIp } from "./utils/rateLimit";
import { logInternalError, logSecurityEvent } from "./utils/log";

function error(statusCode: number, code: string, message: string) {
  return { statusCode, body: JSON.stringify({ code, message }) };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return error(405, "METHOD_NOT_ALLOWED", "Method Not Allowed");
  }

  try {
    const { action, username, password } = JSON.parse(event.body || "{}");
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");
    const ip = getClientIp(event.headers);

    const authLimit =
      action === "register"
        ? checkRateLimit(`auth:register:${ip}`, 8, 15 * 60 * 1000)
        : checkRateLimit(`auth:login:${ip}`, 18, 10 * 60 * 1000);
    if (!authLimit.allowed) {
      logSecurityEvent("rate_limit_block", {
        route: "auth",
        action: String(action || "unknown"),
        ip,
        retry_after_sec: authLimit.retryAfterSec,
      });
      return error(
        429,
        "RATE_LIMITED",
        `Too many attempts. Retry in ${authLimit.retryAfterSec}s`
      );
    }

    await connectDB();

    if (!normalizedUsername || !normalizedPassword) {
      return error(400, "MISSING_CREDENTIALS", "Missing credentials");
    }

    if (action === "register") {
      if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
        return error(
          400,
          "INVALID_USERNAME",
          "Username must be between 3 and 30 characters"
        );
      }

      if (normalizedPassword.length < 6) {
        return error(
          400,
          "WEAK_PASSWORD",
          "Password must be at least 6 characters"
        );
      }

      const existing = await User.findOne({ username: normalizedUsername });
      if (existing) return error(409, "USERNAME_TAKEN", "Username taken");

      const password_hash = await bcrypt.hash(normalizedPassword, 10);
      const user = await User.create({
        username: normalizedUsername,
        password_hash,
      });
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, {
        expiresIn: "30d",
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ token, username: normalizedUsername }),
      };
    }

    if (action === "login") {
      const user = await User.findOne({ username: normalizedUsername });
      if (!user) return error(401, "INVALID_CREDENTIALS", "Invalid credentials");

      const isMatch = await bcrypt.compare(normalizedPassword, user.password_hash);
      if (!isMatch)
        return error(401, "INVALID_CREDENTIALS", "Invalid credentials");

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, {
        expiresIn: "30d",
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ token, username: normalizedUsername }),
      };
    }

    return error(400, "INVALID_ACTION", "Invalid action");
  } catch (err) {
    logInternalError("auth_handler_error", err, { route: "auth" });
    return error(500, "AUTH_INTERNAL_ERROR", "Internal Server Error");
  }
};
