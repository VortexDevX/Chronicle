import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

const focusLabels: Record<string, string> = {
  Anime: "Anime watchlists",
  Manhwa: "Manhwa reading lists",
  Donghua: "Donghua watchlists",
  "Light novels": "Light novel reading lists",
};

export async function GET(request: Request) {
  const focus = new URL(request.url).searchParams.get("focus") || "";
  const heading = focusLabels[focus] || "Every story. Your place in it.";
  const logo = await readFile(join(process.cwd(), "public/brand/chronicle-mark.png"));
  const mark = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", padding: "54px 64px", flexDirection: "column", background: "#0d141a", color: "#e4ecef", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #52616f", paddingBottom: 26 }}>
        <span style={{ fontSize: 26, fontWeight: 700 }}>CHRONICLE X</span>
        <span style={{ fontSize: 16, color: "#9bb7ff", letterSpacing: 2 }}>A PERSONAL STORY INDEX</span>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 54 }}>
        <div style={{ width: "64%", display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.04, textTransform: "uppercase" }}>{heading}</span>
          <span style={{ fontSize: 24, color: "#abbac5", marginTop: 26, lineHeight: 1.45 }}>Anime, manhwa, donghua, and light novels. Your progress, shelves, notes, and updates.</span>
        </div>
        <div style={{ display: "flex", width: "36%", alignItems: "center", justifyContent: "center", borderLeft: "1px solid #303c46", height: "85%", paddingLeft: 32 }}>
          {/* ImageResponse renders native image elements, not next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={300} height={300} alt="" />
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid #52616f", paddingTop: 24, justifyContent: "space-between", fontSize: 18 }}>
        <span style={{ color: "#9bb7ff" }}>WATCH / READ / KEEP YOUR PLACE</span>
        <span style={{ color: "#8e9fab" }}>chroniclex.vercel.app</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
