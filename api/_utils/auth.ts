import jwt from "jsonwebtoken";

export const verifyToken = (authHeader?: string): string | null => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret) as {
      userId: string;
    };
    return decoded.userId;
  } catch {
    return null;
  }
};
