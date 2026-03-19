import type {
  Conversation, InsertConversation,
  DraftReply, InsertDraftReply,
  KnowledgeEntry, InsertKnowledgeEntry,
  ActivityEntry, TeamMember,
} from "@shared/schema";

// ── Culture Review type (separate from Conversation — never appears in main inbox) ──
export interface CultureReview {
  id: string;
  source: "glassdoor" | "indeed" | "comparably" | "news" | "reddit";  // employer review / culture signal source
  url: string;
  title: string;          // review headline / page title from Tavily
  content: string;        // review snippet
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number; // 0-100
  priority: "high" | "medium" | "low";
  status: "pending" | "in_review" | "noted" | "dismissed";
  capturedAt: string;     // ISO timestamp
}

export interface InsertCultureReview extends Omit<CultureReview, "capturedAt"> {}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface IStorage {
  // Conversations
  getConversations(filters?: {
    status?: string;
    platform?: string;
    brand?: string;
    priority?: string;
    search?: string;
    sentiment?: string;
  }): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(c: InsertConversation): Promise<Conversation>;
  updateConversationStatus(id: string, status: string, assignedTo?: string): Promise<Conversation | undefined>;
  deleteConversations(ids: string[]): Promise<number>;

  // Drafts
  getDraftReplies(): Promise<DraftReply[]>;
  getDraftRepliesForConversation(conversationId: string): Promise<DraftReply[]>;
  createDraftReply(d: InsertDraftReply): Promise<DraftReply>;
  updateDraftReply(id: string, data: Partial<DraftReply>): Promise<DraftReply | undefined>;

  // Knowledge Base
  getKnowledgeEntries(): Promise<KnowledgeEntry[]>;
  getKnowledgeEntry(id: string): Promise<KnowledgeEntry | undefined>;
  createKnowledgeEntry(e: InsertKnowledgeEntry): Promise<KnowledgeEntry>;
  updateKnowledgeEntry(id: string, data: Partial<KnowledgeEntry>): Promise<KnowledgeEntry | undefined>;
  deleteKnowledgeEntry(id: string): Promise<boolean>;

  // Activity
  getActivityLog(limit?: number): Promise<ActivityEntry[]>;
  addActivityEntry(entry: Omit<ActivityEntry, "id">): Promise<ActivityEntry>;

  // Team
  getTeamMembers(): Promise<TeamMember[]>;

  // Culture Monitor
  getCultureReviews(filters?: { status?: string; source?: string; sentiment?: string }): Promise<CultureReview[]>;
  getCultureReview(id: string): Promise<CultureReview | undefined>;
  createCultureReview(r: InsertCultureReview): Promise<CultureReview>;
  updateCultureReviewStatus(id: string, status: string): Promise<CultureReview | undefined>;
  deleteCultureReviews(ids: string[]): Promise<number>;
  getCultureStats(): Promise<{ total: number; negative: number; pending: number; sentimentBreakdown: { positive: number; neutral: number; negative: number }; sourceBreakdown: Record<string, number> }>;

  // Stats
  getStats(): Promise<{
    totalCaptures: number;
    awaitingReview: number;
    repliesSent: number;
    dismissed: number;
    sentimentBreakdown: { positive: number; neutral: number; negative: number };
    platformBreakdown: Record<string, number>;
    brandMentions: Record<string, number>;
  }>;
}

// ── Seed data ─────────────────────────────────────────────────────────────────
// No seed conversations, drafts, knowledge, or activity.
// All data is real — captured via Tavily scans only. Zero fake results.

// ── In-Memory Storage ─────────────────────────────────────────────────────────
// NOTE: No seed culture reviews — culture monitor starts empty and only shows
// real data captured via Tavily scans. Zero fake/placeholder results allowed.

export class MemoryStorage implements IStorage {
  private conversations: Map<string, Conversation> = new Map();
  private drafts: Map<string, DraftReply> = new Map();
  private knowledge: Map<string, KnowledgeEntry> = new Map();
  private activity: ActivityEntry[] = [];
  private team: TeamMember[] = [];
  private cultureReviews: Map<string, CultureReview> = new Map();

  constructor(_brands: string[] = []) {
    // All stores start empty — no fake/seed data.
    // Conversations, drafts, knowledge, and activity are populated by real Tavily scans.
    this.team = [
      { id: "admin-1", name: "Admin User", email: "admin@brand.com", role: "admin", avatarInitials: "AU", isActive: true },
      { id: "reviewer-1", name: "Sam Rivera", email: "sam@brand.com", role: "reviewer", avatarInitials: "SR", isActive: true },
      { id: "viewer-1", name: "Jordan Lee", email: "jordan@brand.com", role: "viewer", avatarInitials: "JL", isActive: true },
    ];
  }

  private uid(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  async getConversations(filters?: { status?: string; platform?: string; brand?: string; priority?: string; search?: string; sentiment?: string }) {
    let all = Array.from(this.conversations.values());
    if (filters?.status   && filters.status   !== "all") all = all.filter(c => c.status   === filters.status);
    if (filters?.platform && filters.platform !== "all") all = all.filter(c => c.platform === filters.platform);
    if (filters?.priority && filters.priority !== "all") all = all.filter(c => c.priority === filters.priority);
    if (filters?.sentiment && filters.sentiment !== "all") all = all.filter(c => c.sentiment === filters.sentiment);
    if (filters?.brand    && filters.brand    !== "all") all = all.filter(c => (c.brandMentions ?? []).includes(filters.brand!));
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      all = all.filter(c => c.content.toLowerCase().includes(q) || c.authorName.toLowerCase().includes(q));
    }
    return all;
  }
  async getConversation(id: string) { return this.conversations.get(id); }
  async createConversation(c: InsertConversation): Promise<Conversation> {
    const full: Conversation = { ...c, createdAt: new Date().toISOString() } as Conversation;
    this.conversations.set(full.id, full);
    return full;
  }
  async updateConversationStatus(id: string, status: string, assignedTo?: string) {
    const c = this.conversations.get(id);
    if (!c) return undefined;
    const updated = { ...c, status, assignedTo: assignedTo ?? c.assignedTo };
    this.conversations.set(id, updated);
    return updated;
  }
  async deleteConversations(ids: string[]) {
    let count = 0;
    for (const id of ids) { if (this.conversations.delete(id)) count++; }
    return count;
  }

  async getDraftReplies() { return Array.from(this.drafts.values()); }
  async getDraftRepliesForConversation(conversationId: string) {
    return Array.from(this.drafts.values()).filter(d => d.conversationId === conversationId);
  }
  async createDraftReply(d: InsertDraftReply): Promise<DraftReply> {
    const full: DraftReply = { ...d, generatedAt: new Date().toISOString() } as DraftReply;
    this.drafts.set(full.id, full);
    return full;
  }
  async updateDraftReply(id: string, data: Partial<DraftReply>) {
    const d = this.drafts.get(id);
    if (!d) return undefined;
    const updated = { ...d, ...data };
    this.drafts.set(id, updated);
    return updated;
  }

  async getKnowledgeEntries() { return Array.from(this.knowledge.values()); }
  async getKnowledgeEntry(id: string) { return this.knowledge.get(id); }
  async createKnowledgeEntry(e: InsertKnowledgeEntry): Promise<KnowledgeEntry> {
    const now = new Date().toISOString();
    const full: KnowledgeEntry = { ...e, createdAt: now, updatedAt: now } as KnowledgeEntry;
    this.knowledge.set(full.id, full);
    return full;
  }
  async updateKnowledgeEntry(id: string, data: Partial<KnowledgeEntry>) {
    const k = this.knowledge.get(id);
    if (!k) return undefined;
    const updated = { ...k, ...data, updatedAt: new Date().toISOString() };
    this.knowledge.set(id, updated);
    return updated;
  }
  async deleteKnowledgeEntry(id: string) {
    return this.knowledge.delete(id);
  }

  async getActivityLog(limit = 50) {
    return [...this.activity].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  }
  async addActivityEntry(entry: Omit<ActivityEntry, "id">) {
    const full: ActivityEntry = { id: this.uid(), ...entry };
    this.activity.unshift(full);
    return full;
  }

  async getTeamMembers() { return [...this.team]; }

  // ── Culture Reviews ───────────────────────────────────────────────────
  async getCultureReviews(filters?: { status?: string; source?: string; sentiment?: string }) {
    let all = Array.from(this.cultureReviews.values());
    if (filters?.status    && filters.status    !== "all") all = all.filter(r => r.status    === filters.status);
    if (filters?.source    && filters.source    !== "all") all = all.filter(r => r.source    === filters.source);
    if (filters?.sentiment && filters.sentiment !== "all") all = all.filter(r => r.sentiment === filters.sentiment);
    return all.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }
  async getCultureReview(id: string) { return this.cultureReviews.get(id); }
  async createCultureReview(r: InsertCultureReview): Promise<CultureReview> {
    const full: CultureReview = { ...r, capturedAt: new Date().toISOString() };
    this.cultureReviews.set(full.id, full);
    return full;
  }
  async updateCultureReviewStatus(id: string, status: string) {
    const r = this.cultureReviews.get(id);
    if (!r) return undefined;
    const updated = { ...r, status: status as CultureReview["status"] };
    this.cultureReviews.set(id, updated);
    return updated;
  }
  async deleteCultureReviews(ids: string[]) {
    let count = 0;
    for (const id of ids) { if (this.cultureReviews.delete(id)) count++; }
    return count;
  }
  async getCultureStats() {
    const all = Array.from(this.cultureReviews.values());
    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    const sources: Record<string, number> = {};
    for (const r of all) {
      sentiment[r.sentiment]++;
      sources[r.source] = (sources[r.source] ?? 0) + 1;
    }
    return {
      total: all.length,
      negative: sentiment.negative,
      pending: all.filter(r => r.status === "pending").length,
      sentimentBreakdown: sentiment,
      sourceBreakdown: sources,
    };
  }

  async getStats() {
    const convs = Array.from(this.conversations.values());
    const drafts = Array.from(this.drafts.values());
    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    const platforms: Record<string, number> = {};
    const brands: Record<string, number> = {};
    for (const c of convs) {
      sentiment[c.sentiment as keyof typeof sentiment]++;
      platforms[c.platform] = (platforms[c.platform] ?? 0) + 1;
      for (const b of (c.brandMentions ?? [])) {
        brands[b] = (brands[b] ?? 0) + 1;
      }
    }
    const total = convs.length;
    const pending = convs.filter(c => c.status === "pending").length;
    const replied = drafts.filter(d => d.status === "approved").length;
    const dismissed = convs.filter(c => c.status === "dismissed").length;
    const positiveRate = total > 0 ? Math.round((sentiment.positive / total) * 100) : 0;
    const totalEngagement = convs.reduce((sum, c) => sum + (c.engagementCount ?? 0), 0);
    return {
      // GlacialAI-compatible shape
      total,
      pending,
      inReview: convs.filter(c => c.status === "in_review").length,
      replied,
      dismissed,
      negative: sentiment.negative,
      positiveRate,
      totalEngagement,
      sentimentBreakdown: sentiment,
      platformBreakdown: platforms,
      brandBreakdown: brands,
      // Legacy aliases (keep for backward compat)
      totalCaptures: total,
      awaitingReview: pending,
      repliesSent: replied,
      brandMentions: brands,
    };
  }
}

// Singleton — initialized in server/index.ts after env vars are read
let _storage: IStorage | null = null;
export function getStorage(): IStorage {
  if (!_storage) throw new Error("Storage not initialized — call initStorage() first");
  return _storage;
}
// Pass an existing IStorage instance (e.g. PgStorage) or create a new MemoryStorage
export function initStorage(brands: string[] = [], instance?: IStorage) {
  _storage = instance ?? new MemoryStorage(brands);
}
