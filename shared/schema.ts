import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Conversations ───────────────────────────────────────────────────────────
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(), // twitter | reddit | linkedin | blog | news | other
  authorHandle: text("author_handle").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  url: text("url").notNull(),
  publishedAt: text("published_at").notNull(),
  sentiment: text("sentiment").notNull(), // positive | neutral | negative
  sentimentScore: integer("sentiment_score").notNull(), // 0-100
  priority: text("priority").notNull(), // high | medium | low
  status: text("status").notNull().default("pending"), // pending | in_review | replied | dismissed
  brandMentions: text("brand_mentions").array().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  engagementCount: integer("engagement_count").notNull().default(0),
  flaggedReason: text("flagged_reason"),
  assignedTo: text("assigned_to"),
  createdAt: text("created_at").notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// ─── Draft Replies ────────────────────────────────────────────────────────────
export const draftReplies = pgTable("draft_replies", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("awaiting"), // awaiting | approved | rejected
  generatedAt: text("generated_at").notNull(),
  reviewedAt: text("reviewed_at"),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
});

export const insertDraftReplySchema = createInsertSchema(draftReplies).omit({ generatedAt: true });
export type InsertDraftReply = z.infer<typeof insertDraftReplySchema>;
export type DraftReply = typeof draftReplies.$inferSelect;

// ─── Knowledge Base ───────────────────────────────────────────────────────────
export const knowledgeEntries = pgTable("knowledge_entries", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().notNull().default([]),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertKnowledgeEntrySchema = createInsertSchema(knowledgeEntries).omit({ createdAt: true, updatedAt: true });
export type InsertKnowledgeEntry = z.infer<typeof insertKnowledgeEntrySchema>;
export type KnowledgeEntry = typeof knowledgeEntries.$inferSelect;

// ─── Activity Log ─────────────────────────────────────────────────────────────
export const activityLog = pgTable("activity_log", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // capture | review | reply | dismiss | knowledge_update
  description: text("description").notNull(),
  conversationId: text("conversation_id"),
  userId: text("user_id"),
  timestamp: text("timestamp").notNull(),
});

export type ActivityEntry = typeof activityLog.$inferSelect;

// ─── Team Members ─────────────────────────────────────────────────────────────
export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(), // admin | reviewer | viewer
  avatarInitials: text("avatar_initials").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export type TeamMember = typeof teamMembers.$inferSelect;

// ─── Culture Reviews ──────────────────────────────────────────────────────────
export const cultureReviews = pgTable("culture_reviews", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),        // glassdoor | indeed | comparably
  url: text("url").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sentiment: text("sentiment").notNull(),  // positive | neutral | negative
  sentimentScore: integer("sentiment_score").notNull(),
  priority: text("priority").notNull(),   // high | medium | low
  status: text("status").notNull().default("pending"),
  capturedAt: text("captured_at").notNull(),
});

export const insertCultureReviewSchema = createInsertSchema(cultureReviews).omit({ capturedAt: true });
export type InsertCultureReviewSchema = z.infer<typeof insertCultureReviewSchema>;
export type CultureReviewRow = typeof cultureReviews.$inferSelect;
