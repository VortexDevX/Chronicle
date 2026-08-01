import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Check } from "lucide-react";
import { JsonLd } from "@/components/marketing/JsonLd";
import {
  LandingFinalAction,
  LandingHeroActions,
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/MarketingChrome";
import { verifyAuthToken } from "@/lib/auth";
import { siteConfig } from "@/lib/site";

const title = "Anime, Manhwa, Donghua & Light Novel Tracker | Chronicle X";
const description =
  "Store anime watchlists and manhwa, donghua, and light novel reading lists in one private tracker with episode and chapter progress, shelves, updates, and stats.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "/",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Chronicle X media tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/api/og"],
  },
};

const highlights = [
  {
    title: "Keep your place",
    description:
      "Log exact episodes and chapters, including decimal chapter numbers.",
  },
  {
    title: "Sort it your way",
    description:
      "Use clear statuses and custom shelves instead of maintaining another spreadsheet.",
  },
  {
    title: "Take your list with you",
    description:
      "Export and restore your library as JSON whenever you need a backup.",
  },
];

const mediaFormats = [
  { name: "Anime", summary: "Episodes, seasons, ratings, and notes." },
  { name: "Manhwa", summary: "Chapters, reading links, covers, and update checks." },
  { name: "Donghua", summary: "Chinese animation tracked as its own media type." },
  { name: "Light novels", summary: "Chapter progress, reading notes, and adaptations." },
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    alternateName: siteConfig.shortName,
    url: siteConfig.url,
    description,
    inLanguage: "en",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    alternateName: siteConfig.shortName,
    url: siteConfig.url,
    description,
    applicationCategory: "LifestyleApplication",
    applicationSubCategory: "Media tracking and personal watchlist",
    operatingSystem: "Any operating system with a modern web browser",
    browserRequirements: "Requires JavaScript and a modern web browser",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Person",
      name: siteConfig.creator,
      url: siteConfig.creatorUrl,
    },
    featureList: highlights.map((highlight) => highlight.title),
  },
];

export default async function LandingPage() {
  const cookieStore = await cookies();
  const isAuthenticated = Boolean(
    verifyAuthToken(cookieStore.get("auth_token")?.value),
  );

  return (
    <div className="marketing-site simple-home">
      <JsonLd data={structuredData} />
      <MarketingHeader isAuthenticated={isAuthenticated} />

      <main>
        <section className="simple-hero">
          <div className="marketing-container simple-hero-grid">
            <div className="simple-hero-copy">
              <span className="simple-kicker">Watch. Read. Remember.</span>
              <h1>One place for everything you watch and read.</h1>
              <p>
                Chronicle keeps anime, manhwa, donghua, and light novels in one
                private list—with progress, shelves, notes, and updates when you
                want them.
              </p>
              <LandingHeroActions isAuthenticated={isAuthenticated} />
              <small>No streaming. No chapter hosting. Just your list.</small>
            </div>

            <div className="simple-capability-panel" aria-label="Current Chronicle product capabilities">
              <header>
                <div>
                  <span>Current product</span>
                  <strong>What Chronicle handles</strong>
                </div>
                <small>Built in</small>
              </header>
              <dl>
                <div>
                  <dt>Media types</dt>
                  <dd>Anime · Manhwa · Donghua · Light Novel</dd>
                  <span>04</span>
                </div>
                <div>
                  <dt>Statuses</dt>
                  <dd>Planned · Active · On Hold · Dropped · Completed</dd>
                  <span>05</span>
                </div>
                <div>
                  <dt>Metadata</dt>
                  <dd>AniList · Jikan · MangaDex · Custom covers</dd>
                  <span>API</span>
                </div>
                <div>
                  <dt>Portability</dt>
                  <dd>JSON library import and export</dd>
                  <span>JSON</span>
                </div>
              </dl>
              <footer>
                <Check size={14} aria-hidden="true" /> Real capabilities from current Chronicle build
              </footer>
            </div>
          </div>
        </section>

        <section className="simple-section" id="features" aria-labelledby="simple-features-title">
          <div className="marketing-container">
            <div className="simple-section-heading">
              <span>Simple on purpose</span>
              <h2 id="simple-features-title">Your list, minus the busywork.</h2>
            </div>
            <div className="simple-feature-list">
              {highlights.map((highlight, index) => (
                <article key={highlight.title}>
                  <span>0{index + 1}</span>
                  <h3>{highlight.title}</h3>
                  <p>{highlight.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="simple-section simple-trackers" id="trackers" aria-labelledby="simple-trackers-title">
          <div className="marketing-container simple-trackers-grid">
            <div className="simple-section-heading">
              <span>Four formats</span>
              <h2 id="simple-trackers-title">One library.</h2>
              <p>Keep each format separate without spreading your progress across four apps.</p>
            </div>
            <div className="simple-format-list" aria-label="Supported media formats">
              {mediaFormats.map((format) => (
                <div key={format.name}>
                  <span>
                    <strong>{format.name}</strong>
                    <small>{format.summary}</small>
                  </span>
                  <Check size={15} aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="simple-final-cta" aria-labelledby="simple-cta-title">
          <div className="marketing-container simple-final-cta-inner">
            <div>
              <h2 id="simple-cta-title">Ready when your next story starts.</h2>
              <p>Build your list now. Keep it useful later.</p>
            </div>
            <LandingFinalAction isAuthenticated={isAuthenticated} />
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
