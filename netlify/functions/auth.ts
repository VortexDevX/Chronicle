import { Handler } from "@netlify/functions";
import { connectDB, User } from "./utils/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: "Method Not Allowed" };

  try {
    await connectDB();
    const { action, username, password } = JSON.parse(event.body || "{}");
    if (!username || !password)
      return { statusCode: 400, body: "Missing credentials" };

    if (action === "register") {
      const existing = await User.findOne({ username });
      if (existing) return { statusCode: 409, body: "Username taken" };

      const password_hash = await bcrypt.hash(password, 10);
      const user = await User.create({ username, password_hash });
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, {
        expiresIn: "30d",
      });

      return { statusCode: 200, body: JSON.stringify({ token, username }) };
    }

    if (action === "login") {
      const user = await User.findOne({ username });
      if (!user) return { statusCode: 401, body: "Invalid credentials" };

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) return { statusCode: 401, body: "Invalid credentials" };

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, {
        expiresIn: "30d",
      });
      return { statusCode: 200, body: JSON.stringify({ token, username }) };
    }

    return { statusCode: 400, body: "Invalid action" };
  } catch (error: any) {
    return { statusCode: 500, body: error.message };
  }
};
