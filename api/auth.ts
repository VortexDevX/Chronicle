import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User } from "./utils/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { checkRateLimit, getClientIp } from "./utils/rateLimit";
import { logInternalError, logSecurityEvent } from "./utils/log";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" });
  }

  try {
    const { action, username, password } = req.body || {};
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");
    const ip = getClientIp(req);

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
      return res.status(429).json({
        code: "RATE_LIMITED",
        message: `Too many attempts. Retry in ${authLimit.retryAfterSec}s`
      });
    }

    await connectDB();

    if (!normalizedUsername || !normalizedPassword) {
      return res.status(400).json({ code: "MISSING_CREDENTIALS", message: "Missing credentials" });
    }

    if (action === "register") {
      if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
        return res.status(400).json({
          code: "INVALID_USERNAME",
          message: "Username must be between 3 and 30 characters"
        });
      }

      if (normalizedPassword.length < 6) {
        return res.status(400).json({
          code: "WEAK_PASSWORD",
          message: "Password must be at least 6 characters"
        });
      }

      const existing = await User.findOne({ username: normalizedUsername });
      if (existing) {
        return res.status(409).json({ code: "USERNAME_TAKEN", message: "Username taken" });
      }

      const password_hash = await bcrypt.hash(normalizedPassword, 10);
      const user = await User.create({
        username: normalizedUsername,
        password_hash,
      });
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        logInternalError("auth_handler_error", new Error("JWT_SECRET is missing"), { route: "auth" });
        return res.status(500).json({ code: "AUTH_INTERNAL_ERROR", message: "Server misconfiguration. Missing secret." });
      }

      const token = jwt.sign({ userId: user._id }, jwtSecret, {
        expiresIn: "30d",
      });

      return res.status(200).json({ token, username: normalizedUsername });
    }

    if (action === "login") {
      const user = await User.findOne({ username: normalizedUsername });
      if (!user) {
        return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(normalizedPassword, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        logInternalError("auth_handler_error", new Error("JWT_SECRET is missing"), { route: "auth" });
        return res.status(500).json({ code: "AUTH_INTERNAL_ERROR", message: "Server misconfiguration. Missing secret." });
      }

      const token = jwt.sign({ userId: user._id }, jwtSecret, {
        expiresIn: "30d",
      });
      
      return res.status(200).json({ token, username: normalizedUsername });
    }

    return res.status(400).json({ code: "INVALID_ACTION", message: "Invalid action" });
  } catch (err) {
    logInternalError("auth_handler_error", err, { route: "auth" });
    return res.status(500).json({ code: "AUTH_INTERNAL_ERROR", message: "Internal Server Error" });
  }
}
