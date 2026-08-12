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

function isUnregisteredDevice(status: number, body: string): boolean {
  return status === 404 || body.includes("UNREGISTERED");
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
                      color: "#F43F5E",
                    },
                  },
                },
              }),
              signal,
            },
            PUSH_TIMEOUT_MS,
          );
          if (response.ok) return { sent: true, invalid: false };

          const body = await response.text().catch(() => "");
          return {
            sent: false,
            invalid: isUnregisteredDevice(response.status, body),
          };
        } catch (err) {
          if (!signal?.aborted) {
            logInternalError("android_push_request_failed", err);
          }
          return { sent: false, invalid: false };
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
    };
  }
}
