import "./globals.css";
import "./marketing.css";
import type { Metadata } from "next";
import { Outfit, DM_Sans, JetBrains_Mono } from "next/font/google";
import { absoluteUrl, siteConfig } from "@/lib/site";

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

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();
const bingVerification = process.env.BING_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
    metadataBase: new URL(siteConfig.url),
    applicationName: siteConfig.name,
    title: {
      default: "Chronicle X – Anime, Manhwa, Donghua & Novel Tracker",
      template: `%s | ${siteConfig.name}`,
    },
    description: siteConfig.description,
    authors: [{ name: siteConfig.creator, url: siteConfig.creatorUrl }],
    creator: siteConfig.creator,
    publisher: siteConfig.name,
    category: "media tracking",
    icons: {
      icon: "/icon.png",
      shortcut: "/favicon.png",
      apple: "/icon.png",
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: siteConfig.name,
      title: "Chronicle X – One Tracker for Every Story",
      description: siteConfig.description,
      url: siteConfig.url,
      images: [
        {
          url: absoluteUrl("/api/og"),
          width: 1200,
          height: 630,
          alt: "Chronicle X media tracker dashboard preview",
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Chronicle X – One Tracker for Every Story",
      description: siteConfig.description,
      images: [absoluteUrl("/api/og")],
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
    verification:
      googleVerification || bingVerification
        ? {
            google: googleVerification,
            other: bingVerification
              ? { "msvalidate.01": bingVerification }
              : undefined,
          }
        : undefined,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: siteConfig.shortName,
    },
    other: {
      "mobile-web-app-capable": "yes",
    },
};

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
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js")})}`,
          }}
        />
      </body>
    </html>
  );
}
