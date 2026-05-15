import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import bcrypt from "bcryptjs";
import { getClientIp } from "@/lib/rateLimit";
import { enforceRateLimit, requireAuthUserId } from "@/lib/guards";
import { logInternalError } from "@/lib/log";
import { jsonOk, jsonError } from "@/lib/http";
import { getRequiredEnv } from "@/lib/config";
import { signAuthToken } from "@/lib/auth";

const MAX_USERNAME = 30;
const MIN_USERNAME = 3;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
const MAX_EMAIL = 254;
const BCRYPT_ROUNDS = 12;

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return value.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, username, password, email } = body;
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");
    const normalizedEmail = normalizeEmail(email);
    const ip = getClientIp(req);

    const isRegister = action === "register";
    const isLogout = action === "logout";

    if (!isLogout) {
      const guard = await enforceRateLimit(req, {
        key: isRegister ? `auth:register:${ip}` : `auth:login:${ip}`,
        limit: isRegister ? 40 : 100,
        windowMs: isRegister ? 15 * 60 * 1000 : 10 * 60 * 1000,
        strict: true,
        route: "auth",
        method: "POST",
        operation: String(action || "unknown"),
        message: "Too many attempts. Please retry shortly.",
      });
      if (!guard.allowed && guard.errorResponse) return guard.errorResponse;
    }

    await connectDB();

    if (action === "register" || action === "login") {
      if (!normalizedUsername || !normalizedPassword) {
        return jsonError("MISSING_CREDENTIALS", "Missing credentials", 400);
      }
    }

    if (action === "register") {
      if (
        normalizedUsername.length < MIN_USERNAME ||
        normalizedUsername.length > MAX_USERNAME
      ) {
        return jsonError(
          "INVALID_USERNAME",
          `Username must be between ${MIN_USERNAME} and ${MAX_USERNAME} characters`,
          400,
        );
      }

      if (normalizedPassword.length < MIN_PASSWORD) {
        return jsonError(
          "WEAK_PASSWORD",
          `Password must be at least ${MIN_PASSWORD} characters`,
          400,
        );
      }

      if (normalizedPassword.length > MAX_PASSWORD) {
        return jsonError(
          "WEAK_PASSWORD",
          `Password must be at most ${MAX_PASSWORD} characters`,
          400,
        );
      }

      if (!isValidEmail(normalizedEmail)) {
        return jsonError("INVALID_EMAIL", "Enter a valid email address", 400);
      }

      const existing = await User.findOne({ username: normalizedUsername });
      if (existing) {
        return jsonError("USERNAME_TAKEN", "Username taken", 409);
      }

      const existingEmail = await User.findOne({ email: normalizedEmail });
      if (existingEmail) {
        return jsonError("EMAIL_TAKEN", "Email already registered", 409);
      }

      const password_hash = await bcrypt.hash(normalizedPassword, BCRYPT_ROUNDS);
      const user = await User.create({
        username: normalizedUsername,
        email: normalizedEmail,
        email_verified_at: new Date(),
        password_hash,
      });

      try {
        getRequiredEnv("JWT_SECRET");
      } catch {
        logInternalError(
          "auth_handler_error",
          new Error("JWT_SECRET is missing"),
          {
            route: "auth",
          },
        );
        return jsonError(
          "AUTH_INTERNAL_ERROR",
          "Server misconfiguration. Missing secret.",
          500,
        );
      }

      const token = signAuthToken(String(user._id), user.auth_version || 0);

      const res = jsonOk({ username: normalizedUsername });
      res.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      });
      return res;
    }

    if (action === "login") {
      const user = await User.findOne({ username: normalizedUsername });
      if (!user) {
        return jsonError("INVALID_CREDENTIALS", "Invalid credentials", 401);
      }

      const isMatch = await bcrypt.compare(
        normalizedPassword,
        user.password_hash,
      );
      if (!isMatch) {
        return jsonError("INVALID_CREDENTIALS", "Invalid credentials", 401);
      }

      try {
        getRequiredEnv("JWT_SECRET");
      } catch {
        logInternalError(
          "auth_handler_error",
          new Error("JWT_SECRET is missing"),
          {
            route: "auth",
          },
        );
        return jsonError(
          "AUTH_INTERNAL_ERROR",
          "Server misconfiguration. Missing secret.",
          500,
        );
      }

      const token = signAuthToken(String(user._id), user.auth_version || 0);

      const res = jsonOk({ username: normalizedUsername });
      res.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      });
      return res;
    }

    if (action === "logout") {
      const res = jsonOk({ success: true });
      res.cookies.set("auth_token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
      });
      return res;
    }

    return jsonError("INVALID_ACTION", "Invalid action", 400);
  } catch (err) {
    logInternalError("auth_handler_error", err, { route: "auth" });
    return jsonError("AUTH_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) {
      return errorResponse;
    }

    await connectDB();
    const user = await User.findById(userId);
    if (!user) {
      return jsonError("UNAUTHORIZED", "User not found", 401);
    }

    return jsonOk({
      username: user.username,
      email: user.email || null,
      loggedIn: true,
      userId: user._id,
    });
  } catch (err) {
    logInternalError("auth_handler_error", err, { route: "auth_session" });
    return jsonError("AUTH_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
