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

// Portland ME location hashtags — always included for local market intelligence
const LOCATION_HASHTAGS = [
  "portlandme",
  "portlandmaine",
  "portlandmaineeats",
  "portlandmefood",
  "mainemariners",
  "maineCeltics",
  "hadlockfield",
  "portlandevents",
  "maineevents",
  "portlandmainefood",
  "heartofpine",
  "portlandmainelife",
  "livemusicmaine",
];

export async function scrapeInstagram(
  brands: string[],
  apiKey: string,
  keywords: string[] = [],
): Promise<ApifyResult[]> {
  const primaryBrand = brands[0] ?? "";

  // Build hashtags: brand names + location hashtags
  // Brand hashtags catch direct brand mentions on Instagram
  // Location hashtags catch Portland ME restaurant/event discovery
  const brandHashtags = brands
    .slice(0, 2) // limit brand hashtags to top 2
    .map(b => b.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  // Use location hashtags (always) + any keyword-derived hashtags
  const keywordHashtags = keywords
    .slice(0, 3)
    .map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(h => h.length > 4); // skip very short ones

  const hashtags = [
    ...brandHashtags,
    ...LOCATION_HASHTAGS,
    ...keywordHashtags,
  ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

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
        // Keep posts that mention a monitored brand OR come from a location hashtag scan
        // (Portland ME hashtag posts are valuable even without a direct brand mention)
        const lower = r.content.toLowerCase();
        const mentionsBrand = brands.some(b => lower.includes(b.toLowerCase().split(" ")[0]));
        const isLocationPost = LOCATION_HASHTAGS.some(tag => lower.includes(tag.toLowerCase()));
        return mentionsBrand || isLocationPost || true; // accept all — location context is always valuable
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

// ── LinkedIn Post Search Scraper ─────────────────────────────────────────
// Actor: harvestapi~linkedin-post-search (no cookies required)
// Searches public LinkedIn posts by keyword.
// We search Portland ME food/event keywords to capture local market intel.

const LINKEDIN_SEARCH_QUERIES = [
  "Portland Maine restaurant",
  "Portland ME food scene",
  "Portland Maine events",
  "Maine Mariners",
  "Hearts of Pine",
  "Cross Insurance Arena Portland",
];

export async function scrapeLinkedIn(
  brands: string[],
  keywords: string[],
  apiKey: string,
): Promise<ApifyResult[]> {
  // Combine Portland ME queries with brand name query
  const primaryBrand = brands[0] ?? "";
  const searchQueries = [
    `"${primaryBrand}"`,
    ...LINKEDIN_SEARCH_QUERIES,
  ].slice(0, 6); // LinkedIn caps queries, stay conservative

  const input = {
    searchQueries,
    maxPosts: 10,        // per query
    sortBy: "date",      // newest first
    postedLimit: "week", // only posts from last week — keep it fresh
    scrapeComments: false,
    scrapeReactions: false,
  };

  try {
    log(`Apify LinkedIn: searching [${searchQueries.slice(0, 3).join(", ")}…]`, "apify");

    const res = await fetch(
      `${APIFY_BASE}/harvestapi~linkedin-post-search/run-sync-get-dataset-items?token=${apiKey}&waitForFinish=${WAIT_SECS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!res.ok) {
      log(`Apify LinkedIn error: ${res.status} ${await res.text().catch(() => "")}`, "apify");
      return [];
    }

    const items = await res.json() as Array<Record<string, any>>;
    log(`Apify LinkedIn: received ${items.length} raw items`, "apify");

    return items
      .filter(item => item.url && (item.text || item.content))
      .map(item => {
        const text: string = item.text ?? item.content ?? "";
        const reactions: number = item.numLikes ?? item.reactions ?? 0;
        const comments: number = item.numComments ?? item.comments ?? 0;
        const score = Math.min(0.99, (reactions + comments * 2) / 5000);
        const authorName: string = item.authorName ?? item.author?.name ?? "LinkedIn user";
        return {
          url: item.url as string,
          title: `LinkedIn — ${authorName}: ${text.slice(0, 60)}`,
          content: text.slice(0, 500),
          platform: "linkedin" as const,
          score,
        };
      });
  } catch (err) {
    log(`Apify LinkedIn exception: ${err}`, "apify");
    return [];
  }
}

// ── TikTok Hashtag Scraper ────────────────────────────────────────────────
// Actor: clockworks~free-tiktok-scraper
// Searches TikTok by hashtag — no login required.
// We search Portland ME food and event hashtags.

const TIKTOK_HASHTAGS = [
  "portlandmaine",
  "portlandme",
  "portlandmaineeats",
  "maineevents",
  "mainemariners",
  "portlandmainefood",
];

export async function scrapeTikTok(
  brands: string[],
  apiKey: string,
): Promise<ApifyResult[]> {
  const brandHashtag = (brands[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const hashtags = [brandHashtag, ...TIKTOK_HASHTAGS].filter(Boolean);

  const input = {
    hashtags,
    resultsPerPage: 15,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  };

  try {
    log(`Apify TikTok: scraping hashtags [${hashtags.slice(0, 4).join(", ")}…]`, "apify");

    const res = await fetch(
      `${APIFY_BASE}/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${apiKey}&waitForFinish=${WAIT_SECS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!res.ok) {
      log(`Apify TikTok error: ${res.status} ${await res.text().catch(() => "")}`, "apify");
      return [];
    }

    const items = await res.json() as Array<Record<string, any>>;
    log(`Apify TikTok: received ${items.length} raw items`, "apify");

    return items
      .filter(item => item.webVideoUrl && item.text)
      .map(item => {
        const text: string = item.text ?? "";
        const likes: number = item.diggCount ?? 0;
        const plays: number = item.playCount ?? 0;
        const author: string = item.authorMeta?.name ?? "tiktok user";
        const score = Math.min(0.99, (likes + plays / 1000) / 10000);
        return {
          url: item.webVideoUrl as string,
          title: `TikTok @${author} — ${text.slice(0, 60)}`,
          content: text.slice(0, 500),
          platform: "tiktok" as const,
          score,
        };
      });
  } catch (err) {
    log(`Apify TikTok exception: ${err}`, "apify");
    return [];
  }
}

// ── Twitter/X Tweet Scraper ───────────────────────────────────────────────
// Actor: apidojo~tweet-scraper
// Searches tweets by keyword — no login required.
// $0.40 per 1,000 tweets.

const TWITTER_SEARCH_TERMS = [
  "Portland Maine restaurant",
  "Portland ME food",
  "Portland Maine events",
  "Maine Mariners",
  "Hearts of Pine Portland",
  "Portland Maine concert",
];

export async function scrapeTweets(
  brands: string[],
  apiKey: string,
): Promise<ApifyResult[]> {
  const primaryBrand = brands[0] ?? "";
  const searchTerms = [
    `"${primaryBrand}"`,
    ...TWITTER_SEARCH_TERMS,
  ].slice(0, 6);

  const input = {
    searchTerms,
    maxItems: 15,           // per search term
    tweetLanguage: "en",
    includeSearchTerms: false,
  };

  try {
    log(`Apify Twitter: searching [${searchTerms.slice(0, 3).join(", ")}…]`, "apify");

    const res = await fetch(
      `${APIFY_BASE}/apidojo~tweet-scraper/run-sync-get-dataset-items?token=${apiKey}&waitForFinish=${WAIT_SECS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!res.ok) {
      log(`Apify Twitter error: ${res.status} ${await res.text().catch(() => "")}`, "apify");
      return [];
    }

    const items = await res.json() as Array<Record<string, any>>;
    log(`Apify Twitter: received ${items.length} raw items`, "apify");

    return items
      .filter(item => item.url && item.text)
      .map(item => {
        const text: string = item.text ?? "";
        const likes: number = item.likeCount ?? 0;
        const retweets: number = item.retweetCount ?? 0;
        const replies: number = item.replyCount ?? 0;
        const author: string = item.author?.userName ?? "twitter user";
        const score = Math.min(0.99, (likes + retweets * 2 + replies) / 5000);
        return {
          url: item.url as string,
          title: `Tweet @${author} — ${text.slice(0, 60)}`,
          content: text.slice(0, 500),
          platform: "twitter" as const,
          score,
        };
      });
  } catch (err) {
    log(`Apify Twitter exception: ${err}`, "apify");
    return [];
  }
}

// ── Combined Apify refresh ─────────────────────────────────────────────────
// Runs all six scrapers in parallel and returns merged results.
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

  log("Starting Apify refresh (Instagram + LinkedIn + TikTok + Twitter + YouTube + Google)…", "apify");

  // Run all six in parallel
  const [instagram, linkedin, tiktok, twitter, youtube, google] = await Promise.all([
    scrapeInstagram(brands, apiKey, keywords),
    scrapeLinkedIn(brands, keywords, apiKey),
    scrapeTikTok(brands, apiKey),
    scrapeTweets(brands, apiKey),
    scrapeYouTube(brands, keywords, apiKey),
    scrapeGoogleSearch(brands, keywords, apiKey),
  ]);

  const all = [...instagram, ...linkedin, ...tiktok, ...twitter, ...youtube, ...google];
  log(`Apify refresh complete — ${instagram.length} IG, ${linkedin.length} LI, ${tiktok.length} TikTok, ${twitter.length} Twitter, ${youtube.length} YT, ${google.length} Google (${all.length} total)`, "apify");

  return all;
}
