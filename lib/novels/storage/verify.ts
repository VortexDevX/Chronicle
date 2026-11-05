import { createHash } from "node:crypto";
import { getObject, headObject } from "./r2";

export const hash = (body: Uint8Array) => createHash("sha256").update(body).digest("hex");
export function imageType(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
export async function verifyObject(key: string, bytes: number, sha256: string, type: string) {
  const object = await headObject(key);
  if (!object || object.ContentLength !== bytes || object.ContentType !== type) throw new Error("Uploaded object size or type mismatch");
  const body = await getObject(key);
  if (body.length !== bytes || hash(body) !== sha256) throw new Error("Uploaded object checksum mismatch");
  if (type.startsWith("image/") && imageType(body) !== type) throw new Error("Invalid image content");
  return body;
}
