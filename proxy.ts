import { NextRequest, NextResponse } from "next/server";
import { getAllowedCorsOrigin } from "@/lib/origin";

const CORS_METHODS = "GET,OPTIONS,PATCH,DELETE,POST,PUT";
const CORS_HEADERS =
  "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization";

function applyCors(req: NextRequest, res: NextResponse): NextResponse {
  const allowedOrigin = getAllowedCorsOrigin(req.headers.get("origin"));

  if (allowedOrigin) {
    res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }

  res.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  res.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
  return res;
}

export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (req.method === "OPTIONS") {
    return applyCors(req, new NextResponse(null, { status: 204 }));
  }

  return applyCors(req, NextResponse.next());
}

export const config = {
  matcher: "/api/:path*",
};
