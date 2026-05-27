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

export function getOptionalEnvList(key: string): string[] {
  return getOptionalEnv(key)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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
    appOrigins: getOptionalEnvList("APP_ORIGIN"),
    cronSecret: getOptionalEnv("CRON_SECRET"),
    brevoApiKey: getOptionalEnv("BREVO_API_KEY"),
    brevoFromEmail: getOptionalEnv("BREVO_FROM_EMAIL"),
    brevoFromName: getOptionalEnv("BREVO_FROM_NAME", "Chronicle"),
    telegramBotToken: getOptionalEnv("TELEGRAM_BOT_TOKEN"),
    telegramChatId: getOptionalEnv("TELEGRAM_CHAT_ID"),
  };
}
