/**
 * Environment configuration helpers.
 *
 * Authoritative env set:
 *   MONGODB_URI        — required
 *   JWT_SECRET         — required
 *   APP_ORIGIN         — optional (comma-separated allowlist, defaults to echo/*)
 *   CRON_SECRET        — optional (protects cron endpoint)
 *   TELEGRAM_BOT_TOKEN — optional (notifications)
 *   TELEGRAM_CHAT_ID   — optional (global notification fallback)
 *   UPSTASH_REDIS_REST_URL   — optional (distributed rate limiting)
 *   UPSTASH_REDIS_REST_TOKEN — optional (distributed rate limiting)
 */

export class ConfigError extends Error {
  constructor(key: string) {
    super(
      `Missing required environment variable: ${key}. ` +
        `Set it in your .env file or deployment dashboard.`,
    );
    this.name = "ConfigError";
  }
}

export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new ConfigError(key);
  return value;
}

export function getOptionalEnv(key: string, fallback = ""): string {
  return process.env[key] || fallback;
}

/**
 * Validates that all critical env vars are present.
 * Call this from route handlers that need DB/auth access.
 * Returns an object with the resolved values.
 */
export function validateCoreConfig() {
  return {
    mongoUri: getRequiredEnv("MONGODB_URI"),
    jwtSecret: getRequiredEnv("JWT_SECRET"),
    appOrigin: getOptionalEnv("APP_ORIGIN"),
    cronSecret: getOptionalEnv("CRON_SECRET"),
    telegramBotToken: getOptionalEnv("TELEGRAM_BOT_TOKEN"),
    telegramChatId: getOptionalEnv("TELEGRAM_CHAT_ID"),
  };
}
