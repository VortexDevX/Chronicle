import jwt from "jsonwebtoken";

type JwtClaims = {
  userId?: unknown;
};

export const verifyToken = (authHeader?: string): string | null => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
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
