import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

type JwtClaims = {
  userId?: unknown;
};

export const verifyToken = (token?: string): string | null => {
  if (!token) return null;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
    }) as JwtClaims;

    return typeof decoded.userId === "string" && decoded.userId.length > 0
      ? decoded.userId
      : null;
  } catch {
    return null;
  }
};

export const getUser = (req: NextRequest): string | null => {
  const token = req.cookies.get("auth_token")?.value;
  return verifyToken(token);
};
