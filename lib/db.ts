import mongoose from "mongoose";

const DB_CONNECT_TIMEOUT_MS = 8_000;

declare global {
  var mongoose: { conn: any; promise: any };
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not defined in the environment variables. Please configure it in your Vercel Dashboard.",
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        connectTimeoutMS: DB_CONNECT_TIMEOUT_MS,
        serverSelectionTimeoutMS: DB_CONNECT_TIMEOUT_MS,
      })
      .then((mongoose) => {
        return mongoose;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
};
