import type { VercelRequest, VercelResponse } from "@vercel/node";
import checkChaptersHandler from "../api/cron/checkChapters.js";

type HeaderValue = string | string[] | number | undefined;

class MockResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  body: unknown = null;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: HeaderValue): this {
    if (Array.isArray(value)) {
      this.headers[name.toLowerCase()] = value.join(", ");
    } else if (value !== undefined) {
      this.headers[name.toLowerCase()] = String(value);
    }
    return this;
  }

  json(payload: unknown): this {
    this.body = payload;
    return this;
  }

  send(payload: unknown): this {
    this.body = payload;
    return this;
  }

  end(payload?: unknown): this {
    if (payload !== undefined) {
      this.body = payload;
    }
    return this;
  }
}

function buildMockRequest(): VercelRequest {
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) {
    headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  }

  return {
    method: "GET",
    headers,
    query: {},
    body: undefined,
  } as unknown as VercelRequest;
}

async function main() {
  const req = buildMockRequest();
  const res = new MockResponse() as unknown as VercelResponse;

  console.log("Running local cron check...");
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        hasMongoUri: Boolean(process.env.MONGODB_URI),
        hasCronSecret: Boolean(process.env.CRON_SECRET),
        hasTelegramBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        hasTelegramChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
      },
      null,
      2,
    ),
  );

  await checkChaptersHandler(req, res);

  const out = res as unknown as MockResponse;
  console.log(`Status: ${out.statusCode}`);
  console.log("Headers:", out.headers);
  console.log(
    "Body:",
    typeof out.body === "string" ? out.body : JSON.stringify(out.body, null, 2),
  );

  if (out.statusCode >= 400) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Local cron runner failed:", error);
  process.exit(1);
});
