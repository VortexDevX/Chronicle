import { NextRequest, NextResponse } from "next/server";
import { logInternalError } from "@/lib/log";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  const safeUrl = url ? normalizePublicHttpUrl(url) : null;

  if (!safeUrl) {
    return new NextResponse("Missing url", { status: 400 });
  }

  try {
    const res = await fetch(safeUrl, {
      cache: "no-store",
      headers: {
        "User-Agent": "Chronicle/1.0",
        "Referer": "https://mangadex.org",
      },
    });

    if (!res.ok) {
      return new NextResponse("Failed to fetch image", { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    logInternalError("image_proxy_error", err, { route: "image-proxy" });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
