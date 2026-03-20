/**
 * Apify integration — Instagram, YouTube, Google Search, LinkedIn, TikTok, Twitter/X
 *
 * ALL six scrapers search across ALL monitored brands and ALL keywords.
 * No hardcoded brand names, hashtags, or location terms anywhere in this file.
 * Everything is driven by VITE_BRAND_MONITORED_BRANDS and VITE_BRAND_MONITORED_KEYWORDS.
 *
 * sinceDate (ISO string) is passed from the scheduler's lastRunAt — every scraper
 * uses it to constrain results to content published after the last scan.
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
  platform: "instagram" | "youtube" | "linkedin" | "tiktok" | "twitter" | "blog";
  score: number; // 0–1 relevance proxy (engagement-based)
}

// ── Instagram Hashtag Scraper ─────────────────────────────────────────────
// Actor: apify/instagram-hashtag-scraper
// Builds hashtags from ALL monitored brands + ALL keywords — no hardcoding.

export async function scrapeInstagram(
  brands: string[],
  apiKey: string,
  keywords: string[] = [],
  sinceDate?: string,
): Promise<ApifyResult[]> {
  const brandHashtags = brands
    .map(b => b.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  const keywordHashtags = keywords
    .map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(h => h.length > 3);

  const hashtags = [
    ...brandHashtags,
    ...keywordHashtags,
  ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

  if (hashtags.length === 0) return [];

  const input: Record<string, unknown> = {
    hashtags,
    resultsLimit: 10, // per hashtag — all brands, keep total manageable
    scrapeType: "posts",
  };

  if (sinceDate) input.onlyPostsNewerThan = sinceDate.slice(0, 10);

  try {
    log(`Apify Instagram: scraping ${hashtags.length} hashtags (${hashtags.slice(0, 3).join(", ")}…)${sinceDate ? ` since ${sinceDate.slice(0, 10)}` : ""}`, "apify");

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
// Searches ALL brands + ALL keywords.

export async function scrapeYouTube(
  brands: string[],
  keywords: string[],
  apiKey: string,
  sinceDate?: string,
): Promise<ApifyResult[]> {
  const searchTerms = [
    ...brands,
    ...keywords,
  ]
    .filter(Boolean)
    .map(t => `${t} review OR unboxing OR taste test OR opinion`);

  const input: Record<string, unknown> = {
    searchTerms,
    maxResults: 5, // per search term — all brands, keep total manageable
    type: "video",
  };

  // YouTube scraper date filter
  if (sinceDate) {
    const days = Math.ceil((Date.now() - new Date(sinceDate).getTime()) / 86400000);
    if (days <= 7) input.dateFilter = "week";
    else if (days <= 30) input.dateFilter = "month";
  }

  try {
    log(`Apify YouTube: ${searchTerms.length} queries (${brands[0]}…)${sinceDate ? ` since ${sinceDate.slice(0, 10)}` : ""}`, "apify");

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
// Searches ALL brands + ALL keywords across Reddit, Quora, reviews.

export async function scrapeGoogleSearch(
  brands: string[],
  keywords: string[],
  apiKey: string,
  sinceDate?: string,
): Promise<ApifyResult[]> {
  const queries = [
    ...brands.map(b => `"${b}" site:reddit.com OR site:quora.com`),
    ...brands.map(b => `"${b}" review OR feedback 2025 OR 2026`),
    ...keywords.map(k => `"${k}" review OR discussion 2025 OR 2026`),
  ].filter(Boolean);

  const input: Record<string, unknown> = {
    queries: queries.join("\n"),
    maxPagesPerQuery: 1,
    resultsPerPage: 5,
    countryCode: "us",
    languageCode: "en",
  };

  // Google time filter
  if (sinceDate) {
    const days = Math.ceil((Date.now() - new Date(sinceDate).getTime()) / 86400000);
    if (days <= 1) input.tbs = "qdr:d";
    else if (days <= 7) input.tbs = "qdr:w";
    else if (days <= 30) input.tbs = "qdr:m";
  }

  try {
    log(`Apify Google: ${queries.length} queries (${brands[0]}…)${sinceDate ? ` since ${sinceDate.slice(0, 10)}` : ""}`, "apify");

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
// Actor: harvestapi~linkedin-post-search
// Searches ALL brands + ALL keywords (capped at 10 per run — actor limit).

export async function scrapeLinkedIn(
  brands: string[],
  keywords: string[],
  apiKey: string,
  sinceDate?: string,
): Promise<ApifyResult[]> {
  // harvestapi caps at 10 queries per run
  const searchQueries = [
    ...brands.map(b => `"${b}"`),
    ...keywords,
  ].filter(Boolean).slice(0, 10);

  const postedLimit = sinceDate
    ? (Math.ceil((Date.now() - new Date(sinceDate).getTime()) / 86400000) <= 1 ? "24h" : "week")
    : "week";

  const input = {
    searchQueries,
    maxPosts: 10,
    sortBy: "date",
    postedLimit,
    scrapeComments: false,
    scrapeReactions: false,
  };

  try {
    log(`Apify LinkedIn: ${searchQueries.length} queries (${brands[0]}…) [${postedLimit}]`, "apify");

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

// ── TikTok Scraper ────────────────────────────────────────────────────────
// Actor: clockworks~free-tiktok-scraper
// Searches ALL brands + ALL keywords — no hardcoded hashtags.

export async function scrapeTikTok(
  brands: string[],
  keywords: string[],
  apiKey: string,
  sinceDate?: string,
): Promise<ApifyResult[]> {
  const searchQueries = [
    ...brands,
    ...keywords,
  ].filter(Boolean);

  const input: Record<string, unknown> = {
    searchQueries,
    maxItems: 10, // per query — all brands, keep total manageable
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  };

  if (sinceDate) input.publishedAfter = sinceDate.slice(0, 10);

  try {
    log(`Apify TikTok: ${searchQueries.length} queries (${brands[0]}…)${sinceDate ? ` since ${sinceDate.slice(0, 10)}` : ""}`, "apify");

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
      .filter(item => item.webVideoUrl && (item.text || item.description))
      .map(item => {
        const text: string = item.text ?? item.description ?? "";
        const author: string = item.authorMeta?.name ?? item.author ?? "TikTok user";
        const likes: number = item.diggCount ?? item.likesCount ?? item.likes ?? 0;
        const shares: number = item.shareCount ?? item.shares ?? 0;
        const comments: number = item.commentCount ?? item.comments ?? 0;
        const score = Math.min(0.99, (likes + shares * 3 + comments * 2) / 50000);
        const url: string = item.webVideoUrl ?? item.url ?? "";
        return {
          url,
          title: `@${author} on TikTok — ${text.slice(0, 80)}`,
          content: text.slice(0, 500),
          platform: "tiktok" as const,
          score,
        };
      })
      .filter(r => r.url.length > 0);
  } catch (err) {
    log(`Apify TikTok exception: ${err}`, "apify");
    return [];
  }
}

// ── Twitter / X Scraper ───────────────────────────────────────────────────
// Actor: apidojo~tweet-scraper
// Searches ALL brands + ALL keywords — no hardcoded terms.

export async function scrapeTweets(
  brands: string[],
  keywords: string[],
  apiKey: string,
  sinceDate?: string,
): Promise<ApifyResult[]> {
  const searchTerms = [
    ...brands.map(b => `"${b}"`),
    ...keywords,
  ].filter(Boolean);

  const input: Record<string, unknown> = {
    searchTerms,
    maxTweets: 10, // per search term — all brands, keep total manageable
    addUserInfo: false,
    startUrls: [],
  };

  if (sinceDate) input.sinceDate = sinceDate.slice(0, 10);

  try {
    log(`Apify Twitter: ${searchTerms.length} queries (${brands[0]}…)${sinceDate ? ` since ${sinceDate.slice(0, 10)}` : ""}`, "apify");

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
      .filter(item => item.url && (item.text || item.full_text))
      .map(item => {
        const text: string = item.text ?? item.full_text ?? "";
        const handle: string = item.author?.userName ?? item.user?.screen_name ?? item.userName ?? "user";
        const likes: number = item.likeCount ?? item.favorite_count ?? 0;
        const retweets: number = item.retweetCount ?? item.retweet_count ?? 0;
        const replies: number = item.replyCount ?? item.reply_count ?? 0;
        const score = Math.min(0.99, (likes + retweets * 3 + replies * 2) / 10000);
        const url: string = item.url ?? `https://x.com/${handle}/status/${item.id}`;
        return {
          url,
          title: `@${handle} on X — ${text.slice(0, 80)}`,
          content: text.slice(0, 500),
          platform: "twitter" as const,
          score,
        };
      })
      .filter(r => r.url.length > 0);
  } catch (err) {
    log(`Apify Twitter exception: ${err}`, "apify");
    return [];
  }
}

// ── Combined Apify refresh ─────────────────────────────────────────────────
// Runs all six scrapers in parallel. sinceDate constrains every scraper to
// only return content published after the last scan time.

export async function runApifyRefresh(
  brands: string[],
  keywords: string[],
  apiKey: string,
  sinceDate?: string,
): Promise<Array<{ url: string; title: string; content: string; score: number }>> {
  if (!apiKey) {
    log("APIFY_API_KEY not set — skipping Apify refresh", "apify");
    return [];
  }

  log(`Starting Apify refresh — ${brands.length} brands, ${keywords.length} keywords${sinceDate ? `, since ${sinceDate.slice(0, 10)}` : ""}`, "apify");

  const [instagram, linkedin, youtube, google, tiktok, twitter] = await Promise.all([
    scrapeInstagram(brands, apiKey, keywords, sinceDate),
    scrapeLinkedIn(brands, keywords, apiKey, sinceDate),
    scrapeYouTube(brands, keywords, apiKey, sinceDate),
    scrapeGoogleSearch(brands, keywords, apiKey, sinceDate),
    scrapeTikTok(brands, keywords, apiKey, sinceDate),
    scrapeTweets(brands, keywords, apiKey, sinceDate),
  ]);

  const all = [...instagram, ...linkedin, ...youtube, ...google, ...tiktok, ...twitter];
  log(`Apify refresh complete — ${instagram.length} Instagram, ${linkedin.length} LinkedIn, ${youtube.length} YouTube, ${google.length} Google, ${tiktok.length} TikTok, ${twitter.length} Twitter (${all.length} total)`, "apify");

  return all;
}
