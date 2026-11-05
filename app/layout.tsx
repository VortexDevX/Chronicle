import "./globals.css";
import "./marketing.css";
import "./catalogue.css";
import "./reading-room.css";
import "./studio.css";
import { Fira_Code, Manrope, Sora, Literata, Lora, Inter, Roboto, Josefin_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { absoluteUrl, siteConfig } from "@/lib/site";

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();
const bingVerification = process.env.BING_SITE_VERIFICATION?.trim();

const interfaceFont = Manrope({ subsets: ["latin"], variable: "--font-interface", display: "swap" });
const headingFont = Sora({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const indexFont = Fira_Code({ subsets: ["latin"], variable: "--font-index-face", display: "swap" });
const literata = Literata({subsets:["latin"],variable:"--font-literata",display:"swap",preload:false});
const lora = Lora({subsets:["latin"],variable:"--font-lora",display:"swap",preload:false});
const inter = Inter({subsets:["latin"],variable:"--font-inter",display:"swap",preload:false});
const roboto = Roboto({subsets:["latin"],variable:"--font-roboto",display:"swap",preload:false});
const josefin = Josefin_Sans({subsets:["latin"],variable:"--font-josefin",display:"swap",preload:false});

export const viewport: Viewport = { themeColor: "#0b0d12", colorScheme: "dark" };

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
      shortcut: "/favicon.ico",
      apple: "/apple-touch-icon.png",
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
      className={`${interfaceFont.variable} ${headingFont.variable} ${indexFont.variable} ${literata.variable} ${lora.variable} ${inter.variable} ${roboto.variable} ${josefin.variable}`}
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
