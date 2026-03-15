/**
 * Tavily integration — brand mention search + conversation ingestion
 * Runs on startup and every 3 hours automatically.
 */

import { getStorage } from "./storage";
import { log } from "./index";

const TAVILY_API_URL = "https://api.tavily.com/search";
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

// ── Sentiment heuristics ───────────────────────────────────────────────────
const POSITIVE_WORDS = [
  "love", "great", "amazing", "best", "excellent", "fantastic", "wonderful",
  "delicious", "perfect", "awesome", "favorite", "highly recommend", "impressed",
  "outstanding", "top", "brilliant", "superb", "enjoyed", "pleased", "happy",
];
const NEGATIVE_WORDS = [
  "hate", "terrible", "awful", "worst", "bad", "disappointed", "poor",
  "disgusting", "horrible", "avoid", "never again", "overpriced", "stale",
  "bland", "gross", "nasty", "complaint", "problem", "issue", "broken",
];

function scoreSentiment(text: string): { sentiment: "positive" | "neutral" | "negative"; score: number } {
  const lower = text.toLowerCase();
  const pos = POSITIVE_WORDS.filter(w => lower.includes(w)).length;
  const neg = NEGATIVE_WORDS.filter(w => lower.includes(w)).length;
  if (pos > neg) return { sentiment: "positive", score: Math.min(95, 60 + pos * 8) };
  if (neg > pos) return { sentiment: "negative", score: Math.max(5, 40 - neg * 8) };
  return { sentiment: "neutral", score: 50 };
}

function detectPlatform(url: string): string {
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com")) return "facebook";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("youtube.com")) return "youtube";
  return "blog";
}

function priorityFromSentimentAndEngagement(
  sentiment: string,
  score: number,
): "high" | "medium" | "low" {
  if (sentiment === "negative" && score < 30) return "high";
  if (sentiment === "positive" && score > 75) return "high";
  if (sentiment === "neutral") return "low";
  return "medium";
}

// ── Tavily search ──────────────────────────────────────────────────────────
async function searchBrandMentions(
  query: string,
  apiKey: string,
): Promise<Array<{ url: string; title: string; content: string; score: number }>> {
  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
        max_results: 5,
      }),
    });
    if (!res.ok) {
      log(`Tavily search failed for "${query}": ${res.status}`, "tavily");
      return [];
    }
    const data = await res.json() as { results: Array<{ url: string; title: string; content: string; score: number }> };
    return data.results ?? [];
  } catch (err) {
    log(`Tavily search error for "${query}": ${err}`, "tavily");
    return [];
  }
}

// ── Ingest results into storage ────────────────────────────────────────────
async function ingestResults(
  results: Array<{ url: string; title: string; content: string; score: number }>,
  brandName: string,
  allBrands: string[],
  apiKey: string,
): Promise<number> {
  const storage = getStorage();
  const existing = await storage.getConversations();
  const existingUrls = new Set(existing.map(c => c.url));
  let ingested = 0;

  for (const result of results) {
    if (existingUrls.has(result.url)) continue;

    const text = `${result.title} ${result.content}`.slice(0, 800);
    const { sentiment, score } = scoreSentiment(text);
    const platform = detectPlatform(result.url);
    const priority = priorityFromSentimentAndEngagement(sentiment, score);

    // Detect which monitored brands are mentioned
    const brandMentions = allBrands.filter(b =>
      text.toLowerCase().includes(b.toLowerCase())
    );
    if (brandMentions.length === 0) brandMentions.push(brandName);

    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await storage.createConversation({
      id,
      platform,
      authorHandle: new URL(result.url).hostname,
      authorName: result.title.slice(0, 60),
      content: result.content.slice(0, 500),
      url: result.url,
      publishedAt: new Date().toISOString(),
      sentiment,
      sentimentScore: score,
      priority,
      status: "pending",
      brandMentions,
      tags: ["tavily", "auto-captured"],
      engagementCount: Math.floor(result.score * 100),
      flaggedReason: `Auto-captured via Tavily search for "${brandName}"`,
      assignedTo: null,
    });

    ingested++;
    existingUrls.add(result.url);
  }

  return ingested;
}

// ── AI draft generation via Tavily ─────────────────────────────────────────
export async function generateAIDraft(
  conversationContent: string,
  brandName: string,
  supportEmail: string,
  apiKey: string,
): Promise<string> {
  if (!apiKey) {
    return `Thank you for reaching out about ${brandName}. We appreciate your feedback and will be in touch. You can also contact us at ${supportEmail}.`;
  }

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${brandName} brand response to: ${conversationContent.slice(0, 200)}`,
        search_depth: "basic",
        include_answer: true,
        max_results: 3,
      }),
    });

    if (!res.ok) throw new Error(`Tavily ${res.status}`);
    const data = await res.json() as { answer?: string };

    if (data.answer) {
      return `Thanks for mentioning ${brandName}! ${data.answer.slice(0, 300)} Feel free to reach out to us at ${supportEmail} for more.`;
    }
  } catch (err) {
    log(`Draft generation error: ${err}`, "tavily");
  }

  // Fallback
  const { sentiment } = scoreSentiment(conversationContent);
  if (sentiment === "positive") {
    return `This made our day! We're thrilled you're enjoying ${brandName}. Share your experience and tag us — we'd love to feature you!`;
  }
  if (sentiment === "negative") {
    return `We're sorry to hear about your experience with ${brandName}. We take this seriously and want to make it right. Please reach out to us at ${supportEmail} so we can help.`;
  }
  return `Thank you for sharing your thoughts on ${brandName}. We're always looking to improve — feel free to reach out at ${supportEmail}.`;
}

// ── Main refresh job ───────────────────────────────────────────────────────
export async function runTavilyRefresh(
  brands: string[],
  keywords: string[],
  apiKey: string,
): Promise<void> {
  if (!apiKey) {
    log("TAVILY_API_KEY not set — skipping refresh", "tavily");
    return;
  }

  const primaryBrand = brands[0] ?? "Brand";
  log(`Starting brand mention refresh for "${primaryBrand}" (${brands.length} brands)`, "tavily");

  const storage = getStorage();
  let totalIngested = 0;

  // Search for primary brand + top competitors (limit to 4 queries to stay within rate limits)
  const searchTargets = [
    primaryBrand,
    ...brands.slice(1, 3),
    ...keywords.slice(0, 1),
  ].filter(Boolean).slice(0, 4);

  for (const target of searchTargets) {
    const results = await searchBrandMentions(
      `"${target}" review OR mention OR discussion`,
      apiKey,
    );
    const count = await ingestResults(results, primaryBrand, brands, apiKey);
    if (count > 0) {
      log(`Ingested ${count} new mentions for "${target}"`, "tavily");
      totalIngested += count;
    }
  }

  if (totalIngested > 0) {
    await storage.addActivityEntry({
      type: "capture",
      description: `${totalIngested} new conversation${totalIngested > 1 ? "s" : ""} captured via Tavily web search`,
      conversationId: null,
      userId: null,
      timestamp: new Date().toISOString(),
    });
  }

  log(`Refresh complete — ${totalIngested} new mentions ingested`, "tavily");
}

// ── Scheduler state (in-memory) ───────────────────────────────────────────
export const schedulerState = {
  lastRunAt: null as string | null,
  nextRunAt: null as string | null,
  isRunning: false,
  totalRuns: 0,
  lastIngestedCount: 0,
};

// ── Scheduler ─────────────────────────────────────────────────────────────
export function startTavilyScheduler(
  brands: string[],
  keywords: string[],
  apiKey: string,
): void {
  async function run() {
    schedulerState.isRunning = true;
    const next = new Date(Date.now() + REFRESH_INTERVAL_MS);
    schedulerState.nextRunAt = next.toISOString();
    try {
      await runTavilyRefresh(brands, keywords, apiKey);
      schedulerState.lastRunAt = new Date().toISOString();
      schedulerState.totalRuns += 1;
    } catch (err) {
      log(`Tavily refresh failed: ${err}`, "tavily");
    } finally {
      schedulerState.isRunning = false;
    }
  }

  // Set initial nextRunAt before first run fires
  schedulerState.nextRunAt = new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString();

  // Run immediately on startup
  run();

  // Then every 3 hours
  setInterval(run, REFRESH_INTERVAL_MS);

  log(`Tavily scheduler started — refreshing every 3 hours`, "tavily");
}

// ── Manual trigger ─────────────────────────────────────────────────────────
export async function triggerManualRefresh(
  brands: string[],
  keywords: string[],
  apiKey: string,
): Promise<{ ingested: number }> {
  if (schedulerState.isRunning) return { ingested: 0 };
  schedulerState.isRunning = true;
  schedulerState.nextRunAt = new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString();
  try {
    // Capture count by checking before/after
    const storage = getStorage();
    const before = (await storage.getConversations()).length;
    await runTavilyRefresh(brands, keywords, apiKey);
    const after = (await storage.getConversations()).length;
    const ingested = after - before;
    schedulerState.lastIngestedCount = ingested;
    schedulerState.lastRunAt = new Date().toISOString();
    schedulerState.totalRuns += 1;
    return { ingested };
  } finally {
    schedulerState.isRunning = false;
  }
}
