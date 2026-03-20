/**
 * Tavily integration — brand mention search + conversation ingestion
 * Runs on startup and every 3 hours automatically.
 *
 * Sentiment scoring:
 *   Primary  — Claude Haiku (via ANTHROPIC_API_KEY) for contextual accuracy
 *   Fallback — VADER-style rule-based scorer (negation, intensifiers, punctuation)
 */

import { getStorage } from "./storage";
import { log } from "./index";
import { runApifyRefresh } from "./apify";

const TAVILY_API_URL = "https://api.tavily.com/search";
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

// ── Claude Haiku sentiment scorer ─────────────────────────────────────────
async function scoreSentimentLLM(
  text: string,
  apiKey: string,
): Promise<{ sentiment: "positive" | "neutral" | "negative"; score: number; reason: string } | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 120,
        messages: [
          {
            role: "user",
            content: `Analyze the sentiment of the following brand mention. Reply ONLY with a JSON object — no prose, no markdown, no explanation outside the JSON.

Required format:
{"sentiment": "positive" | "neutral" | "negative", "score": <integer 0-100>, "reason": "<one sentence max>"}

Scoring guide:
- score 0–30  = strongly negative (angry, disappointed, harmful to brand)
- score 31–45 = mildly negative
- score 46–54 = neutral
- score 55–74 = mildly positive
- score 75–100 = strongly positive

Text to analyze:
"""${text.slice(0, 600)}"""

JSON:`,
          },
        ],
      }),
    });

    if (!res.ok) {
      log(`Anthropic API error ${res.status} — falling back to heuristic scorer`, "sentiment");
      return null;
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    const raw = data.content?.[0]?.text?.trim() ?? "";

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { sentiment: string; score: number; reason: string };

    if (!parsed.sentiment || typeof parsed.score !== "number") return null;
    const sentiment = ["positive", "neutral", "negative"].includes(parsed.sentiment)
      ? (parsed.sentiment as "positive" | "neutral" | "negative")
      : "neutral";
    const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    return { sentiment, score, reason: parsed.reason ?? "" };
  } catch (err) {
    log(`LLM sentiment parse error: ${err} — falling back to heuristic scorer`, "sentiment");
    return null;
  }
}

// ── VADER-style fallback scorer ────────────────────────────────────────────
// Handles negation ("not great"), intensifiers ("very bad"), and punctuation (!)
// Significant upgrade over the old simple word-count approach.
const POSITIVE_LEXICON: Record<string, number> = {
  love: 3, loved: 3, loving: 3,
  amazing: 3, "highly recommend": 3, outstanding: 3, exceptional: 3, excellent: 3, superb: 3, brilliant: 3,
  great: 2.5, fantastic: 2.5, wonderful: 2.5, awesome: 2.5, impressed: 2.5, delighted: 2.5,
  good: 2, enjoy: 2, enjoyed: 2, pleased: 2, happy: 2, perfect: 2, best: 2, favorite: 2, favourite: 2,
  nice: 1.5, solid: 1.5, helpful: 1.5, recommend: 1.5, quality: 1.5,
  fine: 1, okay: 0.8, ok: 0.8,
};
const NEGATIVE_LEXICON: Record<string, number> = {
  hate: 3, hated: 3, disgusting: 3, horrible: 3, atrocious: 3, appalling: 3,
  terrible: 2.5, awful: 2.5, worst: 2.5, dreadful: 2.5, deplorable: 2.5,
  bad: 2, disappointed: 2, disappointing: 2, poor: 2, avoid: 2, "never again": 2, unacceptable: 2,
  broken: 1.8, defective: 1.8, useless: 1.8, misleading: 1.8, scam: 1.8,
  overpriced: 1.5, complaint: 1.5, problem: 1.5, issue: 1.5, slow: 1.3,
  gross: 1.5, nasty: 1.5, bland: 1, stale: 1,
  mediocre: 1, meh: 0.8, underwhelming: 1.2, lacking: 1,
};
const NEGATORS = new Set(["not", "no", "never", "neither", "nor", "without", "hardly", "barely", "scarcely", "n't"]);
const INTENSIFIERS: Record<string, number> = {
  very: 1.3, extremely: 1.5, incredibly: 1.5, absolutely: 1.4, totally: 1.3,
  really: 1.2, so: 1.1, quite: 1.1, super: 1.2, utterly: 1.5, deeply: 1.3,
  little: 0.5, slightly: 0.6, somewhat: 0.7, kind_of: 0.8, sort_of: 0.8,
};

function scoreSentimentHeuristic(
  text: string,
): { sentiment: "positive" | "neutral" | "negative"; score: number } {
  const tokens = text.toLowerCase().split(/\s+/);
  let posSum = 0;
  let negSum = 0;

  // Check multi-word phrases first
  const lowerText = text.toLowerCase();
  for (const phrase of Object.keys(POSITIVE_LEXICON).filter(k => k.includes(" "))) {
    if (lowerText.includes(phrase)) posSum += POSITIVE_LEXICON[phrase];
  }
  for (const phrase of Object.keys(NEGATIVE_LEXICON).filter(k => k.includes(" "))) {
    if (lowerText.includes(phrase)) negSum += NEGATIVE_LEXICON[phrase];
  }

  // Token-by-token with negation window (±3 words) and intensifier window (prev 2)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].replace(/[^a-z']/g, "");
    const posVal = POSITIVE_LEXICON[token];
    const negVal = NEGATIVE_LEXICON[token];

    if (posVal === undefined && negVal === undefined) continue;

    // Check for negation in a 3-word window before this token
    const windowStart = Math.max(0, i - 3);
    const negated = tokens.slice(windowStart, i).some(t => NEGATORS.has(t.replace(/[^a-z']/g, "")));

    // Check for intensifier in the 2-word window before
    let multiplier = 1;
    for (let j = Math.max(0, i - 2); j < i; j++) {
      const t = tokens[j].replace(/[^a-z]/g, "");
      if (INTENSIFIERS[t]) { multiplier = INTENSIFIERS[t]; break; }
    }

    if (posVal !== undefined) {
      if (negated) negSum += posVal * multiplier * 0.8; // negated positive → negative
      else posSum += posVal * multiplier;
    } else if (negVal !== undefined) {
      if (negated) posSum += negVal * multiplier * 0.5; // negated negative → slight positive
      else negSum += negVal * multiplier;
    }
  }

  // Punctuation boosts
  const exclamations = (text.match(/!/g) ?? []).length;
  const caps = (text.match(/[A-Z]{3,}/g) ?? []).length;
  const boostSign = posSum >= negSum ? 1 : -1;
  const boost = Math.min(1.5, 1 + (exclamations + caps) * 0.1) * boostSign;

  const total = posSum + negSum;
  if (total === 0) return { sentiment: "neutral", score: 50 };

  const rawRatio = (posSum - negSum + boost) / (total + Math.abs(boost));
  // Map rawRatio (-1 to +1) → score (0 to 100), center at 50
  const score = Math.max(0, Math.min(100, Math.round(50 + rawRatio * 45)));

  if (score >= 56) return { sentiment: "positive", score };
  if (score <= 44) return { sentiment: "negative", score };
  return { sentiment: "neutral", score };
}

// ── Public scorer — LLM primary, heuristic fallback ────────────────────────
async function scoreSentiment(
  text: string,
): Promise<{ sentiment: "positive" | "neutral" | "negative"; score: number }> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const result = await scoreSentimentLLM(text, anthropicKey);
    if (result) {
      log(`LLM scored: ${result.sentiment} (${result.score}) — ${result.reason}`, "sentiment");
      return { sentiment: result.sentiment, score: result.score };
    }
  }
  // Fallback
  return scoreSentimentHeuristic(text);
}

// ── Domain blocklist ──────────────────────────────────────────────────────────────────
// Retail, e-commerce, and marketplace domains that produce product listing
// pages — not brand conversations. These are noise and must be excluded.
const BLOCKED_DOMAINS = [
  // Major retailers
  "amazon.com", "amazon.co.uk", "amazon.ca",
  "walmart.com",
  "target.com",
  "samsclub.com",
  "costco.com",
  "kroger.com",
  "safeway.com",
  "albertsons.com",
  "publix.com",
  "heb.com",
  "wegmans.com",
  "wholefoodsmarket.com",
  "cvs.com",
  "walgreens.com",
  "riteaid.com",
  "dollartree.com",
  "dollargeneral.com",
  "familydollar.com",
  "sears.com",
  "kmart.com",
  // Online marketplaces
  "ebay.com",
  "etsy.com",
  "instacart.com",
  "shipt.com",
  "doordash.com",
  "grubhub.com",
  "ubereats.com",
  // Price comparison / shopping aggregators
  "google.com/shopping",
  "shopping.google.com",
  "bizrate.com",
  "nextag.com",
  "pricespy.com",
  "camelcamelcamel.com",
  "slickdeals.net",
  // Nutrition / product data aggregators (not brand conversations)
  "nutritionix.com",
  "fatsecret.com",
  "myfitnesspal.com",
  "calorieking.com",
  "eatthismuch.com",
];

// ── Content contamination blocklist ─────────────────────────────────────────
// Hard-coded topic phrases that must never appear in this monitor's inbox.
// Added when cross-brand Apify scraper contamination was detected (v2.0.6).
// These are evaluated against the full text of each result before ingest.
//
// IMPORTANT: These are general-purpose noise filters (sports teams, unrelated
// local events). They are NOT brand-specific — they apply to ALL brand deploys.
// Brand-specific filtering is handled by env vars (VITE_BRAND_MONITORED_BRANDS).
const CONTENT_BLOCKLIST_PHRASES = [
  "maine mariners",
  "hearts of pine",
  "portland, me",
  "portland, maine",
  "portland maine",
  "portlandmaine",
  "portlandme",
  "portlandmaineeats",
  "portlandmefood",
  "mainemariners",
  "fitzpatrick stadium",
  "echl",            // East Coast Hockey League
  "usl league one",  // soccer division — not relevant to any brand monitor
];

/**
 * Returns true if the result content contains a known contamination phrase.
 * Case-insensitive. Used to block cross-brand scraper pollution at ingest time.
 */
function isContaminatedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return CONTENT_BLOCKLIST_PHRASES.some(phrase => lower.includes(phrase));
}

/**
 * Returns true if the URL should be blocked (retail/e-commerce/noise).
 * Matched against hostname to avoid false positives on blog posts that
 * merely mention a retailer name.
 */
function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return BLOCKED_DOMAINS.some(blocked => {
      // Handle path-based rules like "google.com/shopping"
      if (blocked.includes("/")) {
        return url.includes(blocked);
      }
      // Exact hostname match or subdomain match
      return hostname === blocked || hostname.endsWith("." + blocked);
    });
  } catch {
    return false;
  }
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
    if (isBlockedDomain(result.url)) {
      log(`Skipped blocked domain: ${result.url}`, "ingest");
      continue;
    }

    const text = `${result.title} ${result.content}`.slice(0, 800);

    if (isContaminatedContent(text)) {
      log(`Skipped contaminated content: ${result.url}`, "ingest");
      continue;
    }
    const { sentiment, score } = await scoreSentiment(text);
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
  const { sentiment } = await scoreSentiment(conversationContent);
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
  sinceDate?: string, // ISO string — only fetch content published after this date
): Promise<void> {
  if (!apiKey) {
    log("TAVILY_API_KEY not set — skipping refresh", "tavily");
    return;
  }

  const primaryBrand = brands[0] ?? "Brand";
  const sinceLabel = sinceDate ? ` (since ${new Date(sinceDate).toLocaleTimeString()})` : "";
  log(`Starting brand mention refresh for "${primaryBrand}" (${brands.length} brands)${sinceLabel}`, "tavily");

  const storage = getStorage();
  let totalIngested = 0;

  // Build a recency qualifier for Tavily queries — biases results toward recent content
  // Tavily doesn't support strict date filters but appending a date string helps ranking
  const recencyHint = sinceDate
    ? ` after:${new Date(sinceDate).toISOString().slice(0, 10)}`
    : "";

  // Search ALL brands + ALL keywords — full coverage, no arbitrary cap.
  // Queries run sequentially to avoid hammering the Tavily API simultaneously.
  const searchTargets = [
    ...brands,      // all 28 brands
    ...keywords,    // all 4 keywords
  ].filter(Boolean);

  log(`Tavily: running ${searchTargets.length} search queries`, "tavily");

  for (const target of searchTargets) {
    const results = await searchBrandMentions(
      `"${target}" review OR mention OR discussion${recencyHint}`,
      apiKey,
    );
    const count = await ingestResults(results, primaryBrand, brands, apiKey);
    if (count > 0) {
      log(`Ingested ${count} new mentions for "${target}"`, "tavily");
      totalIngested += count;
    }
  }

  // ── Apify social scan (Instagram, LinkedIn, TikTok, Twitter, YouTube, Google) ──
  const apifyKey = process.env.APIFY_API_KEY;
  if (apifyKey) {
    const apifyResults = await runApifyRefresh(brands, keywords, apifyKey, sinceDate);
    if (apifyResults.length > 0) {
      const apifyCount = await ingestResults(apifyResults, primaryBrand, brands, apiKey);
      if (apifyCount > 0) {
        log(`Ingested ${apifyCount} new mentions from Apify (Instagram/LinkedIn/TikTok/Twitter/YouTube/Google)`, "apify");
        totalIngested += apifyCount;
      }
    }
  }

  if (totalIngested > 0) {
    await storage.addActivityEntry({
      type: "capture",
      description: `${totalIngested} new conversation${totalIngested > 1 ? "s" : ""} captured via Tavily + Apify`,
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
    // Pass lastRunAt so each scraper only fetches content newer than the previous scan
    const sinceDate = schedulerState.lastRunAt ?? undefined;
    try {
      await runTavilyRefresh(brands, keywords, apiKey, sinceDate);
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

// ── Culture Monitor Scan ──────────────────────────────────────────────────
// Searches the open web for employer reputation signals — news coverage,
// press reports, and publicly indexed content about workplace culture.
//
// NOTE: Glassdoor and Indeed require login to view reviews and actively block
// web crawlers. Locking queries to those domains (include_domains) returns 0
// real results. Instead we search the open web broadly, which surfaces:
//   – News articles about layoffs, culture issues, executive changes
//   – LinkedIn posts and Reddit threads that are publicly indexed
//   – Business press coverage of workplace/culture stories
//   – Any Glassdoor/Indeed snippets that are indexed in Google News
//
// Results are stored in the separate cultureReviews store — never in
// the main Conversation Inbox. Negative results also appear in Negative
// Sentiment via the frontend query. ZERO fake/seed results.

const CULTURE_QUERIES: Array<{
  source: "glassdoor" | "indeed" | "comparably" | "news" | "reddit";
  queryTemplate: (brand: string) => string;
}> = [
  {
    source: "news",
    queryTemplate: (b) => `"${b}" employees workplace culture layoffs OR "work environment" OR "employee reviews"`,
  },
  {
    source: "glassdoor",
    queryTemplate: (b) => `"${b}" glassdoor reviews employees OR "great place to work" OR "CEO approval"`,
  },
  {
    source: "reddit",
    queryTemplate: (b) => `"${b}" employees reddit OR "working at" OR "interview experience" OR "company culture"`,
  },
  {
    source: "comparably",
    queryTemplate: (b) => `"${b}" comparably OR "company culture score" OR "eNPS" OR "employee satisfaction"`,
  },
];

export async function runCultureScan(
  brandName: string,
  apiKey: string,
): Promise<{ ingested: number }> {
  if (!apiKey) {
    log("TAVILY_API_KEY not set — skipping culture scan", "tavily");
    return { ingested: 0 };
  }

  const storage = getStorage();
  const existing = await storage.getCultureReviews();
  const existingUrls = new Set(existing.map(r => r.url));
  let ingested = 0;

  for (const src of CULTURE_QUERIES) {
    const query = src.queryTemplate(brandName);
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
          // No include_domains — open web search so we get real indexed results
        }),
      });

      if (!res.ok) {
        log(`Culture scan failed for "${src.source}" query: ${res.status}`, "tavily");
        continue;
      }

      const data = await res.json() as { results: Array<{ url: string; title: string; content: string; score: number }> };
      const results = data.results ?? [];

      for (const result of results) {
        if (existingUrls.has(result.url)) continue;

        const text = `${result.title} ${result.content}`.slice(0, 800);
        const { sentiment, score } = await scoreSentiment(text);
        const priority = sentiment === "negative" && score < 30 ? "high"
          : sentiment === "negative" ? "medium"
          : sentiment === "positive" && score > 75 ? "low"
          : "medium";

        // Determine display source label from URL for UI clarity
        const displaySource = result.url.includes("glassdoor.com") ? "glassdoor"
          : result.url.includes("indeed.com") ? "indeed"
          : result.url.includes("comparably.com") ? "comparably"
          : result.url.includes("reddit.com") ? "reddit"
          : src.source;

        const id = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await storage.createCultureReview({
          id,
          source: displaySource,
          url: result.url,
          title: result.title.slice(0, 120),
          content: result.content.slice(0, 500),
          sentiment,
          sentimentScore: score,
          priority,
          status: "pending",
        });

        ingested++;
        existingUrls.add(result.url);
        log(`Culture review ingested [${displaySource}]: ${result.url}`, "tavily");
      }
    } catch (err) {
      log(`Culture scan error for "${src.source}" query: ${err}`, "tavily");
    }
  }

  if (ingested > 0) {
    await storage.addActivityEntry({
      type: "capture",
      description: `${ingested} new culture review${ingested > 1 ? "s" : ""} captured from open web search`,
      conversationId: null,
      userId: null,
      timestamp: new Date().toISOString(),
    });
  }

  log(`Culture scan complete — ${ingested} new reviews ingested`, "tavily");
  return { ingested };
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
    // Pass lastRunAt so manual scans also only fetch content newer than the previous scan
    const sinceDate = schedulerState.lastRunAt ?? undefined;
    await runTavilyRefresh(brands, keywords, apiKey, sinceDate);
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
