/**
 * Apify integration — Instagram, YouTube, and Google Search scrapers
 *
 * Supplements Tavily with social platform data that Tavily cannot reach:
 *   - Instagram posts/reels mentioning the brand (via hashtag scraper)
 *   - YouTube videos/comments mentioning the brand
 *   - Google Search results (broader web coverage)
 *
 * Each scraper calls the Apify run-sync-get-dataset-items endpoint with a
 * 120-second wait — one HTTP call, results returned inline, no polling needed.
 *
 * API key is read from APIFY_API_KEY env var — never hardcoded.
 */

import { log } from "./index";

const APIFY_BASE = "https://api.apify.com/v2/acts";
const WAIT_SECS = 120; // max wait per actor run

// ── Shared result type ─────────────────────────────────────────────────────
export interface ApifyResult {
  url: string;
  title: string;
  content: string;
  platform: "instagram" | "youtube" | "blog";
  score: number; // 0–1 relevance proxy (engagement-based)
}

// ── Instagram Hashtag Scraper ─────────────────────────────────────────────
// Actor: apify/instagram-hashtag-scraper
// Searches public Instagram posts by hashtag — no login required.
// Returns posts with caption, likes, comments count, and post URL.
//
// We query brand-name-derived hashtags (e.g. "utzsnacks", "utz")
// and top competitor hashtags from the monitored brands list.

export async function scrapeInstagram(
  brands: string[],
  apiKey: string,
): Promise<ApifyResult[]> {
  const primaryBrand = brands[0] ?? "";

  // Build hashtags from brand names: remove spaces, lowercase
  const hashtags = brands
    .slice(0, 4) // limit to top 4 brands to control cost
    .map(b => b.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  if (hashtags.length === 0) return [];

  const input = {
    hashtags,
    resultsLimit: 20, // per hashtag
    scrapeType: "posts",
  };

  try {
    log(`Apify Instagram: scraping hashtags [${hashtags.join(", ")}]`, "apify");

    const res = await fetch(
      `${APIFY_BASE}/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=${apiKey}&waitForFinish=${WAIT_SECS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!res.ok) {
      log(`Apify Instagram error: ${res.status} ${await res.text().catch(() => "")}`, "apify");
      return [];
    }

    const items = await res.json() as Array<Record<string, any>>;
    log(`Apify Instagram: received ${items.length} raw items`, "apify");

    return items
      .filter(item => item.url && (item.caption || item.alt))
      .map(item => {
        const caption: string = item.caption ?? item.alt ?? "";
        const likes: number = item.likesCount ?? item.likes ?? 0;
        const comments: number = item.commentsCount ?? item.comments ?? 0;
        // Relevance proxy: normalize engagement, cap at 0.99
        const score = Math.min(0.99, (likes + comments * 2) / 10000);
        return {
          url: item.url as string,
          title: `Instagram post — ${caption.slice(0, 80)}`,
          content: caption.slice(0, 500),
          platform: "instagram" as const,
          score,
        };
      })
      .filter(r => {
        // Only keep posts that actually mention one of the monitored brands
        const lower = r.content.toLowerCase();
        return brands.some(b => lower.includes(b.toLowerCase().split(" ")[0]));
      });
  } catch (err) {
    log(`Apify Instagram exception: ${err}`, "apify");
    return [];
  }
}

// ── YouTube Scraper ───────────────────────────────────────────────────────
// Actor: streamers/youtube-scraper
// Searches YouTube by keyword, returns video metadata + description.
// Comments are not fetched by default (too slow) — title + description
// are enough for sentiment analysis.

export async function scrapeYouTube(
  brands: string[],
  keywords: string[],
  apiKey: string,
): Promise<ApifyResult[]> {
  const primaryBrand = brands[0] ?? "";

  // Build search queries: brand name + category keywords
  const searchTerms = [
    primaryBrand,
    ...brands.slice(1, 2), // top competitor
    ...keywords.slice(0, 1), // top category keyword
  ]
    .filter(Boolean)
    .map(t => `${t} review OR unboxing OR taste test OR opinion`)
    .slice(0, 3);

  const input = {
    searchTerms,
    maxResults: 10, // per search term
    type: "video",
    // dateRange not set — get recent by default
  };

  try {
    log(`Apify YouTube: searching [${searchTerms.slice(0, 2).join(", ")}…]`, "apify");

    const res = await fetch(
      `${APIFY_BASE}/streamers~youtube-scraper/run-sync-get-dataset-items?token=${apiKey}&waitForFinish=${WAIT_SECS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!res.ok) {
      log(`Apify YouTube error: ${res.status} ${await res.text().catch(() => "")}`, "apify");
      return [];
    }

    const items = await res.json() as Array<Record<string, any>>;
    log(`Apify YouTube: received ${items.length} raw items`, "apify");

    return items
      .filter(item => item.url && (item.title || item.description))
      .map(item => {
        const title: string = item.title ?? "";
        const description: string = item.description ?? "";
        const views: number = item.viewCount ?? item.views ?? 0;
        const likes: number = item.likes ?? 0;
        const score = Math.min(0.99, (views / 100000 + likes / 1000) / 2);
        // Canonical YouTube URL
        const url: string = item.url ?? `https://www.youtube.com/watch?v=${item.id}`;
        return {
          url,
          title: title.slice(0, 100),
          content: `${title} — ${description}`.slice(0, 500),
          platform: "youtube" as const,
          score,
        };
      });
  } catch (err) {
    log(`Apify YouTube exception: ${err}`, "apify");
    return [];
  }
}

// ── Google Search Scraper ─────────────────────────────────────────────────
// Actor: apify/google-search-scraper
// Broader web coverage. Useful for finding reviews, blog posts, and
// forum discussions that Tavily may miss with its relevance filter.

export async function scrapeGoogleSearch(
  brands: string[],
  keywords: string[],
  apiKey: string,
): Promise<ApifyResult[]> {
  const primaryBrand = brands[0] ?? "";

  const queries = [
    `"${primaryBrand}" site:reddit.com OR site:quora.com`,
    `"${primaryBrand}" review OR feedback 2025 OR 2026`,
  ].filter(Boolean);

  const input = {
    queries: queries.join("\n"),
    maxPagesPerQuery: 1,
    resultsPerPage: 10,
    countryCode: "us",
    languageCode: "en",
  };

  try {
    log(`Apify Google: searching "${primaryBrand}"`, "apify");

    const res = await fetch(
      `${APIFY_BASE}/apify~google-search-scraper/run-sync-get-dataset-items?token=${apiKey}&waitForFinish=${WAIT_SECS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!res.ok) {
      log(`Apify Google error: ${res.status} ${await res.text().catch(() => "")}`, "apify");
      return [];
    }

    const pages = await res.json() as Array<{ organicResults?: Array<Record<string, any>> }>;
    log(`Apify Google: received ${pages.length} result pages`, "apify");

    const results: ApifyResult[] = [];
    for (const page of pages) {
      for (const item of page.organicResults ?? []) {
        if (!item.url) continue;
        results.push({
          url: item.url as string,
          title: (item.title ?? "") as string,
          content: (item.description ?? item.snippet ?? "").slice(0, 500),
          platform: "blog" as const,
          score: 0.5,
        });
      }
    }
    return results;
  } catch (err) {
    log(`Apify Google exception: ${err}`, "apify");
    return [];
  }
}

// ── Combined Apify refresh ─────────────────────────────────────────────────
// Runs all three scrapers in parallel and returns merged results.
// Called from the main Tavily refresh cycle in tavily.ts.

export async function runApifyRefresh(
  brands: string[],
  keywords: string[],
  apiKey: string,
): Promise<Array<{ url: string; title: string; content: string; score: number }>> {
  if (!apiKey) {
    log("APIFY_API_KEY not set — skipping Apify refresh", "apify");
    return [];
  }

  log("Starting Apify refresh (Instagram + YouTube + Google)…", "apify");

  // Run all three in parallel
  const [instagram, youtube, google] = await Promise.all([
    scrapeInstagram(brands, apiKey),
    scrapeYouTube(brands, keywords, apiKey),
    scrapeGoogleSearch(brands, keywords, apiKey),
  ]);

  const all = [...instagram, ...youtube, ...google];
  log(`Apify refresh complete — ${instagram.length} Instagram, ${youtube.length} YouTube, ${google.length} Google (${all.length} total)`, "apify");

  return all;
}
