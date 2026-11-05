import { test as base, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
loadEnvConfig(process.cwd());
export const test = base.extend<object, { sessionToken: string }>({
  sessionToken: [async ({}, provide) => {
    if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) throw new Error("Browser tests require a test database and JWT_SECRET");
    const conn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
    const id = new mongoose.Types.ObjectId();
    try {
      await conn.collection("users").insertOne({ _id: id, username: `e2e_${randomUUID().slice(0,16)}`, password_hash: await bcrypt.hash(randomUUID(), 10), auth_version: 0, is_admin: false, created_at: new Date() });
      await provide(jwt.sign({ userId: String(id), authVersion: 0 }, process.env.JWT_SECRET, { algorithm:"HS256", expiresIn:"1h" }));
    } finally {
      for (const collection of ["mediaitems","novelbookmarks","readerpreferences"]) await conn.collection(collection).deleteMany({ user_id: id });
      await conn.collection("users").deleteOne({ _id: id });
      await conn.close();
    }
  }, { scope:"worker" }],
  context: async ({ context, sessionToken, baseURL }, provide) => {
    await context.addCookies([{ name:"auth_token", value:sessionToken, url:baseURL!, httpOnly:true, sameSite:"Lax" }]);
    await provide(context);
  },
});
export { expect };
