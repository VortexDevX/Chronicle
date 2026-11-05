import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | undefined;
export function r2Connection() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_JURISDICTION } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) throw new Error("R2 configuration is incomplete");
  if (!/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID) || (R2_JURISDICTION && !["eu", "fedramp"].includes(R2_JURISDICTION))) throw new Error("Invalid R2 endpoint configuration");
  client ||= new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}${R2_JURISDICTION ? `.${R2_JURISDICTION}` : ""}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 3 });
  return { client, bucket: R2_BUCKET_NAME };
}
export async function headObject(key: string) {
  const { client, bucket } = r2Connection();
  try { return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); }
  catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null; throw error; }
}
export async function getObject(key: string) {
  const { client, bucket } = r2Connection();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error("Object body missing");
  return Buffer.from(await object.Body.transformToByteArray());
}
export async function putObject(key: string, body: Uint8Array, contentType: string, sha256: string) {
  const { client, bucket } = r2Connection();
  return client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, Metadata: { sha256 }, IfNoneMatch: "*" }));
}
export async function deleteObject(key: string) {
  const { client, bucket } = r2Connection();
  return client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
export async function createUploadUrl(key: string, contentType: string) {
  const { client, bucket } = r2Connection();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, IfNoneMatch: "*" }),
    { expiresIn: 600, signableHeaders: new Set(["content-type", "if-none-match"]) });
}
