# Chronicle X SEO audit and operating plan

Audit date: 2026-08-01  
Canonical site: `https://chroniclex.vercel.app`  
Scope: public discovery, on-page SEO, technical crawlability, structured data, AI extractability, private-route indexing, and deployment follow-up.

## Outcome

Chronicle now has an indexable product page instead of sending every visitor and crawler into the authenticated dashboard. The implementation deliberately keeps one concise landing page, summarizes all four formats there, and adds a stable canonical URL, crawl files, structured data, social metadata, and explicit `noindex` boundaries for private app surfaces.

No code change can guarantee first place. Google states that there is no automatic way to rank first, and changes may take weeks or months to show. Chronicle can now be crawled and understood; competitive rankings still require deployment, indexing, useful content growth, real mentions, backlinks, and ongoing measurement.

## Baseline found before this change

| Finding | Impact | Resolution |
| --- | --- | --- |
| `/` redirected to `/home` | No public product explanation or crawlable acquisition page | Replaced redirect with a server-rendered product landing page |
| Live `/robots.txt` returned 404 | No sitemap discovery or explicit crawler policy | Added generated robots metadata route |
| Live `/sitemap.xml` returned 404 | Search engines had no canonical public URL inventory | Added generated XML sitemap |
| Rendered live homepage had no `<h1>` | Weak primary topic signal and poor public accessibility | Added one descriptive homepage `<h1>` |
| One global canonical pointed all routes at the homepage | Topic pages could not establish distinct canonical intent | Removed global canonical and assigned per-page canonicals |
| Dashboard and auth pages inherited indexable global metadata | Thin/private shells could compete with useful public pages | Added nested `noindex, nofollow` metadata |
| No concise format explanation | Crawlers and visitors lacked clear anime, manhwa, donghua, and light-novel context | Added short summaries for all four formats on `/` |
| No structured product or FAQ data | Product facts were harder for crawlers and answer engines to extract | Added valid JSON-LD blocks backed by visible page content |

## Search-intent map

| Canonical page | Primary intent | Supporting language |
| --- | --- | --- |
| `/` | anime manhwa donghua light novel tracker | anime watchlist, manhwa chapters, donghua episodes, light-novel reading progress, shelves, notes, and backups |

The page uses short, natural topic coverage rather than repeating keyword strings. Google does not use the meta-keywords tag, so Chronicle does not depend on it.

## Technical implementation

- Stable public URL configuration lives in `lib/site.ts`.
- Root metadata includes a focused title, description, canonical link, Open Graph data, Twitter card, and large preview image.
- `/robots.txt` allows normal search and named AI/search crawlers while blocking API endpoints.
- `/sitemap.xml` includes only the canonical homepage.
- Dashboard, login, and password reset routes emit `noindex`; personal library data is not placed in the sitemap or structured data.
- Homepage JSON-LD includes concise `WebSite` and `SoftwareApplication` data.
- `/llms.txt` supplies concise, factual product context and links for systems that choose to read it. It is supplemental, not a ranking guarantee or replacement for HTML.
- Search Console and Bing verification tokens can be injected with `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION`.
- Public pages are statically generated. This gives crawlers complete HTML without requiring client-side account or database calls.

## Verification completed

| Check | Result |
| --- | --- |
| TypeScript | `npm run typecheck` passed |
| ESLint | `npm run lint` passed |
| Unit tests | 23 files, 68 tests passed |
| Production build | Passed; homepage prerendered |
| Public HTML | HTTP 200, one `<h1>`, focused title, canonical, index/follow, and JSON-LD |
| Private HTML | `/home` and `/login` return `noindex` metadata |
| Crawl files | robots, sitemap, manifest, and llms file return HTTP 200 |
| Social image | `/api/og?focus=Anime` returns a 1200×630 PNG |
| Browser smoke | Homepage passed with no console/page errors |
| Mobile | 390px viewport had no horizontal overflow |

Repeat browser smoke after building and starting the site on port 3100:

```powershell
npm run build
npm run start -- -p 3100
python scripts/verifySeoUi.py
```

## Required after deployment

1. Deploy these changes. Until deployment, the live domain still serves the old redirecting experience and 404 crawl files.
2. Keep `NEXT_PUBLIC_APP_URL` set to the single preferred production origin. If a custom domain is adopted, update this variable and redirect the Vercel subdomain to it before requesting indexing.
3. Add the site to Google Search Console and Bing Webmaster Tools. Put the supplied verification tokens in the matching environment variables.
4. Submit `https://chroniclex.vercel.app/sitemap.xml` in both webmaster consoles.
5. Inspect `/`, request indexing, and confirm that Google selects the declared canonical.
6. Test deployed JSON-LD with Google's Rich Results Test and Schema.org Validator. Valid markup makes a page eligible; it does not guarantee a rich result.
7. Measure impressions, average position, clicks, indexed pages, and queries weekly. Compare 28-day windows after enough data accumulates.

## Authority and content roadmap

Technical SEO creates eligibility. To compete with established anime and reading trackers, Chronicle needs evidence that other people find it useful.

Priority content:

1. A dated guide: “How to track anime, manhwa, donghua, and light novels in one list.”
2. A migration guide showing the actual JSON import/export format and safe restore steps.
3. A fair comparison: dedicated tracker versus spreadsheet or notes app, with clear tradeoffs.
4. A donghua tracking guide that explains series, season, and episode-numbering problems from first-hand use.
5. A manhwa progress guide covering split/decimal chapters and supported update checks.
6. A privacy and data-handling page describing account scope, exported data, deletion, and self-hosting in plain language.

Authority work:

- Use a custom domain when practical; keep it stable.
- Publish release notes and dated product screenshots.
- Earn honest links through the GitHub repository, relevant open-source directories, anime/manhwa communities, and self-hosting communities. Do not mass-post promotional links.
- Add an identifiable author/about page with real experience maintaining the tracker.
- Collect only verifiable product metrics or testimonials; never invent user counts, ratings, or performance claims.

## Query monitoring set

Track at least these queries in Search Console and a monthly manual search review:

- anime manhwa tracker
- anime and light novel tracker
- anime watchlist app
- private anime tracker
- manhwa chapter tracker
- manhwa reading list tracker
- donghua tracker
- Chinese anime watchlist
- light novel chapter tracker
- web novel reading tracker
- all in one media tracker anime manhwa donghua

Record the Chronicle result URL, impressions, position, click-through rate, competitors shown, and whether an AI answer cites any relevant source. Improve pages from real query data instead of adding repeated keywords.

## Current limits

- Deployment and webmaster-console access were not authorized in this code task, so indexing has not been requested.
- The project currently uses a `vercel.app` origin. A stable branded domain would improve trust and reduce future migration risk, but the domain alone will not produce rankings.
- No current Search Console, Bing, analytics, backlink, or AI-citation data was available. Baseline rankings therefore remain unverified.
- FAQ structured data helps machines understand visible Q&A, but Google limits FAQ rich-result display and may choose not to show it.

## Primary references

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google Search developer guide](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [Google SoftwareApplication structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Next.js metadata and Open Graph guide](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- [Next.js robots file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)
- [Next.js sitemap file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
