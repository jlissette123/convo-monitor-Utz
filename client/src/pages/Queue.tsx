import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import type { Conversation, DraftReply } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Twitter, Linkedin, Globe, BookOpen, ExternalLink,
  Filter, Search, ChevronRight, Sparkles, Eye, ArrowUpDown,
} from "lucide-react";
import { FaReddit } from "react-icons/fa";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

function PlatformIcon({ platform }: { platform: string }) {
  const cls = `platform-${platform}`;
  if (platform === "twitter") return <Twitter size={14} className={cls} />;
  if (platform === "reddit")  return <FaReddit size={14} className={cls} />;
  if (platform === "linkedin") return <Linkedin size={14} className={cls} />;
  if (platform === "blog") return <BookOpen size={14} className={cls} />;
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
  pending: "Pending Review",
  in_review: "In Review",
  replied: "Replied",
  dismissed: "Dismissed",
};

export function Queue() {
  // Parse ?id= from window.location.hash directly
  const hashSearch = typeof window !== 'undefined'
    ? window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''
    : '';
  const searchParams = new URLSearchParams(hashSearch);
  const initialId = searchParams.get("id");

  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const { toast } = useToast();

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: () => apiRequest("GET", "/api/conversations").then(r => r.json()),
  });

  const { data: drafts } = useQuery<DraftReply[]>({
    queryKey: selectedId ? ["/api/drafts/conversation", selectedId] : ["drafts-none"],
    queryFn: () => selectedId
      ? apiRequest("GET", `/api/drafts/conversation/${selectedId}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!selectedId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/conversations/${id}/status`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Status updated" });
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

  const SENTIMENT_RANK: Record<string, number> = { negative: 0, neutral: 1, positive: 2 };

  const filtered = (conversations ?? [])
    .filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (searchQuery && !c.content.toLowerCase().includes(searchQuery.toLowerCase()) && !c.authorName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (sortOrder === "oldest") return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      if (sortOrder === "sentiment") {
        const rankA = SENTIMENT_RANK[a.sentiment] ?? 1;
        const rankB = SENTIMENT_RANK[b.sentiment] ?? 1;
        if (rankA !== rankB) return rankA - rankB;
        // secondary sort: newest within same sentiment
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      return 0;
    });

  const selected = filtered.find(c => c.id === selectedId) ?? conversations?.find(c => c.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen overflow-hidden pt-[60px] md:pt-0">
      {/* List panel */}
      <div className="w-full md:w-96 flex flex-col border-r border-border bg-background shrink-0">
        {/* Filters */}
        <div className="p-3 border-b border-border space-y-2 bg-sidebar">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-8 h-8 text-xs"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-platform-filter">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                <SelectItem value="twitter">Twitter</SelectItem>
                <SelectItem value="reddit">Reddit</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="blog">Blog</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={11} className="text-muted-foreground shrink-0" />
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-sort-order">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="sentiment">Negative first</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{filtered.length} conversation{filtered.length !== 1 ? "s" : ""}</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading ? (
            Array.from({length: 5}).map((_, i) => (
              <div key={i} className="p-3"><Skeleton className="h-16 w-full" /></div>
            ))
          ) : filtered.map(c => (
            <button
              key={c.id}
              data-testid={`conv-item-${c.id}`}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-accent transition-colors",
                selectedId === c.id && "bg-primary/5 border-l-2 border-primary"
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
                <span className={`text-xs px-1.5 py-0.5 rounded sentiment-${c.sentiment}`}>{c.sentiment}</span>
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
              <MessageSquareIcon />
              <p className="text-sm">Select a conversation to review</p>
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium sentiment-${selected.sentiment}`}>{selected.sentiment} · {selected.sentimentScore}/100</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium priority-${selected.priority}`}>{selected.priority} priority</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">{STATUS_LABELS[selected.status] ?? selected.status}</span>
                </div>
              </div>
              <a href={selected.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                <ExternalLink size={16} />
              </a>
            </div>

            {/* Content */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm leading-relaxed border border-border" data-testid="text-conversation-content">
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
            {(drafts ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">AI Draft Replies</p>
                {drafts!.map(d => (
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
                  data-testid="button-start-review"
                >
                  <Eye size={14} className="mr-1.5" /> Start Review
                </Button>
              )}
              {selected.status === "in_review" && (
                <Button
                  size="sm"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: "replied" })}
                  disabled={updateStatus.isPending}
                  data-testid="button-mark-replied"
                >
                  <ChevronRight size={14} className="mr-1.5" /> Mark Replied
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateDraft.mutate({ conversationId: selected.id, conversationContent: selected.content })}
                disabled={generateDraft.isPending}
                data-testid="button-generate-draft"
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
                  data-testid="button-dismiss"
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

function MessageSquareIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto opacity-30">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
