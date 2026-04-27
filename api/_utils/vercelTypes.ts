import type { IncomingHttpHeaders } from "node:http";

export type VercelRequest = {
  method?: string;
  headers: IncomingHttpHeaders;
  query: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};

export type VercelResponse = {
  setHeader(name: string, value: string | number | readonly string[]): void;
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
  end(body?: unknown): void;
};
