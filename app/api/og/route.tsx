import { ImageResponse } from "next/og";

export const runtime = "edge";

const size = {
  width: 1200,
  height: 630,
};

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, #120f14 0%, #221119 42%, #4d151c 100%)",
          color: "#fff7f4",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(circle at 16% 18%, rgba(255, 88, 74, 0.42), transparent 28%), radial-gradient(circle at 85% 22%, rgba(255, 189, 89, 0.25), transparent 26%), radial-gradient(circle at 70% 78%, rgba(255, 75, 101, 0.3), transparent 32%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -80,
            top: 64,
            width: 680,
            height: 680,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.08)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -220,
            bottom: -280,
            width: 720,
            height: 720,
            borderRadius: "50%",
            background: "rgba(255, 115, 76, 0.18)",
          }}
        />

        <div
          style={{
            width: "58%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingLeft: 82,
            paddingRight: 28,
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #ff544a, #ffb64c)",
                color: "#1a0d0d",
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              C
            </div>
            <div
              style={{
                display: "flex",
                color: "#ffd7ca",
                fontSize: 27,
                fontWeight: 800,
                letterSpacing: 0,
              }}
            >
              Chronicle X
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 78,
              lineHeight: 0.95,
              fontWeight: 900,
              letterSpacing: 0,
              maxWidth: 620,
            }}
          >
            Track every comeback.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 26,
              maxWidth: 610,
              color: "#ffe1d7",
              fontSize: 31,
              lineHeight: 1.28,
              fontWeight: 600,
            }}
          >
            Anime, manhwa, donghua, and novels with progress, shelves, covers,
            and scraper alerts.
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 38,
              flexWrap: "wrap",
            }}
          >
            {["Anime", "Manhwa", "Donghua", "Light Novels"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "12px 17px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#fff7f4",
                  fontSize: 21,
                  fontWeight: 800,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            width: "42%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
            paddingRight: 70,
          }}
        >
          <div
            style={{
              width: 410,
              display: "flex",
              flexDirection: "column",
              gap: 18,
              transform: "rotate(-3deg)",
            }}
          >
            {[
              ["Infinite Wizard", "168 / 168", "#ff5b4f"],
              ["Return of the Mad Demon", "192 / 192", "#ffb84f"],
              ["Swallowed Star", "222 / 223", "#f06686"],
            ].map(([title, progress, color]) => (
              <div
                key={title}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "25px 28px",
                  borderRadius: 22,
                  background: "rgba(28, 17, 20, 0.82)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  boxShadow: "0 26px 70px rgba(0, 0, 0, 0.35)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 25,
                      fontWeight: 850,
                      color: "#fffaf7",
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      color: "#ffd6c9",
                      fontSize: 20,
                      fontWeight: 800,
                    }}
                  >
                    {progress}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 17,
                    height: 12,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: progress === "222 / 223" ? "92%" : "100%",
                      height: "100%",
                      borderRadius: 999,
                      background: color,
                    }}
                  />
                </div>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "18px 24px",
                borderRadius: 20,
                background: "linear-gradient(135deg, #ff544a, #ffb64c)",
                color: "#1d0c0c",
                fontSize: 24,
                fontWeight: 900,
                boxShadow: "0 24px 64px rgba(255, 80, 70, 0.34)",
              }}
            >
              Updates found before you forget.
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
