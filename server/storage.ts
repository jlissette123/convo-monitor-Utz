import type {
  Conversation, InsertConversation,
  DraftReply, InsertDraftReply,
  KnowledgeEntry, InsertKnowledgeEntry,
  ActivityEntry, TeamMember,
} from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface IStorage {
  // Conversations
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(c: InsertConversation): Promise<Conversation>;
  updateConversationStatus(id: string, status: string, assignedTo?: string): Promise<Conversation | undefined>;

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
function makeSeedConversations(brands: string[]): Conversation[] {
  const b0 = brands[0] ?? "Brand A";
  const b1 = brands[1] ?? "Brand B";
  const b2 = brands[2] ?? "Brand C";
  const b3 = brands[3] ?? "Brand D";

  return [
    {
      id: "c1",
      platform: "twitter",
      authorHandle: "@snackfan_maya",
      authorName: "Maya Torres",
      content: `Just cracked open a bag of ${b0} and honestly this might be the best chip I've had all year. The crunch is unreal 🔥 #snacks #chiplife`,
      url: "https://twitter.com/snackfan_maya/status/1",
      publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      sentiment: "positive",
      sentimentScore: 87,
      priority: "high",
      status: "pending",
      brandMentions: [b0],
      tags: ["testimonial", "taste", "organic"],
      engagementCount: 142,
      flaggedReason: "High engagement positive mention",
      assignedTo: null,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: "c2",
      platform: "reddit",
      authorHandle: "u/chip_ranking_guy",
      authorName: "chip_ranking_guy",
      content: `Ranked every chip brand I could find: ${b0} vs ${b1} vs ${b2}. ${b0} wins on classic flavor, ${b1} edges it out on seasoning variety. ${b2} is underrated imo. Full rankings in comments. [Discussion]`,
      url: "https://reddit.com/r/snacks/comments/abc",
      publishedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
      sentiment: "neutral",
      sentimentScore: 55,
      priority: "medium",
      status: "in_review",
      brandMentions: [b0, b1, b2],
      tags: ["ranking", "comparison", "competitor"],
      engagementCount: 89,
      flaggedReason: "Multi-brand comparison thread",
      assignedTo: "reviewer-1",
      createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    },
    {
      id: "c3",
      platform: "linkedin",
      authorHandle: "james-liu-retail",
      authorName: "James Liu",
      content: `Category manager perspective: ${b0} has been one of our top shelf performers for three straight quarters. Strong velocity, minimal returns, and the brand loyalty data is impressive. Worth noting for any CPG buyers watching this space.`,
      url: "https://linkedin.com/posts/james-liu-retail",
      publishedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
      sentiment: "positive",
      sentimentScore: 94,
      priority: "high",
      status: "pending",
      brandMentions: [b0],
      tags: ["retail", "CPG", "endorsement", "professional"],
      engagementCount: 312,
      flaggedReason: "Professional endorsement — high authority",
      assignedTo: null,
      createdAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    },
    {
      id: "c4",
      platform: "twitter",
      authorHandle: "@enviro_watch",
      authorName: "Enviro Watch",
      content: `Thread on plastic packaging in the snack industry: ${b0} pledged 30% recycled content in bags by 2025, but latest supplier audits show only 11% compliance. When will snack brands get serious about packaging? 🧵`,
      url: "https://twitter.com/enviro_watch/status/2",
      publishedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
      sentiment: "negative",
      sentimentScore: 21,
      priority: "high",
      status: "pending",
      brandMentions: [b0],
      tags: ["sustainability", "packaging", "criticism"],
      engagementCount: 567,
      flaggedReason: "Negative sustainability criticism — high reach",
      assignedTo: null,
      createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    },
    {
      id: "c5",
      platform: "blog",
      authorHandle: "snack-obsessed-blog",
      authorName: "Snack Obsessed",
      content: `We taste-tested 12 salty snack brands this quarter. ${b0} topped our rankings for crunch factor and bold seasoning. ${b3} came in second for value and variety. Full rankings inside.`,
      url: "https://snackobsessed.com/chip-rankings-2026",
      publishedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      sentiment: "positive",
      sentimentScore: 79,
      priority: "medium",
      status: "pending",
      brandMentions: [b0, b3],
      tags: ["review", "ranking", "press"],
      engagementCount: 204,
      flaggedReason: "Press mention — top snack ranking",
      assignedTo: null,
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    },
    {
      id: "c6",
      platform: "twitter",
      authorHandle: "@snackrun_jane",
      authorName: "Jane from Portland",
      content: `Why is ${b0} always out of stock at my grocery store?? I've been hunting for that BBQ flavor for two weeks. ${b1} is my backup but the crunch just isn't the same.`,
      url: "https://twitter.com/snackrun_jane/status/3",
      publishedAt: new Date(Date.now() - 36 * 3600000).toISOString(),
      sentiment: "negative",
      sentimentScore: 38,
      priority: "low",
      status: "dismissed",
      brandMentions: [b0, b1],
      tags: ["availability", "retail", "stock"],
      engagementCount: 18,
      flaggedReason: "Supply / availability complaint",
      assignedTo: null,
      createdAt: new Date(Date.now() - 36 * 3600000).toISOString(),
    },
  ];
}

function makeSeedDrafts(brands: string[]): DraftReply[] {
  const b0 = brands[0] ?? "Brand A";
  return [
    {
      id: "d1",
      conversationId: "c3",
      content: `Thank you, James — insights like yours from the category management side mean a lot to us. We'd love to share this perspective with our team. Feel free to reach out to our trade marketing team at partnerships@brand.com if you're open to connecting further.`,
      status: "awaiting",
      generatedAt: new Date(Date.now() - 7 * 3600000).toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
    },
    {
      id: "d2",
      conversationId: "c1",
      content: `This made our day, Maya! Nothing better than finding your go-to chip. We're so glad we've earned that crunch seal of approval. Tag us in your next snack haul — we'd love to feature you! 🔥`,
      status: "approved",
      generatedAt: new Date(Date.now() - 90 * 60000).toISOString(),
      reviewedAt: new Date(Date.now() - 60 * 60000).toISOString(),
      reviewedBy: "reviewer-1",
      reviewNote: null,
    },
    {
      id: "d3",
      conversationId: "c4",
      content: `We appreciate you holding us to our commitments. You're right that we've fallen short of our 2025 packaging target. We're publishing a full transparency report this quarter detailing our revised roadmap and the specific supply chain challenges we've encountered.`,
      status: "awaiting",
      generatedAt: new Date(Date.now() - 11 * 3600000).toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
    },
  ];
}

function makeSeedKnowledge(brands: string[]): KnowledgeEntry[] {
  const b0 = brands[0] ?? "Brand A";
  return [
    {
      id: "k1",
      title: "Brand Origin & Heritage",
      category: "Brand Story",
      content: `${b0} has roots going back decades as a beloved American snack brand. Built on the promise of real ingredients, honest flavors, and the perfect crunch, ${b0} continues to be a pantry staple for families across the country.`,
      tags: ["origin", "heritage", "mission"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "k2",
      title: "Sustainability Commitments",
      category: "Sustainability",
      content: `We are committed to 100% recycled packaging by 2026, carbon neutrality by 2030, and zero water waste in our bottling facilities. Our sustainability report is published annually.`,
      tags: ["sustainability", "packaging", "carbon"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "k3",
      title: "Response Template — Criticism",
      category: "Response Templates",
      content: `For critical conversations, acknowledge the concern genuinely, provide specific facts (not marketing language), share what we're doing to improve, and offer a direct contact for follow-up. Never be defensive.`,
      tags: ["response", "crisis", "template"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "k4",
      title: "Product Line & Flavors",
      category: "Product Facts",
      content: `${b0} offers a wide range of snack products including original, BBQ, cheddar, salt & vinegar, sour cream & onion, and limited-edition seasonal flavors. Gluten-free options and reduced-sodium varieties are available across select SKUs.`,
      tags: ["products", "flavors", "SKUs", "portfolio"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "k5",
      title: "Response Template — Influencer Outreach",
      category: "Response Templates",
      content: `When a health professional or influencer praises the brand, respond warmly and offer to connect them with our brand partnership team. Always ask permission before featuring their content.`,
      tags: ["influencer", "outreach", "template"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

// ── In-Memory Storage ─────────────────────────────────────────────────────────
export class MemoryStorage implements IStorage {
  private conversations: Map<string, Conversation> = new Map();
  private drafts: Map<string, DraftReply> = new Map();
  private knowledge: Map<string, KnowledgeEntry> = new Map();
  private activity: ActivityEntry[] = [];
  private team: TeamMember[] = [];

  constructor(brands: string[] = []) {
    // Seed conversations
    for (const c of makeSeedConversations(brands)) {
      this.conversations.set(c.id, c);
    }
    // Seed drafts
    for (const d of makeSeedDrafts(brands)) {
      this.drafts.set(d.id, d);
    }
    // Seed knowledge
    for (const k of makeSeedKnowledge(brands)) {
      this.knowledge.set(k.id, k);
    }
    // Seed activity
    this.activity = [
      { id: "a1", type: "capture", description: "12 new conversations captured via web search", conversationId: null, userId: null, timestamp: new Date(Date.now() - 10 * 60000).toISOString() },
      { id: "a2", type: "review", description: "Conversation c2 moved to In Review", conversationId: "c2", userId: "reviewer-1", timestamp: new Date(Date.now() - 25 * 60000).toISOString() },
      { id: "a3", type: "reply", description: "Draft reply approved for c1", conversationId: "c1", userId: "reviewer-1", timestamp: new Date(Date.now() - 55 * 60000).toISOString() },
      { id: "a4", type: "knowledge_update", description: "Knowledge entry 'Product Line & Flavors' updated", conversationId: null, userId: "admin-1", timestamp: new Date(Date.now() - 2 * 3600000).toISOString() },
    ];
    // Seed team
    this.team = [
      { id: "admin-1", name: "Admin User", email: "admin@brand.com", role: "admin", avatarInitials: "AU", isActive: true },
      { id: "reviewer-1", name: "Sam Rivera", email: "sam@brand.com", role: "reviewer", avatarInitials: "SR", isActive: true },
      { id: "viewer-1", name: "Jordan Lee", email: "jordan@brand.com", role: "viewer", avatarInitials: "JL", isActive: true },
    ];
  }

  private uid(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  async getConversations() { return Array.from(this.conversations.values()); }
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
export function initStorage(brands: string[] = []) {
  _storage = new MemoryStorage(brands);
}
