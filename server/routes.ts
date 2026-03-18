import type { Express } from "express";
import type { Server } from "http";
import nodemailer from "nodemailer";
import { getStorage } from "./storage";
import { getBrandConfigFromProcess } from "@shared/brand-config";
import { generateAIDraft, schedulerState, triggerManualRefresh, runCultureScan } from "./tavily";

export function registerRoutes(httpServer: Server, app: Express) {
  const cfg = getBrandConfigFromProcess();

  // ── Brand Config ─────────────────────────────────────────────────────────
  app.get("/api/brand-config", (_req, res) => {
    // Never expose sensitive keys — return only what the frontend needs
    res.json({
      name: cfg.name,
      tagline: cfg.tagline,
      logoUrl: cfg.logoUrl,
      faviconUrl: cfg.faviconUrl,
      primary: cfg.primary,
      darkPrimary: cfg.darkPrimary,
      monitoredBrands: cfg.monitoredBrands,
      monitoredKeywords: cfg.monitoredKeywords,
      fontHeading: cfg.fontHeading,
      fontBody: cfg.fontBody,
      supportEmail: cfg.supportEmail,
      privacyUrl: cfg.privacyUrl,
      termsUrl: cfg.termsUrl,
      platformDomain: cfg.platformDomain,
    });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await getStorage().getStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Conversations ─────────────────────────────────────────────────────────
  app.get("/api/conversations", async (req, res) => {
    try {
      const { status, platform, brand, priority, search, sentiment } = req.query as Record<string, string>;
      const list = await getStorage().getConversations({ status, platform, brand, priority, search, sentiment });
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const item = await getStorage().getConversation(req.params.id);
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.patch("/api/conversations/:id/status", async (req, res) => {
    try {
      const { status, assignedTo } = req.body as { status: string; assignedTo?: string };
      const updated = await getStorage().updateConversationStatus(req.params.id, status, assignedTo);
      if (!updated) return res.status(404).json({ error: "Not found" });
      await getStorage().addActivityEntry({
        type: "review",
        description: `Conversation ${req.params.id} status changed to "${status}"`,
        conversationId: req.params.id,
        userId: req.body.userId ?? null,
        timestamp: new Date().toISOString(),
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Draft Replies ─────────────────────────────────────────────────────────
  app.get("/api/drafts", async (_req, res) => {
    try {
      const list = await getStorage().getDraftReplies();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/drafts/conversation/:id", async (req, res) => {
    try {
      const list = await getStorage().getDraftRepliesForConversation(req.params.id);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/drafts/:id/approve", async (req, res) => {
    try {
      const updated = await getStorage().updateDraftReply(req.params.id, {
        status: "approved",
        reviewedAt: new Date().toISOString(),
        reviewedBy: req.body.reviewedBy ?? "admin",
        reviewNote: req.body.note ?? null,
      });
      if (!updated) return res.status(404).json({ error: "Not found" });
      await getStorage().addActivityEntry({
        type: "reply",
        description: `Draft reply approved for conversation ${updated.conversationId}`,
        conversationId: updated.conversationId,
        userId: req.body.reviewedBy ?? null,
        timestamp: new Date().toISOString(),
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/drafts/:id/reject", async (req, res) => {
    try {
      const updated = await getStorage().updateDraftReply(req.params.id, {
        status: "rejected",
        reviewedAt: new Date().toISOString(),
        reviewedBy: req.body.reviewedBy ?? "admin",
        reviewNote: req.body.note ?? null,
      });
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.patch("/api/drafts/:id", async (req, res) => {
    try {
      const updated = await getStorage().updateDraftReply(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Generate a new AI draft reply using Tavily
  app.post("/api/drafts/generate", async (req, res) => {
    try {
      const { conversationId, conversationContent } = req.body as {
        conversationId: string;
        conversationContent: string;
      };
      const apiKey = process.env.TAVILY_API_KEY ?? "";
      const content = await generateAIDraft(
        conversationContent,
        cfg.name,
        cfg.supportEmail ?? "team@example.com",
        apiKey,
      );
      const draft = await getStorage().createDraftReply({
        id: `d-${Date.now()}`,
        conversationId,
        content,
        status: "awaiting",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
      });
      await getStorage().addActivityEntry({
        type: "capture",
        description: `AI draft reply generated for conversation ${conversationId}`,
        conversationId,
        userId: null,
        timestamp: new Date().toISOString(),
      });
      res.json(draft);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Knowledge Base ────────────────────────────────────────────────────────
  app.get("/api/knowledge", async (_req, res) => {
    try {
      res.json(await getStorage().getKnowledgeEntries());
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/knowledge", async (req, res) => {
    try {
      const entry = await getStorage().createKnowledgeEntry({
        id: `k-${Date.now()}`,
        ...req.body,
      });
      await getStorage().addActivityEntry({
        type: "knowledge_update",
        description: `Knowledge entry "${entry.title}" created`,
        conversationId: null,
        userId: req.body.userId ?? null,
        timestamp: new Date().toISOString(),
      });
      res.status(201).json(entry);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.patch("/api/knowledge/:id", async (req, res) => {
    try {
      const updated = await getStorage().updateKnowledgeEntry(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.delete("/api/knowledge/:id", async (req, res) => {
    try {
      const ok = await getStorage().deleteKnowledgeEntry(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Tavily Scheduler ─────────────────────────────────────────────────────
  app.get("/api/tavily/status", (_req, res) => {
    res.json({
      lastRunAt: schedulerState.lastRunAt,
      nextRunAt: schedulerState.nextRunAt,
      isRunning: schedulerState.isRunning,
      totalRuns: schedulerState.totalRuns,
      lastIngestedCount: schedulerState.lastIngestedCount,
      enabled: !!process.env.TAVILY_API_KEY,
    });
  });

  app.post("/api/tavily/refresh", async (_req, res) => {
    try {
      if (schedulerState.isRunning) {
        return res.json({ message: "Refresh already in progress", ingested: 0 });
      }
      const apiKey = process.env.TAVILY_API_KEY ?? "";
      if (!apiKey) {
        return res.status(400).json({ error: "TAVILY_API_KEY not set" });
      }
      const result = await triggerManualRefresh(
        cfg.monitoredBrands,
        cfg.monitoredKeywords ?? [],
        apiKey,
      );
      res.json({ message: `Refresh complete — ${result.ingested} new captures`, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Culture Monitor ────────────────────────────────────────────────────────
  app.get("/api/culture-reviews", async (req, res) => {
    try {
      const { status, source, sentiment } = req.query as Record<string, string>;
      const list = await getStorage().getCultureReviews({ status, source, sentiment });
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/culture-reviews/stats", async (_req, res) => {
    try {
      res.json(await getStorage().getCultureStats());
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.patch("/api/culture-reviews/:id/status", async (req, res) => {
    try {
      const { status } = req.body as { status: string };
      const updated = await getStorage().updateCultureReviewStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/culture-reviews/scan", async (_req, res) => {
    try {
      const apiKey = process.env.TAVILY_API_KEY ?? "";
      if (!apiKey) return res.status(400).json({ error: "TAVILY_API_KEY not set" });
      const result = await runCultureScan(cfg.name, apiKey);
      res.json({ message: `Culture scan complete — ${result.ingested} new reviews`, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Forward Conversation ──────────────────────────────────────────────────
  app.post("/api/conversations/:id/forward", async (req, res) => {
    try {
      const { to, note } = req.body as { to: string; note?: string };
      if (!to) return res.status(400).json({ error: "Recipient email required" });

      const conversation = await getStorage().getConversation(req.params.id);
      if (!conversation) return res.status(404).json({ error: "Not found" });

      const draftsForConv = await getStorage().getDraftRepliesForConversation(req.params.id);
      const latestDraft = draftsForConv.find(d => d.status === "awaiting") ?? draftsForConv[0];

      // Check SMTP config
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT ?? "587");
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res.status(503).json({
          error: "Email not configured",
          message: "Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM to your Railway environment variables.",
        });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const draftSection = latestDraft
        ? `\n\n---\nAI DRAFT REPLY (${latestDraft.status}):\n${latestDraft.content}`
        : "";

      const noteSection = note ? `\n\nNOTE FROM SENDER:\n${note}` : "";

      const emailBody = `A conversation has been forwarded to you from the ${cfg.name} Monitor.${noteSection}\n\n` +
        `--- CONVERSATION DETAILS ---\n` +
        `Author:     ${conversation.authorName} (${conversation.authorHandle})\n` +
        `Platform:   ${conversation.platform}\n` +
        `Sentiment:  ${conversation.sentiment} (${conversation.sentimentScore}/100)\n` +
        `Priority:   ${conversation.priority}\n` +
        `Published:  ${new Date(conversation.publishedAt).toLocaleString()}\n` +
        `Source URL: ${conversation.url}\n\n` +
        `CONTENT:\n${conversation.content}` +
        draftSection;

      await transporter.sendMail({
        from: `"${cfg.name} Monitor" <${smtpFrom}>`,
        to,
        subject: `[${cfg.name} Monitor] Forwarded: ${conversation.authorName} on ${conversation.platform} — ${conversation.sentiment} sentiment`,
        text: emailBody,
      });

      await getStorage().addActivityEntry({
        type: "review",
        description: `Conversation ${req.params.id} forwarded to ${to}`,
        conversationId: req.params.id,
        userId: null,
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Activity Log ──────────────────────────────────────────────────────────
  app.get("/api/activity", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string ?? "50");
      res.json(await getStorage().getActivityLog(limit));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Team ──────────────────────────────────────────────────────────────────
  app.get("/api/team", async (_req, res) => {
    try {
      res.json(await getStorage().getTeamMembers());
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
