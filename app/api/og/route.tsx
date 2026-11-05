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
    <div style={{ width: "100%", height: "100%", display: "flex", padding: "54px 64px", flexDirection: "column", background: "#0b0d12", color: "#edf1fa", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #242b3a", paddingBottom: 26 }}>
        <span style={{ fontSize: 26, fontWeight: 700 }}>CHRONICLE X</span>
        <span style={{ fontSize: 16, color: "#94b3ff", letterSpacing: 2 }}>YOUR STORY SPACE</span>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 54 }}>
        <div style={{ width: "64%", display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.08 }}>{heading}</span>
          <span style={{ fontSize: 24, color: "#a4afc3", marginTop: 26, lineHeight: 1.45 }}>Anime, manhwa, donghua, and light novels. Your progress, shelves, notes, and updates.</span>
        </div>
        <div style={{ display: "flex", width: "36%", alignItems: "center", justifyContent: "center", height: "85%", paddingLeft: 32 }}>
          {/* ImageResponse renders native image elements, not next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={300} height={300} alt="" />
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid #242b3a", paddingTop: 24, justifyContent: "space-between", fontSize: 18 }}>
        <span style={{ color: "#94b3ff" }}>Watch. Read. Keep your place.</span>
        <span style={{ color: "#77849e" }}>chroniclex.vercel.app</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
