import { NextRequest, NextResponse } from "next/server";
import { logInternalError } from "@/lib/log";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import { fetchWithTimeout } from "@/lib/externalFetch";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  const safeUrl = url ? normalizePublicHttpUrl(url) : null;

  if (!safeUrl) {
    return new NextResponse("Missing url", { status: 400 });
  }

  try {
    const res = await fetchWithTimeout(safeUrl, {
      cache: "no-store",
      headers: {
        "User-Agent": "Chronicle/1.0",
        "Referer": "https://mangadex.org",
      },
    });

    if (!res.ok) {
      return new NextResponse("Failed to fetch image", { status: res.status });
    }

    const contentType = (res.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return new NextResponse("Unsupported image type", { status: 415 });
    }
    const advertisedLength = Number(res.headers.get("content-length") || 0);
    if (advertisedLength > MAX_IMAGE_BYTES) {
      return new NextResponse("Image too large", { status: 413 });
    }
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return new NextResponse("Image too large", { status: 413 });
    }

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    logInternalError("image_proxy_error", err, { route: "image-proxy" });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
