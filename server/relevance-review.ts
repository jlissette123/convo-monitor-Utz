/**
 * Relevance review of conversations that are already stored.
 *
 * New search results are screened before they are saved (see tavily.ts).
 * Conversations captured before that screen existed were never checked. This
 * module runs the same screen over stored conversations and records one verdict
 * per conversation, so the results can be reviewed before anything is removed.
 *
 * It never deletes or changes a conversation. It only writes to its own
 * `relevance_reviews` table.
 *
 * The review is switched off unless ADMIN_TOKEN is set (24+ characters). Every
 * request must send that value in the `x-admin-token` header. It also needs
 * Postgres (DATABASE_URL) and ANTHROPIC_API_KEY.
 *
 * A verdict is only recorded when it is certain:
 *   - "llm"             Claude Haiku returned a readable verdict
 *   - "blocked-domain"  the URL is on the store/marketplace blocklist
 *   - "blocked-content" the text matches the contamination blocklist
 * When the Claude call fails, nothing is recorded for that conversation — the
 * keyword fallback used by live scans is deliberately not used here.
 */

import type { Express, Request, Response } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { getPool } from "./db";
import { getStorage } from "./storage";
import { getBrandConfigFromProcess } from "@shared/brand-config";
import { isBlockedDomain, isContaminatedContent, screenMentionStrict } from "./tavily";

// Use console.log directly here to avoid a circular import with index.ts
const log = (msg: string) =>
  console.log(
    `${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })} [relevance-review] ${msg}`,
  );

/** Version of the screening rules a verdict was made with (the prompt last changed in 2.1.8). */
const SCREEN_VERSION = "2.1.8";
const MIN_TOKEN_LENGTH = 24;
const MAX_CONCURRENCY = 8;
const MAX_ATTEMPTS = 5;
/** Stop the whole run after this many conversations in a row could not be screened. */
const MAX_CONSECUTIVE_FAILURES = 20;
const MAX_PAGE_SIZE = 5000;

type VerdictSource = "llm" | "blocked-domain" | "blocked-content";

interface ReviewState {
  running: boolean;
  stopRequested: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdBefore: string | null;
  concurrency: number;
  /** Conversations selected for this run. */
  total: number;
  /** Conversations finished in this run (verdict recorded, skipped or failed). */
  processed: number;
  relevant: number;
  notRelevant: number;
  /** Conversations with no text to judge — no verdict recorded. */
  skippedEmpty: number;
  /** Conversations where the screener gave no verdict — nothing recorded. */
  failed: number;
  inputTokens: number;
  outputTokens: number;
  rateLimit: string | null;
  lastError: string | null;
  stoppedBecause: string | null;
}

const state: ReviewState = {
  running: false,
  stopRequested: false,
  startedAt: null,
  finishedAt: null,
  createdBefore: null,
  concurrency: 0,
  total: 0,
  processed: 0,
  relevant: 0,
  notRelevant: 0,
  skippedEmpty: 0,
  failed: 0,
  inputTokens: 0,
  outputTokens: 0,
  rateLimit: null,
  lastError: null,
  stoppedBecause: null,
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  // Compare digests so the comparison takes the same time for any input length
  return timingSafeEqual(Buffer.from(sha256(provided), "hex"), Buffer.from(sha256(expected), "hex"));
}

/** The text the screener judges — the same shape live scans use: title, snippet, source URL. */
export function screeningText(c: { authorName: string; content: string; url: string }): string {
  return `${`${c.authorName} ${c.content}`.slice(0, 800)}\nSource: ${c.url}`;
}

let tableReady: Promise<void> | null = null;

/** Creates the verdict table the first time the review is used. */
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = getPool()!
      .query(`
        CREATE TABLE IF NOT EXISTS relevance_reviews (
          conversation_id TEXT PRIMARY KEY,
          relevant BOOLEAN NOT NULL,
          brand TEXT,
          reason TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL,
          screen_version TEXT NOT NULL,
          text_hash TEXT NOT NULL,
          reviewed_at TEXT NOT NULL
        );
      `)
      .then(() => undefined)
      .catch(err => {
        tableReady = null; // try again on the next request
        throw err;
      });
  }
  return tableReady;
}

async function saveVerdict(
  conversationId: string,
  verdict: { relevant: boolean; brand: string | null; reason: string; source: VerdictSource },
  textHash: string,
): Promise<void> {
  await getPool()!.query(
    `INSERT INTO relevance_reviews (conversation_id, relevant, brand, reason, source, screen_version, text_hash, reviewed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (conversation_id) DO UPDATE SET
       relevant = EXCLUDED.relevant, brand = EXCLUDED.brand, reason = EXCLUDED.reason, source = EXCLUDED.source,
       screen_version = EXCLUDED.screen_version, text_hash = EXCLUDED.text_hash, reviewed_at = EXCLUDED.reviewed_at`,
    [
      conversationId,
      verdict.relevant,
      verdict.brand,
      verdict.reason.slice(0, 500),
      verdict.source,
      SCREEN_VERSION,
      textHash,
      new Date().toISOString(),
    ],
  );
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface StartOptions {
  /** Only conversations created before this moment (epoch ms) are reviewed. */
  createdBeforeMs: number;
  ids?: string[];
  concurrency: number;
  limit?: number;
  /** Screen again even when a verdict is already recorded. */
  redo: boolean;
}

async function runReview(options: StartOptions, apiKey: string): Promise<void> {
  const cfg = getBrandConfigFromProcess();
  const ctx = { brands: cfg.monitoredBrands, keywords: cfg.monitoredKeywords ?? [] };

  const all = await getStorage().getConversations();
  const wanted = options.ids ? new Set(options.ids) : null;
  const reviewed = options.redo
    ? new Set<string>()
    : new Set<string>(
        (
          await getPool()!.query("SELECT conversation_id FROM relevance_reviews WHERE screen_version = $1", [SCREEN_VERSION])
        ).rows.map(r => r.conversation_id),
      );

  let queue = all
    .filter(c => {
      // Compare as moments in time — the stored strings are not safe to compare as text
      const createdMs = Date.parse(c.createdAt);
      return !Number.isNaN(createdMs) && createdMs < options.createdBeforeMs;
    })
    .filter(c => !wanted || wanted.has(c.id))
    .filter(c => !reviewed.has(c.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (options.limit !== undefined) queue = queue.slice(0, options.limit);

  state.total = queue.length;
  log(`Reviewing ${queue.length} stored conversations created before ${new Date(options.createdBeforeMs).toISOString()} (${options.concurrency} at a time)`);

  let next = 0;
  let pauseUntil = 0;
  let consecutiveFailures = 0;

  const stop = (why: string) => {
    if (!state.stoppedBecause) {
      state.stoppedBecause = why;
      log(`Stopping: ${why}`);
    }
    state.stopRequested = true;
  };

  /** Returns false when the run was stopped before this conversation was dealt with. */
  async function reviewOne(c: (typeof queue)[number]): Promise<boolean> {
    if (!c.content.trim()) {
      state.skippedEmpty++;
      return true;
    }
    const text = screeningText(c);
    const textHash = sha256(text);

    if (isBlockedDomain(c.url)) {
      await saveVerdict(c.id, { relevant: false, brand: null, reason: "Store or marketplace listing domain", source: "blocked-domain" }, textHash);
      state.notRelevant++;
      return true;
    }
    if (isContaminatedContent(text)) {
      await saveVerdict(c.id, { relevant: false, brand: null, reason: "Matches the content blocklist", source: "blocked-content" }, textHash);
      state.notRelevant++;
      return true;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Wait out any pause in short steps so a stop request or a longer pause is noticed,
      // with a little jitter so the workers do not all resume in the same instant
      while (!state.stopRequested) {
        const wait = pauseUntil - Date.now();
        if (wait <= 0) break;
        await sleep(Math.min(wait, 1000) + Math.random() * 250);
      }
      if (state.stopRequested) return false;

      const outcome = await screenMentionStrict(text, ctx, apiKey);
      if (outcome.kind === "verdict") {
        const { relevant, brand, reason } = outcome.assessment;
        await saveVerdict(c.id, { relevant, brand, reason, source: "llm" }, textHash);
        if (relevant) state.relevant++;
        else state.notRelevant++;
        state.inputTokens += outcome.usage.inputTokens;
        state.outputTokens += outcome.usage.outputTokens;
        if (outcome.rateLimit) state.rateLimit = outcome.rateLimit;
        consecutiveFailures = 0;
        return true;
      }

      state.lastError = `${outcome.message} (conversation ${c.id})`;
      // A rejected key, missing permission or unknown model will fail every time
      if ([400, 401, 403, 404].includes(outcome.status)) {
        stop(outcome.message);
        break;
      }
      // An unreadable reply is not a capacity problem — try once more, without slowing the others
      if (outcome.status === 200) {
        if (attempt >= 2) break;
        continue;
      }
      // Rate limit, overload or network trouble — pause every worker, then retry
      const backoff = outcome.retryAfterMs ?? Math.min(60_000, 2_000 * 2 ** (attempt - 1));
      pauseUntil = Math.max(pauseUntil, Date.now() + backoff);
    }

    state.failed++;
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      stop(`${MAX_CONSECUTIVE_FAILURES} conversations in a row could not be screened`);
    }
    return true;
  }

  async function worker(): Promise<void> {
    while (!state.stopRequested) {
      const index = next++;
      if (index >= queue.length) return;
      try {
        if (!(await reviewOne(queue[index]))) return;
      } catch (err) {
        state.failed++;
        state.lastError = `${err} (conversation ${queue[index].id})`;
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) stop(`Repeated errors: ${err}`);
      }
      state.processed++;
      if (state.processed % 500 === 0) {
        log(`${state.processed}/${state.total} reviewed — ${state.relevant} genuine, ${state.notRelevant} not, ${state.failed} failed`);
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  log(
    `Review ${state.stoppedBecause ? "stopped" : "finished"}: ${state.processed}/${state.total} reviewed — ${state.relevant} genuine, ${state.notRelevant} not, ${state.skippedEmpty} empty, ${state.failed} failed`,
  );
}

export function registerRelevanceReviewRoutes(app: Express): void {
  const adminToken = (process.env.ADMIN_TOKEN ?? "").trim();
  if (adminToken.length < MIN_TOKEN_LENGTH) return; // switched off

  const guard = (req: Request, res: Response): boolean => {
    if (!tokenMatches(req.header("x-admin-token"), adminToken)) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    if (!getPool()) {
      res.status(503).json({ error: "The relevance review needs Postgres storage" });
      return false;
    }
    return true;
  };

  app.post("/api/admin/relevance-review/start", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY is not set" });
      if (state.running) return res.status(409).json({ error: "A review is already running" });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const createdBeforeMs = typeof body.createdBefore === "string" ? Date.parse(body.createdBefore) : NaN;
      if (Number.isNaN(createdBeforeMs)) {
        return res.status(400).json({ error: "createdBefore (ISO date-time) is required" });
      }
      const createdBefore = new Date(createdBeforeMs).toISOString();
      // Without a real brand list the screener would reject every conversation
      const brands = getBrandConfigFromProcess().monitoredBrands ?? [];
      if (brands.length === 0 || (brands.length === 1 && brands[0] === "Your Brand")) {
        return res.status(503).json({ error: "No monitored brands are configured" });
      }
      let ids: string[] | undefined;
      if (body.ids !== undefined) {
        if (!Array.isArray(body.ids) || body.ids.some(id => typeof id !== "string")) {
          return res.status(400).json({ error: "ids must be an array of conversation ids" });
        }
        ids = body.ids as string[];
      }
      const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(Number(body.concurrency) || 2)));
      const limit =
        body.limit === undefined ? undefined : Math.max(0, Math.floor(Number(body.limit) || 0));

      await ensureTable();
      Object.assign(state, {
        running: true,
        stopRequested: false,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        createdBefore,
        concurrency,
        total: 0,
        processed: 0,
        relevant: 0,
        notRelevant: 0,
        skippedEmpty: 0,
        failed: 0,
        inputTokens: 0,
        outputTokens: 0,
        lastError: null,
        stoppedBecause: null,
      } satisfies Partial<ReviewState>);

      runReview({ createdBeforeMs, ids, concurrency, limit, redo: body.redo === true }, apiKey)
        .catch(err => {
          state.lastError = String(err);
          state.stoppedBecause = `Unexpected error: ${err}`;
          log(`Review failed: ${err}`);
        })
        .finally(() => {
          state.running = false;
          state.finishedAt = new Date().toISOString();
        });

      res.json({ started: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/admin/relevance-review/stop", (req, res) => {
    if (!guard(req, res)) return;
    if (state.running) {
      state.stopRequested = true;
      state.stoppedBecause = state.stoppedBecause ?? "Stopped on request";
    }
    res.json({ running: state.running, stopRequested: state.stopRequested });
  });

  app.get("/api/admin/relevance-review/status", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      await ensureTable();
      const counts = await getPool()!.query(
        "SELECT relevant, source, COUNT(*)::int AS count FROM relevance_reviews GROUP BY relevant, source ORDER BY relevant, source",
      );
      res.json({ run: state, recorded: counts.rows });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Recorded verdicts, oldest id first. Sent as text so the request log does not copy every row.
  app.get("/api/admin/relevance-review/results", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      await ensureTable();
      const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
      const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(Number(req.query.limit) || 1000)));
      const rows = await getPool()!.query(
        `SELECT conversation_id AS "conversationId", relevant, brand, reason, source,
                screen_version AS "screenVersion", text_hash AS "textHash", reviewed_at AS "reviewedAt"
         FROM relevance_reviews ORDER BY conversation_id LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      res.type("application/json").send(JSON.stringify({ offset, limit, rows: rows.rows }));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  log("Relevance review of stored conversations is available (ADMIN_TOKEN is set)");
}
