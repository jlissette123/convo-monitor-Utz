import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import type { Conversation } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Twitter, Linkedin, Globe, BookOpen, ExternalLink,
  TrendingDown, ChevronRight, Sparkles, Eye, AlertTriangle, Trash2,
  Youtube,
} from "lucide-react";
import { FaReddit, FaInstagram, FaTiktok } from "react-icons/fa";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

function PlatformIcon({ platform }: { platform: string }) {
  const cls = `platform-${platform}`;
  if (platform === "twitter")   return <Twitter     size={14} className={cls} />;
  if (platform === "reddit")    return <FaReddit    size={14} className={cls} />;
  if (platform === "linkedin")  return <Linkedin    size={14} className={cls} />;
  if (platform === "blog")      return <BookOpen    size={14} className={cls} />;
  if (platform === "instagram") return <FaInstagram size={14} className={cls} />;
  if (platform === "tiktok")    return <FaTiktok    size={14} className={cls} />;
  if (platform === "youtube")   return <Youtube     size={14} className={cls} />;
  return <Globe size={14} className={cls} />;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_LABELS: Record<string, string> = {
  pending:   "Pending Review",
  in_review: "In Review",
  replied:   "Replied",
  dismissed: "Dismissed",
};

export function NegativeSentiment() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations", "negative"],
    queryFn: () =>
      apiRequest("GET", "/api/conversations?sentiment=negative").then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: drafts } = useQuery({
    queryKey: selectedId ? ["/api/drafts/conversation", selectedId] : ["drafts-none"],
    queryFn: () =>
      selectedId
        ? apiRequest("GET", `/api/drafts/conversation/${selectedId}`).then(r => r.json())
        : Promise.resolve([]),
    enabled: !!selectedId,
  });

  const [confirmDismissAll, setConfirmDismissAll] = useState(false);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/conversations/${id}/status`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", "negative"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Status updated" });
    },
  });

  const dismissAll = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("DELETE", "/api/conversations/batch", { ids }).then(r => r.json()),
    onSuccess: (data: any) => {
      setConfirmDismissAll(false);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", "negative"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: `${data.deleted} conversation${data.deleted !== 1 ? "s" : ""} deleted` });
    },
  });

  const generateDraft = useMutation({
    mutationFn: ({ conversationId, conversationContent }: { conversationId: string; conversationContent: string }) =>
      apiRequest("POST", "/api/drafts/generate", { conversationId, conversationContent }).then(r => r.json()),
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/drafts/conversation", conversationId] });
      toast({ title: "Draft reply generated", description: "Review it in Reply Studio." });
    },
  });

  const list = conversations ?? [];
  const selected = list.find(c => c.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen overflow-hidden pt-[60px] md:pt-0">
      {/* List panel */}
      <div className="w-full md:w-96 flex flex-col border-r border-border bg-background shrink-0">

        {/* Header */}
        <div className="p-4 border-b border-border bg-sidebar">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-red-500/10">
                <TrendingDown size={16} className="text-red-500" />
              </div>
              <h1 className="text-sm font-semibold text-foreground">Negative Sentiment</h1>
            </div>
            {list.length > 0 && !confirmDismissAll && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-red-500"
                onClick={() => setConfirmDismissAll(true)}
                data-testid="button-neg-dismiss-all"
              >
                <Trash2 size={11} className="mr-1" /> Dismiss All
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${list.length} negative conversation${list.length !== 1 ? "s" : ""} flagged for review`}
          </p>
          <div className="mt-2">
            <Link href="/queue">
              <span className="text-xs text-primary hover:text-primary/80 cursor-pointer flex items-center gap-1">
                View all in Conversation Inbox <ChevronRight size={11} />
              </span>
            </Link>
          </div>
          {/* Confirm dismiss all */}
          {confirmDismissAll && (
            <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2.5">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">
                Delete all {list.length} conversation{list.length !== 1 ? "s" : ""} permanently?
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-6 text-xs bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => dismissAll.mutate(list.map(c => c.id))}
                  disabled={dismissAll.isPending}
                  data-testid="button-neg-confirm-dismiss-all"
                >
                  {dismissAll.isPending ? "Deleting…" : "Yes, delete all"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => setConfirmDismissAll(false)}
                  disabled={dismissAll.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Alert banner */}
        {!isLoading && list.length > 0 && (
          <div className="mx-3 mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400 leading-snug">
              {list.length} conversation{list.length !== 1 ? "s" : ""} require{list.length === 1 ? "s" : ""} attention
            </p>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border mt-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3"><Skeleton className="h-16 w-full" /></div>
            ))
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
              <div className="p-3 rounded-full bg-emerald-500/10 mb-3">
                <TrendingDown size={24} className="text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-foreground">All clear</p>
              <p className="text-xs text-muted-foreground mt-1">No negative sentiment conversations detected</p>
            </div>
          ) : list.map(c => (
            <button
              key={c.id}
              data-testid={`neg-conv-item-${c.id}`}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-accent transition-colors",
                selectedId === c.id && "bg-red-500/5 border-l-2 border-red-500"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <PlatformIcon platform={c.platform} />
                  <span className="text-xs">{c.authorHandle}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium priority-${c.priority}`}>{c.priority}</span>
                </div>
              </div>
              <p className="text-sm font-medium mt-1 truncate">{c.authorName}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.content}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                  negative · {c.sentimentScore}/100
                </span>
                <span className="text-xs text-muted-foreground">{timeAgo(c.publishedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="hidden md:flex flex-1 flex-col overflow-y-auto">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <div className="mx-auto p-4 rounded-full bg-red-500/10 w-fit">
                <TrendingDown size={32} className="text-red-500 opacity-60" />
              </div>
              <p className="text-sm">Select a conversation to review</p>
              <p className="text-xs text-muted-foreground">Showing only negative sentiment conversations</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-w-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <PlatformIcon platform={selected.platform} />
                  <span className="text-sm font-semibold">{selected.authorName}</span>
                  <span className="text-sm text-muted-foreground">{selected.authorHandle}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-600 dark:text-red-400">
                    negative · {selected.sentimentScore}/100
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium priority-${selected.priority}`}>
                    {selected.priority} priority
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/queue?id=${selected.id}`}>
                  <Button size="sm" variant="outline" className="text-xs h-7" data-testid="button-open-in-queue">
                    Open in Inbox <ChevronRight size={12} className="ml-1" />
                  </Button>
                </Link>
                <a href={selected.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                  <ExternalLink size={16} />
                </a>
              </div>
            </div>

            {/* Red accent content block */}
            <div
              className="bg-red-500/5 rounded-lg p-4 text-sm leading-relaxed border border-red-500/20"
              data-testid="text-neg-conversation-content"
            >
              {selected.content}
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-card border border-card-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Engagement</p>
                <p className="font-semibold mt-0.5">{selected.engagementCount.toLocaleString()}</p>
              </div>
              <div className="bg-card border border-card-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Published</p>
                <p className="font-semibold mt-0.5">{timeAgo(selected.publishedAt)}</p>
              </div>
              <div className="bg-card border border-card-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Brand mentions</p>
                <p className="font-semibold mt-0.5">{(selected.brandMentions ?? []).join(", ") || "None"}</p>
              </div>
              <div className="bg-card border border-card-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Flagged reason</p>
                <p className="font-semibold mt-0.5 text-xs leading-tight">{selected.flaggedReason ?? "—"}</p>
              </div>
            </div>

            {/* Tags */}
            {(selected.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.tags.map(t => (
                  <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            )}

            {/* Existing drafts */}
            {(drafts as any[] ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">AI Draft Replies</p>
                {(drafts as any[]).map((d: any) => (
                  <div key={d.id} className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">
                      Status: <span className={cn("font-medium", d.status === "approved" && "text-emerald-600 dark:text-emerald-400", d.status === "rejected" && "text-red-500")}>{d.status}</span>
                    </p>
                    <p className="leading-relaxed">{d.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              {selected.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: "in_review" })}
                  disabled={updateStatus.isPending}
                  data-testid="button-neg-start-review"
                >
                  <Eye size={14} className="mr-1.5" /> Start Review
                </Button>
              )}
              {selected.status === "in_review" && (
                <Button
                  size="sm"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: "replied" })}
                  disabled={updateStatus.isPending}
                  data-testid="button-neg-mark-replied"
                >
                  <ChevronRight size={14} className="mr-1.5" /> Mark Replied
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateDraft.mutate({ conversationId: selected.id, conversationContent: selected.content })}
                disabled={generateDraft.isPending}
                data-testid="button-neg-generate-draft"
              >
                <Sparkles size={14} className="mr-1.5" />
                {generateDraft.isPending ? "Generating…" : "Generate Draft Reply"}
              </Button>
              {selected.status !== "dismissed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: "dismissed" })}
                  disabled={updateStatus.isPending}
                  data-testid="button-neg-dismiss"
                >
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
