import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Outfit, DM_Sans, JetBrains_Mono } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

const supportedOrigins = [
  "https://chroniclex.vercel.app",
  "https://chronicle.mvlab.cloud",
] as const;
const defaultOrigin = supportedOrigins[0];
const siteName = "Chronicle X";
const siteTitle = "Chronicle X | Media Tracker";
const siteDescription =
  "Track anime, manhwa, donghua, and light novels with shelves, progress, covers, scraper alerts, and clean stats.";

function normalizeOrigin(origin: string | undefined | null) {
  if (!origin) return null;

  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

async function getMetadataOrigin() {
  const headerStore = await headers();
  const forwardedHost = headerStore
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || headerStore.get("host");
  const protocol =
    headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const requestOrigin = normalizeOrigin(host ? `${protocol}://${host}` : null);

  if (
    requestOrigin &&
    supportedOrigins.includes(requestOrigin as (typeof supportedOrigins)[number])
  ) {
    return requestOrigin;
  }

  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (
    configuredOrigin &&
    supportedOrigins.includes(
      configuredOrigin as (typeof supportedOrigins)[number],
    )
  ) {
    return configuredOrigin;
  }

  return defaultOrigin;
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = await getMetadataOrigin();
  const ogImage = `${origin}/api/og`;

  return {
    metadataBase: new URL(origin),
    applicationName: siteName,
    title: {
      default: siteTitle,
      template: `%s | ${siteName}`,
    },
    description: siteDescription,
    authors: [{ name: "VortexDevX", url: "https://github.com/VortexDevX" }],
    creator: "VortexDevX",
    publisher: siteName,
    category: "media tracking",
    keywords: [
      "Chronicle",
      "Chronicle X",
      "media tracker",
      "anime tracker",
      "manhwa tracker",
      "donghua tracker",
      "light novel tracker",
      "chapter tracker",
      "episode tracker",
    ],
    alternates: {
      canonical: origin,
    },
    icons: {
      icon: "/icon.png",
      shortcut: "/favicon.png",
      apple: "/icon.png",
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName,
      title: siteTitle,
      description: siteDescription,
      url: origin,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "Chronicle X media tracker dashboard preview",
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description: siteDescription,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
