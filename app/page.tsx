import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Layers3, BellRing, Bookmark } from "lucide-react";
import styles from "./landing.module.css";
import { StoryScene } from "@/components/marketing/StoryScene";
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

const features = [
  {
    icon: Bookmark,
    title: "Pick up where you left off",
    description: "Log episodes and chapters down to the decimal, so you know exactly where to resume.",
  },
  {
    icon: Layers3,
    title: "Give favorites their own shelves",
    description: "Make collections for future reads and comfort rewatches. Keep notes and ratings beside each title.",
  },
  {
    icon: BellRing,
    title: "See what’s been released",
    description: "Link supported manhwa and donghua trackers to see new chapters and episodes. Catch up when you choose.",
  },
];

const mediaFormats = [
  { id: "anime", name: "Anime", summary: "Episodes, watch links, ratings, and notes." },
  { id: "manhwa", name: "Manhwa", summary: "Chapters, reading links, covers, and update checks." },
  { id: "donghua", name: "Donghua", summary: "Episode progress and release checks for supported trackers." },
  { id: "novels", name: "Light novels", summary: "Chapter progress, reading notes, and a built-in reader for hosted novels." },
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
    featureList: [...features.map(({ title }) => title), "Export and restore your library as JSON"],
  },
];

export default async function LandingPage() {
  const cookieStore = await cookies();
  const isAuthenticated = Boolean(
    verifyAuthToken(cookieStore.get("auth_token")?.value),
  );

  return (
    <div className={`${styles.landing} marketing-site`}>
      <JsonLd data={structuredData} />
      <MarketingHeader isAuthenticated={isAuthenticated} />
      <main>
        <section className={styles.hero}>
          <div className={`${styles.heroGrid} marketing-container`}>
            <div className={styles.heroCopy} data-motion-reveal>
              <span className={styles.kicker}><span aria-hidden="true">✦</span> ANIME & READING TRACKER</span>
              <h1>Your worlds.<br /><em>Your pace.</em></h1>
              <p>Track every episode and chapter. Keep your library, shelves, and new releases in one place.</p>
              <LandingHeroActions isAuthenticated={isAuthenticated} />
              <p className={styles.promise}><Check size={15} aria-hidden="true" /> Your library is private by default.</p>
            </div>
            <div className={styles.heroArt} data-motion-reveal><StoryScene /></div>
          </div>
          <nav className={`${styles.heroFooter} marketing-container`} aria-label="Supported formats">
            <span>Track your</span>
            {mediaFormats.map(({ id, name }) => <a key={id} href={`#format-${id}`}>{name}</a>)}
          </nav>
        </section>
        <section className={`${styles.features} marketing-container`} id="features" aria-labelledby="feature-title">
          <div className={styles.sectionIntro} data-motion-reveal>
            <h2 id="feature-title">The plot gets complicated.<br /><em>Your list shouldn’t.</em></h2>
          </div>
          <div className={styles.featureRows}>
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} data-motion-reveal>
                <Icon className={styles.featureIcon} size={25} aria-hidden="true" />
                <div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.formats} id="trackers" aria-labelledby="formats-title">
          <div className={`${styles.formatsGrid} marketing-container`}>
            <div className={styles.formatStatement} data-motion-reveal>
              <h2 id="formats-title">Different worlds.<br /><em>One home.</em></h2>
              <p>Anime tonight. A novel tomorrow. Your progress stays with each story.</p>
              <Link href={isAuthenticated ? "/library" : "/login?mode=register"} className={styles.secondaryLink}>
                {isAuthenticated ? "Browse your library" : "Start your library"} <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <ul className={styles.formatList}>
              {mediaFormats.map(({ id, name, summary }) => (
                <li key={id} id={`format-${id}`} data-motion-reveal>
                  <div><h3>{name}</h3><p>{summary}</p></div>
                  <BookOpen size={20} aria-hidden="true" />
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className={`${styles.closing} marketing-container`} aria-labelledby="closing-title" data-motion-reveal>
          <h2 id="closing-title">Keep the stories.<br /><em>Lose the scattered lists.</em></h2>
          <p>Save a backup of your collection or take it with you in the Android app.</p>
          <LandingFinalAction isAuthenticated={isAuthenticated} />
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
