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
  async seedIfNeeded(brands: string[]) {
    const res = await this.pool.query(
      "SELECT value FROM db_meta WHERE key = 'seeded'"
    );
    if (res.rows.length > 0) return; // already seeded

    const b0 = brands[0] ?? "Brand A";
    const b1 = brands[1] ?? "Brand B";
    const b2 = brands[2] ?? "Brand C";
    const b3 = brands[3] ?? "Brand D";

    const now = Date.now();

    // Conversations
    const seedConvs = [
      {
        id: "c1", platform: "twitter", author_handle: "@snackfan_maya", author_name: "Maya Torres",
        content: `Just cracked open a bag of ${b0} and honestly this might be the best chip I've had all year. The crunch is unreal 🔥 #snacks #chiplife`,
        url: "https://twitter.com/snackfan_maya/status/1",
        published_at: new Date(now - 2 * 3600000).toISOString(),
        sentiment: "positive", sentiment_score: 87, priority: "high", status: "pending",
        brand_mentions: [b0], tags: ["testimonial", "taste", "organic"],
        engagement_count: 142, flagged_reason: "High engagement positive mention", assigned_to: null,
        created_at: new Date(now - 2 * 3600000).toISOString(),
      },
      {
        id: "c2", platform: "reddit", author_handle: "u/chip_ranking_guy", author_name: "chip_ranking_guy",
        content: `Ranked every chip brand I could find: ${b0} vs ${b1} vs ${b2}. ${b0} wins on classic flavor, ${b1} edges it out on seasoning variety. ${b2} is underrated imo.`,
        url: "https://reddit.com/r/snacks/comments/abc",
        published_at: new Date(now - 5 * 3600000).toISOString(),
        sentiment: "neutral", sentiment_score: 55, priority: "medium", status: "in_review",
        brand_mentions: [b0, b1, b2], tags: ["ranking", "comparison", "competitor"],
        engagement_count: 89, flagged_reason: "Multi-brand comparison thread", assigned_to: "reviewer-1",
        created_at: new Date(now - 5 * 3600000).toISOString(),
      },
      {
        id: "c3", platform: "linkedin", author_handle: "james-liu-retail", author_name: "James Liu",
        content: `Category manager perspective: ${b0} has been one of our top shelf performers for three straight quarters. Strong velocity, minimal returns, and the brand loyalty data is impressive.`,
        url: "https://linkedin.com/posts/james-liu-retail",
        published_at: new Date(now - 8 * 3600000).toISOString(),
        sentiment: "positive", sentiment_score: 94, priority: "high", status: "pending",
        brand_mentions: [b0], tags: ["retail", "CPG", "endorsement", "professional"],
        engagement_count: 312, flagged_reason: "Professional endorsement — high authority", assigned_to: null,
        created_at: new Date(now - 8 * 3600000).toISOString(),
      },
      {
        id: "c4", platform: "twitter", author_handle: "@enviro_watch", author_name: "Enviro Watch",
        content: `Thread on plastic packaging in the snack industry: ${b0} pledged 30% recycled content in bags by 2025, but latest supplier audits show only 11% compliance. When will snack brands get serious about packaging? 🧵`,
        url: "https://twitter.com/enviro_watch/status/2",
        published_at: new Date(now - 12 * 3600000).toISOString(),
        sentiment: "negative", sentiment_score: 21, priority: "high", status: "pending",
        brand_mentions: [b0], tags: ["sustainability", "packaging", "criticism"],
        engagement_count: 567, flagged_reason: "Negative sustainability criticism — high reach", assigned_to: null,
        created_at: new Date(now - 12 * 3600000).toISOString(),
      },
      {
        id: "c5", platform: "blog", author_handle: "snack-obsessed-blog", author_name: "Snack Obsessed",
        content: `We taste-tested 12 salty snack brands this quarter. ${b0} topped our rankings for crunch factor and bold seasoning. ${b3} came in second for value and variety.`,
        url: "https://snackobsessed.com/chip-rankings-2026",
        published_at: new Date(now - 24 * 3600000).toISOString(),
        sentiment: "positive", sentiment_score: 79, priority: "medium", status: "pending",
        brand_mentions: [b0, b3], tags: ["review", "ranking", "press"],
        engagement_count: 204, flagged_reason: "Press mention — top snack ranking", assigned_to: null,
        created_at: new Date(now - 24 * 3600000).toISOString(),
      },
      {
        id: "c6", platform: "twitter", author_handle: "@snackrun_jane", author_name: "Jane from Portland",
        content: `Why is ${b0} always out of stock at my grocery store?? I've been hunting for that BBQ flavor for two weeks. ${b1} is my backup but the crunch just isn't the same.`,
        url: "https://twitter.com/snackrun_jane/status/3",
        published_at: new Date(now - 36 * 3600000).toISOString(),
        sentiment: "negative", sentiment_score: 38, priority: "low", status: "dismissed",
        brand_mentions: [b0, b1], tags: ["availability", "retail", "stock"],
        engagement_count: 18, flagged_reason: "Supply / availability complaint", assigned_to: null,
        created_at: new Date(now - 36 * 3600000).toISOString(),
      },
    ];

    for (const c of seedConvs) {
      await this.pool.query(
        `INSERT INTO conversations (id, platform, author_handle, author_name, content, url, published_at, sentiment, sentiment_score, priority, status, brand_mentions, tags, engagement_count, flagged_reason, assigned_to, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING`,
        [c.id, c.platform, c.author_handle, c.author_name, c.content, c.url, c.published_at, c.sentiment, c.sentiment_score, c.priority, c.status, c.brand_mentions, c.tags, c.engagement_count, c.flagged_reason, c.assigned_to, c.created_at]
      );
    }

    // Draft replies
    const genAt = (msAgo: number) => new Date(now - msAgo).toISOString();
    const seedDrafts = [
      { id: "d1", conversation_id: "c3", content: `Thank you, James — insights like yours from the category management side mean a lot to us. We'd love to share this perspective with our team.`, status: "awaiting", generated_at: genAt(7 * 3600000), reviewed_at: null, reviewed_by: null, review_note: null },
      { id: "d2", conversation_id: "c1", content: `This made our day, Maya! Nothing better than finding your go-to chip. We're so glad we've earned that crunch seal of approval. 🔥`, status: "approved", generated_at: genAt(90 * 60000), reviewed_at: genAt(60 * 60000), reviewed_by: "reviewer-1", review_note: null },
      { id: "d3", conversation_id: "c4", content: `We appreciate you holding us to our commitments. You're right that we've fallen short of our 2025 packaging target. We're publishing a full transparency report this quarter.`, status: "awaiting", generated_at: genAt(11 * 3600000), reviewed_at: null, reviewed_by: null, review_note: null },
    ];

    for (const d of seedDrafts) {
      await this.pool.query(
        `INSERT INTO draft_replies (id, conversation_id, content, status, generated_at, reviewed_at, reviewed_by, review_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [d.id, d.conversation_id, d.content, d.status, d.generated_at, d.reviewed_at, d.reviewed_by, d.review_note]
      );
    }

    // Knowledge
    const seedKnowledge = [
      { id: "k1", title: "Brand Origin & Heritage", category: "Brand Story", content: `${b0} has roots going back decades as a beloved American snack brand. Built on the promise of real ingredients, honest flavors, and the perfect crunch.`, tags: ["origin", "heritage", "mission"] },
      { id: "k2", title: "Sustainability Commitments", category: "Sustainability", content: `We are committed to 100% recycled packaging by 2026, carbon neutrality by 2030, and zero water waste in our facilities. Our sustainability report is published annually.`, tags: ["sustainability", "packaging", "carbon"] },
      { id: "k3", title: "Response Template — Criticism", category: "Response Templates", content: `For critical conversations, acknowledge the concern genuinely, provide specific facts, share what we're doing to improve, and offer a direct contact for follow-up. Never be defensive.`, tags: ["response", "crisis", "template"] },
      { id: "k4", title: "Product Line & Flavors", category: "Product Facts", content: `${b0} offers a wide range of snack products including original, BBQ, cheddar, salt & vinegar, sour cream & onion, and limited-edition seasonal flavors. Gluten-free and reduced-sodium varieties available.`, tags: ["products", "flavors", "SKUs", "portfolio"] },
      { id: "k5", title: "Response Template — Influencer Outreach", category: "Response Templates", content: `When a health professional or influencer praises the brand, respond warmly and offer to connect them with our brand partnership team. Always ask permission before featuring their content.`, tags: ["influencer", "outreach", "template"] },
    ];

    const ts = new Date().toISOString();
    for (const k of seedKnowledge) {
      await this.pool.query(
        `INSERT INTO knowledge_entries (id, title, category, content, tags, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [k.id, k.title, k.category, k.content, k.tags, ts, ts]
      );
    }

    // Activity
    const seedActivity = [
      { id: "a1", type: "capture", description: "12 new conversations captured via web search", conversation_id: null, user_id: null, timestamp: genAt(10 * 60000) },
      { id: "a2", type: "review", description: "Conversation c2 moved to In Review", conversation_id: "c2", user_id: "reviewer-1", timestamp: genAt(25 * 60000) },
      { id: "a3", type: "reply", description: "Draft reply approved for c1", conversation_id: "c1", user_id: "reviewer-1", timestamp: genAt(55 * 60000) },
      { id: "a4", type: "knowledge_update", description: "Knowledge entry 'Product Line & Flavors' updated", conversation_id: null, user_id: "admin-1", timestamp: genAt(2 * 3600000) },
    ];

    for (const a of seedActivity) {
      await this.pool.query(
        `INSERT INTO activity_log (id, type, description, conversation_id, user_id, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [a.id, a.type, a.description, a.conversation_id, a.user_id, a.timestamp]
      );
    }

    // Team
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

    // Culture reviews
    const seedCulture = [
      { id: "cr1", source: "glassdoor", url: "https://www.glassdoor.com/Reviews/review-1.htm", title: `${b0} - Great place to work if you love snacks`, content: `I've worked at ${b0} for 3 years. Management is supportive, benefits are solid, and there's real room for growth. Recommend.`, sentiment: "positive", sentiment_score: 82, priority: "low", status: "pending", captured_at: genAt(4 * 3600000) },
      { id: "cr2", source: "indeed", url: "https://www.indeed.com/cmp/review-2", title: `${b0} - Warehouse conditions need improvement`, content: `Pay is okay but the warehouse in the summer is brutal. No AC in the packing area. HR has been promising fixes for two years.`, sentiment: "negative", sentiment_score: 22, priority: "high", status: "pending", captured_at: genAt(8 * 3600000) },
      { id: "cr3", source: "comparably", url: "https://www.comparably.com/companies/review-3", title: `${b0} - CEO approval and culture scores`, content: `Culture score: B+. CEO approval: 71%. Employees rate work-life balance as above average for CPG industry. Leadership transparency could improve.`, sentiment: "neutral", sentiment_score: 55, priority: "medium", status: "pending", captured_at: genAt(12 * 3600000) },
      { id: "cr4", source: "glassdoor", url: "https://www.glassdoor.com/Reviews/review-4.htm", title: `${b0} - Poor communication from upper management`, content: `Decisions made at the top with no explanation to middle management or staff. Found out about a major restructuring through the rumor mill.`, sentiment: "negative", sentiment_score: 18, priority: "high", status: "pending", captured_at: genAt(20 * 3600000) },
      { id: "cr5", source: "indeed", url: "https://www.indeed.com/cmp/review-5", title: `${b0} - Solid entry-level brand, learned a lot`, content: `Good training programs for new hires. The brand is strong enough that it looks great on a resume. Moved on after 2 years for better pay but no hard feelings.`, sentiment: "positive", sentiment_score: 74, priority: "low", status: "noted", captured_at: genAt(30 * 3600000) },
    ];

    for (const cr of seedCulture) {
      await this.pool.query(
        `INSERT INTO culture_reviews (id, source, url, title, content, sentiment, sentiment_score, priority, status, captured_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [cr.id, cr.source, cr.url, cr.title, cr.content, cr.sentiment, cr.sentiment_score, cr.priority, cr.status, cr.captured_at]
      );
    }

    // Mark seeded
    await this.pool.query(
      `INSERT INTO db_meta (key, value) VALUES ('seeded', 'true') ON CONFLICT DO NOTHING`
    );

    console.log("[PgStorage] Database seeded successfully");
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
