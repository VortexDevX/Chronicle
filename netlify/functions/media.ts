import { Handler } from "@netlify/functions";
import { connectDB, MediaItem } from "./utils/db";
import { verifyToken } from "./utils/auth";

export const handler: Handler = async (event) => {
  try {
    await connectDB();
    const userId = verifyToken(event.headers.authorization);
    if (!userId) return { statusCode: 401, body: "Unauthorized" };

    const id = event.queryStringParameters?.id;

    switch (event.httpMethod) {
      case "GET": {
        const media = await MediaItem.find({ user_id: userId }).sort({
          last_updated: -1,
        });
        return { statusCode: 200, body: JSON.stringify(media) };
      }
      case "POST": {
        const data = JSON.parse(event.body || "{}");
        const newItem = await MediaItem.create({
          ...data,
          user_id: userId,
          last_updated: new Date(),
        });
        return { statusCode: 201, body: JSON.stringify(newItem) };
      }
      case "PUT": {
        if (!id) return { statusCode: 400, body: "Missing ID" };
        const data = JSON.parse(event.body || "{}");
        const updated = await MediaItem.findOneAndUpdate(
          { _id: id, user_id: userId },
          data,
          { new: true },
        );
        if (!updated) return { statusCode: 404, body: "Not found" };
        return { statusCode: 200, body: JSON.stringify(updated) };
      }
      case "DELETE": {
        if (!id) return { statusCode: 400, body: "Missing ID" };
        const deleted = await MediaItem.findOneAndDelete({
          _id: id,
          user_id: userId,
        });
        if (!deleted) return { statusCode: 404, body: "Not found" };
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }
      default:
        return { statusCode: 405, body: "Method Not Allowed" };
    }
  } catch (error: any) {
    return { statusCode: 500, body: error.message };
  }
};
