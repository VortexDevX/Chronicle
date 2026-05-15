import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { getRequiredEnv } from "@/lib/config";

export type JwtClaims = {
  userId?: unknown;
  authVersion?: unknown;
};

export type AuthTokenClaims = {
  userId: string;
  authVersion: number;
};

export const signAuthToken = (userId: string, authVersion = 0): string => {
  return jwt.sign({ userId, authVersion }, getRequiredEnv("JWT_SECRET"), {
    expiresIn: "30d",
  });
};

export const verifyToken = (token?: string): AuthTokenClaims | null => {
  if (!token) return null;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
    }) as JwtClaims;

    if (typeof decoded.userId !== "string" || decoded.userId.length === 0) {
      return null;
    }

    return {
      userId: decoded.userId,
      authVersion:
        typeof decoded.authVersion === "number" && decoded.authVersion >= 0
          ? decoded.authVersion
          : 0,
    };
  } catch {
    return null;
  }
};

export const getUser = (req: NextRequest): string | null => {
  const token = req.cookies.get("auth_token")?.value;
  return verifyToken(token)?.userId || null;
};

export const getAuthTokenClaims = (req: NextRequest): AuthTokenClaims | null => {
  const token = req.cookies.get("auth_token")?.value;
  return verifyToken(token);
};
