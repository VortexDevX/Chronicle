import { NextResponse } from "next/server";

export function jsonOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(
  code: string,
  message: string,
  status = 400,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      error: { code, message },
    },
    { status },
  );
}
