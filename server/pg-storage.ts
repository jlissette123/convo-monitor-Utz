/**
 * PgStorage — PostgreSQL-backed implementation of IStorage.
 * Drops in as a replacement for MemoryStorage with zero API changes.
 * Seeds the database on first run (detected via db_meta table).
 */
import { Pool } from "pg";
import type {
  Conversation, InsertConversation,
  DraftReply, InsertDraftReply,
  KnowledgeEntry, InsertKnowledgeEntry,
  ActivityEntry, TeamMember,
} from "@shared/schema";
import type { IStorage, CultureReview, InsertCultureReview } from "./storage";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Row-to-type mappers ────────────────────────────────────────────────────────

function rowToConversation(r: any): Conversation {
  return {
    id: r.id,
    platform: r.platform,
    authorHandle: r.author_handle,
    authorName: r.author_name,
    content: r.content,
    url: r.url,
    publishedAt: r.published_at,
    sentiment: r.sentiment,
    sentimentScore: r.sentiment_score,
    priority: r.priority,
    status: r.status,
    brandMentions: r.brand_mentions ?? [],
    tags: r.tags ?? [],
    engagementCount: r.engagement_count,
    flaggedReason: r.flagged_reason ?? null,
    assignedTo: r.assigned_to ?? null,
    createdAt: r.created_at,
  };
}

function rowToDraft(r: any): DraftReply {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    content: r.content,
    status: r.status,
    generatedAt: r.generated_at,
    reviewedAt: r.reviewed_at ?? null,
    reviewedBy: r.reviewed_by ?? null,
    reviewNote: r.review_note ?? null,
  };
}

function rowToKnowledge(r: any): KnowledgeEntry {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    content: r.content,
    tags: r.tags ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToActivity(r: any): ActivityEntry {
  return {
    id: r.id,
    type: r.type,
    description: r.description,
    conversationId: r.conversation_id ?? null,
    userId: r.user_id ?? null,
    timestamp: r.timestamp,
  };
}

function rowToTeam(r: any): TeamMember {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    avatarInitials: r.avatar_initials,
    isActive: r.is_active,
  };
}

function rowToCultureReview(r: any): CultureReview {
  return {
    id: r.id,
    source: r.source,
    url: r.url,
    title: r.title,
    content: r.content,
    sentiment: r.sentiment,
    sentimentScore: r.sentiment_score,
    priority: r.priority,
    status: r.status,
    capturedAt: r.captured_at,
  };
}

// ── PgStorage ─────────────────────────────────────────────────────────────────

export class PgStorage implements IStorage {
  constructor(private pool: Pool) {}

  // ── Seed on first run ──────────────────────────────────────────────────────
  async seedIfNeeded(_brands: string[]) {
    const res = await this.pool.query(
      "SELECT value FROM db_meta WHERE key = 'seeded'"
    );
    if (res.rows.length > 0) return; // already initialized

    // Seed team members only (real app config, not fake data)
    const seedTeam = [
      { id: "admin-1", name: "Admin User", email: "admin@brand.com", role: "admin", avatar_initials: "AU", is_active: true },
      { id: "reviewer-1", name: "Sam Rivera", email: "sam@brand.com", role: "reviewer", avatar_initials: "SR", is_active: true },
      { id: "viewer-1", name: "Jordan Lee", email: "jordan@brand.com", role: "viewer", avatar_initials: "JL", is_active: true },
    ];

    for (const t of seedTeam) {
      await this.pool.query(
        `INSERT INTO team_members (id, name, email, role, avatar_initials, is_active)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [t.id, t.name, t.email, t.role, t.avatar_initials, t.is_active]
      );
    }

    // Culture reviews: no seeds — populated by real Tavily scans only.
    // Zero fake/placeholder results allowed.

    // Mark initialized
    await this.pool.query(
      `INSERT INTO db_meta (key, value) VALUES ('seeded', 'true') ON CONFLICT DO NOTHING`
    );

    console.log("[PgStorage] Database initialized successfully");
  }

  // ── Purge fake seed data from prior versions ────────────────────────────────
  // Called on every boot to remove any fabricated rows that may have been
  // inserted by older versions of the app. Safe to run repeatedly.
  async purgeFakeSeedData() {
    const fakeConvIds = ["c1", "c2", "c3", "c4", "c5", "c6"];
    const fakeDraftIds = ["d1", "d2", "d3"];
    const fakeKnowledgeIds = ["k1", "k2", "k3", "k4", "k5"];
    const fakeActivityIds = ["a1", "a2", "a3", "a4"];
    const fakeCultureIds = ["cr1", "cr2", "cr3", "cr4", "cr5"];

    const convRes = await this.pool.query(
      `DELETE FROM conversations WHERE id = ANY($1) RETURNING id`,
      [fakeConvIds]
    );
    const draftRes = await this.pool.query(
      `DELETE FROM draft_replies WHERE id = ANY($1) RETURNING id`,
      [fakeDraftIds]
    );
    const knowRes = await this.pool.query(
      `DELETE FROM knowledge_entries WHERE id = ANY($1) RETURNING id`,
      [fakeKnowledgeIds]
    );
    const actRes = await this.pool.query(
      `DELETE FROM activity_log WHERE id = ANY($1) RETURNING id`,
      [fakeActivityIds]
    );
    const cultRes = await this.pool.query(
      `DELETE FROM culture_reviews WHERE id = ANY($1) RETURNING id`,
      [fakeCultureIds]
    );

    const total = convRes.rowCount + draftRes.rowCount + knowRes.rowCount + actRes.rowCount + cultRes.rowCount;
    if (total > 0) {
      console.log(`[PgStorage] Purged ${total} fake seed rows (${convRes.rowCount} convs, ${draftRes.rowCount} drafts, ${knowRes.rowCount} knowledge, ${actRes.rowCount} activity, ${cultRes.rowCount} culture)`);
    }
  }

  // ── Conversations ──────────────────────────────────────────────────────────
  async getConversations(filters?: { status?: string; platform?: string; brand?: string; priority?: string; search?: string; sentiment?: string }) {
    let query = "SELECT * FROM conversations WHERE 1=1";
    const params: any[] = [];
    let i = 1;

    if (filters?.status && filters.status !== "all") { query += ` AND status = $${i++}`; params.push(filters.status); }
    if (filters?.platform && filters.platform !== "all") { query += ` AND platform = $${i++}`; params.push(filters.platform); }
    if (filters?.priority && filters.priority !== "all") { query += ` AND priority = $${i++}`; params.push(filters.priority); }
    if (filters?.sentiment && filters.sentiment !== "all") { query += ` AND sentiment = $${i++}`; params.push(filters.sentiment); }
    if (filters?.brand && filters.brand !== "all") { query += ` AND $${i++} = ANY(brand_mentions)`; params.push(filters.brand); }
    if (filters?.search) {
      query += ` AND (LOWER(content) LIKE $${i} OR LOWER(author_name) LIKE $${i})`;
      params.push(`%${filters.search.toLowerCase()}%`);
      i++;
    }

    query += " ORDER BY published_at DESC";
    const res = await this.pool.query(query, params);
    return res.rows.map(rowToConversation);
  }

  async getConversation(id: string) {
    const res = await this.pool.query("SELECT * FROM conversations WHERE id = $1", [id]);
    return res.rows[0] ? rowToConversation(res.rows[0]) : undefined;
  }

  async createConversation(c: InsertConversation): Promise<Conversation> {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO conversations (id, platform, author_handle, author_name, content, url, published_at, sentiment, sentiment_score, priority, status, brand_mentions, tags, engagement_count, flagged_reason, assigned_to, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [c.id, c.platform, c.authorHandle, c.authorName, c.content, c.url, c.publishedAt, c.sentiment, c.sentimentScore, c.priority, c.status ?? "pending", c.brandMentions ?? [], c.tags ?? [], c.engagementCount ?? 0, c.flaggedReason ?? null, c.assignedTo ?? null, now]
    );
    return (await this.getConversation(c.id))!;
  }

  async updateConversationStatus(id: string, status: string, assignedTo?: string) {
    const res = await this.pool.query(
      `UPDATE conversations SET status = $1${assignedTo !== undefined ? ", assigned_to = $3" : ""} WHERE id = $2 RETURNING *`,
      assignedTo !== undefined ? [status, id, assignedTo] : [status, id]
    );
    return res.rows[0] ? rowToConversation(res.rows[0]) : undefined;
  }

  // ── Drafts ─────────────────────────────────────────────────────────────────
  async getDraftReplies() {
    const res = await this.pool.query("SELECT * FROM draft_replies ORDER BY generated_at DESC");
    return res.rows.map(rowToDraft);
  }

  async getDraftRepliesForConversation(conversationId: string) {
    const res = await this.pool.query("SELECT * FROM draft_replies WHERE conversation_id = $1 ORDER BY generated_at DESC", [conversationId]);
    return res.rows.map(rowToDraft);
  }

  async createDraftReply(d: InsertDraftReply): Promise<DraftReply> {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO draft_replies (id, conversation_id, content, status, generated_at, reviewed_at, reviewed_by, review_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [d.id, d.conversationId, d.content, d.status ?? "awaiting", now, d.reviewedAt ?? null, d.reviewedBy ?? null, d.reviewNote ?? null]
    );
    const res = await this.pool.query("SELECT * FROM draft_replies WHERE id = $1", [d.id]);
    return rowToDraft(res.rows[0]);
  }

  async updateDraftReply(id: string, data: Partial<DraftReply>) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (data.status !== undefined)     { fields.push(`status = $${i++}`);      params.push(data.status); }
    if (data.content !== undefined)    { fields.push(`content = $${i++}`);     params.push(data.content); }
    if (data.reviewedAt !== undefined) { fields.push(`reviewed_at = $${i++}`); params.push(data.reviewedAt); }
    if (data.reviewedBy !== undefined) { fields.push(`reviewed_by = $${i++}`); params.push(data.reviewedBy); }
    if (data.reviewNote !== undefined) { fields.push(`review_note = $${i++}`); params.push(data.reviewNote); }
    if (fields.length === 0) return this.getDraftRepliesForConversation(id).then(r => r[0]);
    params.push(id);
    const res = await this.pool.query(`UPDATE draft_replies SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`, params);
    return res.rows[0] ? rowToDraft(res.rows[0]) : undefined;
  }

  // ── Knowledge Base ─────────────────────────────────────────────────────────
  async getKnowledgeEntries() {
    const res = await this.pool.query("SELECT * FROM knowledge_entries ORDER BY created_at DESC");
    return res.rows.map(rowToKnowledge);
  }

  async getKnowledgeEntry(id: string) {
    const res = await this.pool.query("SELECT * FROM knowledge_entries WHERE id = $1", [id]);
    return res.rows[0] ? rowToKnowledge(res.rows[0]) : undefined;
  }

  async createKnowledgeEntry(e: InsertKnowledgeEntry): Promise<KnowledgeEntry> {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO knowledge_entries (id, title, category, content, tags, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [e.id, e.title, e.category, e.content, e.tags ?? [], now, now]
    );
    return (await this.getKnowledgeEntry(e.id))!;
  }

  async updateKnowledgeEntry(id: string, data: Partial<KnowledgeEntry>) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (data.title !== undefined)    { fields.push(`title = $${i++}`);    params.push(data.title); }
    if (data.category !== undefined) { fields.push(`category = $${i++}`); params.push(data.category); }
    if (data.content !== undefined)  { fields.push(`content = $${i++}`);  params.push(data.content); }
    if (data.tags !== undefined)     { fields.push(`tags = $${i++}`);     params.push(data.tags); }
    fields.push(`updated_at = $${i++}`);
    params.push(new Date().toISOString());
    params.push(id);
    const res = await this.pool.query(`UPDATE knowledge_entries SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`, params);
    return res.rows[0] ? rowToKnowledge(res.rows[0]) : undefined;
  }

  async deleteKnowledgeEntry(id: string) {
    const res = await this.pool.query("DELETE FROM knowledge_entries WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // ── Activity Log ───────────────────────────────────────────────────────────
  async getActivityLog(limit = 50) {
    const res = await this.pool.query("SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT $1", [limit]);
    return res.rows.map(rowToActivity);
  }

  async addActivityEntry(entry: Omit<ActivityEntry, "id">) {
    const id = uid();
    await this.pool.query(
      `INSERT INTO activity_log (id, type, description, conversation_id, user_id, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, entry.type, entry.description, entry.conversationId ?? null, entry.userId ?? null, entry.timestamp]
    );
    return { id, ...entry } as ActivityEntry;
  }

  // ── Team ───────────────────────────────────────────────────────────────────
  async getTeamMembers() {
    const res = await this.pool.query("SELECT * FROM team_members");
    return res.rows.map(rowToTeam);
  }

  // ── Culture Reviews ────────────────────────────────────────────────────────
  async getCultureReviews(filters?: { status?: string; source?: string; sentiment?: string }) {
    let query = "SELECT * FROM culture_reviews WHERE 1=1";
    const params: any[] = [];
    let i = 1;
    if (filters?.status    && filters.status    !== "all") { query += ` AND status = $${i++}`;    params.push(filters.status); }
    if (filters?.source    && filters.source    !== "all") { query += ` AND source = $${i++}`;    params.push(filters.source); }
    if (filters?.sentiment && filters.sentiment !== "all") { query += ` AND sentiment = $${i++}`; params.push(filters.sentiment); }
    query += " ORDER BY captured_at DESC";
    const res = await this.pool.query(query, params);
    return res.rows.map(rowToCultureReview);
  }

  async getCultureReview(id: string) {
    const res = await this.pool.query("SELECT * FROM culture_reviews WHERE id = $1", [id]);
    return res.rows[0] ? rowToCultureReview(res.rows[0]) : undefined;
  }

  async createCultureReview(r: InsertCultureReview): Promise<CultureReview> {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO culture_reviews (id, source, url, title, content, sentiment, sentiment_score, priority, status, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [r.id, r.source, r.url, r.title, r.content, r.sentiment, r.sentimentScore, r.priority, r.status ?? "pending", now]
    );
    return (await this.getCultureReview(r.id))!;
  }

  async updateCultureReviewStatus(id: string, status: string) {
    const res = await this.pool.query(
      "UPDATE culture_reviews SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );
    return res.rows[0] ? rowToCultureReview(res.rows[0]) : undefined;
  }

  async getCultureStats() {
    const res = await this.pool.query("SELECT sentiment, source, status FROM culture_reviews");
    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    const sources: Record<string, number> = {};
    let pending = 0;
    for (const r of res.rows) {
      sentiment[r.sentiment as keyof typeof sentiment]++;
      sources[r.source] = (sources[r.source] ?? 0) + 1;
      if (r.status === "pending") pending++;
    }
    return {
      total: res.rows.length,
      negative: sentiment.negative,
      pending,
      sentimentBreakdown: sentiment,
      sourceBreakdown: sources,
    };
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  async getStats() {
    const convRes = await this.pool.query("SELECT sentiment, platform, status, brand_mentions, engagement_count FROM conversations");
    const draftRes = await this.pool.query("SELECT status FROM draft_replies");

    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    const platforms: Record<string, number> = {};
    const brands: Record<string, number> = {};
    let pending = 0, inReview = 0, dismissed = 0, totalEngagement = 0;

    for (const c of convRes.rows) {
      sentiment[c.sentiment as keyof typeof sentiment]++;
      platforms[c.platform] = (platforms[c.platform] ?? 0) + 1;
      for (const b of (c.brand_mentions ?? [])) {
        brands[b] = (brands[b] ?? 0) + 1;
      }
      if (c.status === "pending") pending++;
      if (c.status === "in_review") inReview++;
      if (c.status === "dismissed") dismissed++;
      totalEngagement += c.engagement_count ?? 0;
    }

    const total = convRes.rows.length;
    const replied = draftRes.rows.filter(d => d.status === "approved").length;
    const positiveRate = total > 0 ? Math.round((sentiment.positive / total) * 100) : 0;

    return {
      total, pending, inReview, replied, dismissed,
      negative: sentiment.negative, positiveRate, totalEngagement,
      sentimentBreakdown: sentiment,
      platformBreakdown: platforms,
      brandBreakdown: brands,
      totalCaptures: total,
      awaitingReview: pending,
      repliesSent: replied,
      brandMentions: brands,
    };
  }
}
