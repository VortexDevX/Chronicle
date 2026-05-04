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
