import { createSign } from "node:crypto";
import { fetchWithTimeout } from "@/lib/externalFetch";
import { logInfo, logInternalError } from "@/lib/log";

const GOOGLE_OAUTH_URL = "https://oauth2.googleapis.com/token";
const FIREBASE_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const PUSH_TIMEOUT_MS = 5_000;

type FirebaseConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

export type AndroidPushPayload = {
  title: string;
  body: string;
  path: string;
};

export type AndroidPushResult = {
  configured: boolean;
  sent: number;
  failed: number;
  invalidTokens: string[];
  failureCodes?: string[];
};

type CachedAccessToken = { value: string; expiresAt: number };
let cachedAccessToken: CachedAccessToken | null = null;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\+$/g, "")
    .trim();
}

function getFirebaseConfig(): FirebaseConfig | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawPrivateKey) return null;

  const privateKey = normalizePrivateKey(rawPrivateKey);
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return null;
  return { projectId, clientEmail, privateKey };
}

export function isAndroidPushConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

async function getAccessToken(
  config: FirebaseConfig,
  signal?: AbortSignal,
): Promise<string> {
  const nowMs = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > nowMs + 60_000) {
    return cachedAccessToken.value;
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: FIREBASE_SCOPE,
      aud: GOOGLE_OAUTH_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(config.privateKey))}`;

  const response = await fetchWithTimeout(
    GOOGLE_OAUTH_URL,
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal,
    },
    PUSH_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Firebase OAuth failed with status ${response.status}`);
  }

  const json = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new Error("Firebase OAuth response did not include an access token");
  }

  const expiresIn =
    typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
      ? json.expires_in
      : 3600;
  cachedAccessToken = {
    value: json.access_token,
    expiresAt: nowMs + Math.max(60, expiresIn) * 1000,
  };
  return json.access_token;
}

function firebaseFailure(status: number, body: string): string {
  try {
    const error = (JSON.parse(body) as { error?: { status?: string; details?: { "@type"?: string; errorCode?: string }[] } }).error;
    const code = error?.details?.find((detail) => detail["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError")?.errorCode || error?.status;
    if (code && /^[A-Z_]{1,60}$/.test(code)) return code;
  } catch { /* Do not log raw Firebase responses or registration identifiers. */ }
  return status === 429 ? "QUOTA_EXCEEDED" : status === 401 || status === 403 ? "PERMISSION_DENIED" : status >= 500 ? "UNAVAILABLE" : "SEND_FAILED";
}

function requestFailure(error: unknown): string {
  return error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "TIMEOUT" : "NETWORK_ERROR";
}

export async function sendAndroidPush(
  tokens: string[],
  payload: AndroidPushPayload,
  signal?: AbortSignal,
): Promise<AndroidPushResult> {
  const config = getFirebaseConfig();
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean))).slice(0, 20);
  if (!config || uniqueTokens.length === 0) {
    if (!config) {
      logInfo("android_push_skipped", { reason: "missing_firebase_config" });
    }
    return { configured: Boolean(config), sent: 0, failed: 0, invalidTokens: [] };
  }

  try {
    const accessToken = await getAccessToken(config, signal);
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`;
    const results = await Promise.all(
      uniqueTokens.map(async (token) => {
        try {
          const response = await fetchWithTimeout(
            url,
            {
              method: "POST",
              cache: "no-store",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: {
                  token,
                  notification: {
                    title: payload.title.slice(0, 100),
                    body: payload.body.slice(0, 500),
                  },
                  data: { path: payload.path },
                  android: {
                    priority: "high",
                    notification: {
                      channel_id: "chronicle_updates",
                      icon: "ic_notification",
                      color: "#3159E8",
                    },
                  },
                },
              }),
              signal,
            },
            PUSH_TIMEOUT_MS,
          );
          if (response.ok) return { sent: true, invalid: false, code: undefined };

          const body = await response.text().catch(() => "");
          const code = firebaseFailure(response.status, body);
          if (response.status === 401) cachedAccessToken = null;
          logInfo("android_push_rejected", { status: response.status, reason: code });
          return {
            sent: false,
            invalid: code === "UNREGISTERED",
            code,
          };
        } catch (err) {
          if (!signal?.aborted) {
            logInternalError("android_push_request_failed", err);
          }
          return { sent: false, invalid: false, code: requestFailure(err) };
        }
      }),
    );

    const invalidTokens = results.flatMap((result, index) =>
      result.invalid ? [uniqueTokens[index]] : [],
    );
    return {
      configured: true,
      sent: results.filter((result) => result.sent).length,
      failed: results.filter((result) => !result.sent).length,
      invalidTokens,
      ...(results.some((result) => result.code) ? { failureCodes: [...new Set(results.flatMap((result) => result.code ? [result.code] : []))] } : {}),
    };
  } catch (err) {
    if (!signal?.aborted) {
      logInternalError("android_push_auth_failed", err);
    }
    return {
      configured: true,
      sent: 0,
      failed: uniqueTokens.length,
      invalidTokens: [],
      failureCodes: [err instanceof Error && ["TimeoutError", "AbortError", "TypeError"].includes(err.name) ? requestFailure(err) : "AUTHENTICATION_FAILED"],
    };
  }
}
