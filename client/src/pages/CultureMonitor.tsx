import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, ExternalLink, TrendingDown, TrendingUp,
  Minus, RefreshCw, Building2, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

// ── Types ──────────────────────────────────────────────────────────────────
interface CultureReview {
  id: string;
  source: "glassdoor" | "indeed" | "comparably";
  url: string;
  title: string;
  content: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_review" | "noted" | "dismissed";
  capturedAt: string;
}

interface CultureStats {
  total: number;
  negative: number;
  pending: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  sourceBreakdown: Record<string, number>;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SOURCE_META: Record<string, { label: string; color: string; bg: string }> = {
  glassdoor: { label: "Glassdoor", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  indeed:    { label: "Indeed",    color: "text-blue-700 dark:text-blue-400",    bg: "bg-blue-500/10"    },
  comparably: { label: "Comparably", color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-500/10" },
};

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? { label: source, color: "text-muted-foreground", bg: "bg-muted" };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", meta.bg, meta.color)}>
      {meta.label}
    </span>
  );
}

function SentimentIcon({ sentiment }: { sentiment: string }) {
  if (sentiment === "positive") return <TrendingUp size={13} className="text-emerald-500" />;
  if (sentiment === "negative") return <TrendingDown size={13} className="text-red-500" />;
  return <Minus size={13} className="text-slate-400" />;
}

const STATUS_LABELS: Record<string, string> = {
  pending:   "Pending",
  in_review: "In Review",
  noted:     "Noted",
  dismissed: "Dismissed",
};

// ── Page ───────────────────────────────────────────────────────────────────
export function CultureMonitor() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const { toast } = useToast();

  const { data: reviews, isLoading } = useQuery<CultureReview[]>({
    queryKey: ["/api/culture-reviews"],
    queryFn: () => apiRequest("GET", "/api/culture-reviews").then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery<CultureStats>({
    queryKey: ["/api/culture-reviews/stats"],
    queryFn: () => apiRequest("GET", "/api/culture-reviews/stats").then(r => r.json()),
    refetchInterval: 30000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/culture-reviews/${id}/status`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/culture-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/culture-reviews/stats"] });
      toast({ title: "Status updated" });
    },
  });

  const runScan = useMutation({
    mutationFn: () => apiRequest("POST", "/api/culture-reviews/scan", {}).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/culture-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/culture-reviews/stats"] });
      toast({ title: "Culture scan complete", description: data.message });
    },
    onError: () => toast({ title: "Scan failed", description: "Check that TAVILY_API_KEY is set", variant: "destructive" }),
  });

  const all = reviews ?? [];
  const filtered = all.filter(r => {
    if (sourceFilter   !== "all" && r.source    !== sourceFilter)   return false;
    if (sentimentFilter !== "all" && r.sentiment !== sentimentFilter) return false;
    return true;
  });
  const selected = filtered.find(r => r.id === selectedId) ?? all.find(r => r.id === selectedId);

  const negativeCount = stats?.sentimentBreakdown.negative ?? 0;
  const positiveCount = stats?.sentimentBreakdown.positive ?? 0;
  const neutralCount  = stats?.sentimentBreakdown.neutral  ?? 0;
  const total         = stats?.total ?? 0;

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen overflow-hidden pt-[60px] md:pt-0">
      {/* List panel */}
      <div className="w-full md:w-96 flex flex-col border-r border-border bg-background shrink-0">

        {/* Header */}
        <div className="p-4 border-b border-border bg-sidebar">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Users size={16} className="text-primary" />
              </div>
              <h1 className="text-sm font-semibold text-foreground">Culture Monitor</h1>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => runScan.mutate()}
              disabled={runScan.isPending}
              data-testid="button-culture-scan"
            >
              <RefreshCw size={11} className={cn("mr-1", runScan.isPending && "animate-spin")} />
              {runScan.isPending ? "Scanning…" : "Scan Now"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Employee reviews from Glassdoor, Indeed & Comparably
          </p>

          {/* KPI row */}
          {!isLoading && total > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{positiveCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Positive</p>
              </div>
              <div className="bg-slate-500/10 rounded-lg p-2 text-center">
                <p className="text-base font-bold text-slate-500 tabular-nums">{neutralCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Neutral</p>
              </div>
              <div className="bg-red-500/10 rounded-lg p-2 text-center">
                <p className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">{negativeCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Negative</p>
              </div>
            </div>
          )}

          {/* Source breakdown pills */}
          {stats && Object.keys(stats.sourceBreakdown).length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {Object.entries(stats.sourceBreakdown).map(([src, count]) => {
                const meta = SOURCE_META[src];
                return (
                  <span key={src} className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", meta?.bg, meta?.color)}>
                    {meta?.label ?? src}: {count}
                  </span>
                );
              })}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-1.5">
            {["all", "glassdoor", "indeed", "comparably"].map(s => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors capitalize",
                  sourceFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {s === "all" ? "All Sources" : SOURCE_META[s]?.label ?? s}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {["all", "negative", "neutral", "positive"].map(s => (
              <button
                key={s}
                onClick={() => setSentimentFilter(s)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors capitalize",
                  sentimentFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {s === "all" ? "All Sentiment" : s}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            {filtered.length} review{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Negative spillover notice */}
        {negativeCount > 0 && (
          <div className="mx-3 mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400 leading-snug">
              {negativeCount} negative review{negativeCount !== 1 ? "s" : ""} also appear in{" "}
              <Link href="/negative">
                <span className="underline cursor-pointer">Negative Sentiment</span>
              </Link>
            </p>
          </div>
        )}

        {/* Review list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border mt-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3"><Skeleton className="h-16 w-full" /></div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
              <div className="p-3 rounded-full bg-primary/10 mb-3">
                <Building2 size={24} className="text-primary opacity-60" />
              </div>
              <p className="text-sm font-medium text-foreground">No reviews found</p>
              <p className="text-xs text-muted-foreground mt-1">Run a scan to fetch the latest employer reviews</p>
            </div>
          ) : filtered.map(r => (
            <button
              key={r.id}
              data-testid={`culture-item-${r.id}`}
              onClick={() => setSelectedId(r.id)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-accent transition-colors",
                selectedId === r.id && r.sentiment === "negative" && "bg-red-500/5 border-l-2 border-red-500",
                selectedId === r.id && r.sentiment !== "negative" && "bg-primary/5 border-l-2 border-primary",
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <SourceBadge source={r.source} />
                <div className="flex items-center gap-1">
                  <SentimentIcon sentiment={r.sentiment} />
                  <span className={cn(
                    "text-xs font-medium",
                    r.sentiment === "positive" ? "text-emerald-600 dark:text-emerald-400" :
                    r.sentiment === "negative" ? "text-red-500" : "text-slate-500"
                  )}>
                    {r.sentimentScore}/100
                  </span>
                </div>
              </div>
              <p className="text-xs font-medium line-clamp-1 text-foreground">{r.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.content}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  r.priority === "high"   ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                  r.priority === "medium" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                  "bg-slate-500/10 text-slate-500"
                )}>
                  {r.priority}
                </span>
                <span className="text-xs text-muted-foreground">{timeAgo(r.capturedAt)}</span>
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
              <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit">
                <Users size={32} className="text-primary opacity-60" />
              </div>
              <p className="text-sm">Select a review to read</p>
              <p className="text-xs text-muted-foreground">Showing employer reviews from Glassdoor, Indeed & Comparably</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-w-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <SourceBadge source={selected.source} />
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    selected.priority === "high"   ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                    selected.priority === "medium" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                    "bg-slate-500/10 text-slate-500"
                  )}>
                    {selected.priority} priority
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </span>
                </div>
                <h2 className="text-sm font-semibold text-foreground leading-snug">{selected.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">{timeAgo(selected.capturedAt)}</p>
              </div>
              <a href={selected.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 shrink-0">
                <ExternalLink size={16} />
              </a>
            </div>

            {/* Sentiment score bar */}
            <div className="bg-card border border-card-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <SentimentIcon sentiment={selected.sentiment} />
                  <span className={cn(
                    "text-sm font-semibold capitalize",
                    selected.sentiment === "positive" ? "text-emerald-600 dark:text-emerald-400" :
                    selected.sentiment === "negative" ? "text-red-500" : "text-slate-500"
                  )}>
                    {selected.sentiment} sentiment
                  </span>
                </div>
                <span className="text-sm font-bold tabular-nums text-foreground">{selected.sentimentScore}/100</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    selected.sentiment === "positive" ? "bg-emerald-500" :
                    selected.sentiment === "negative" ? "bg-red-500" : "bg-slate-400"
                  )}
                  style={{ width: `${selected.sentimentScore}%` }}
                />
              </div>
            </div>

            {/* Review content */}
            <div
              className={cn(
                "rounded-lg p-4 text-sm leading-relaxed border",
                selected.sentiment === "negative"
                  ? "bg-red-500/5 border-red-500/20"
                  : "bg-muted/50 border-border"
              )}
              data-testid="text-culture-content"
            >
              {selected.content}
            </div>

            {/* Negative spillover notice */}
            {selected.sentiment === "negative" && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600 dark:text-red-400 leading-snug">
                  This review also appears in{" "}
                  <Link href="/negative">
                    <span className="underline cursor-pointer font-medium">Negative Sentiment</span>
                  </Link>
                  {" "}for consolidated tracking.
                </p>
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
                  data-testid="button-culture-start-review"
                >
                  Start Review
                </Button>
              )}
              {(selected.status === "pending" || selected.status === "in_review") && (
                <Button
                  size="sm"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: "noted" })}
                  disabled={updateStatus.isPending}
                  data-testid="button-culture-note"
                >
                  Mark Noted
                </Button>
              )}
              {selected.status !== "dismissed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: "dismissed" })}
                  disabled={updateStatus.isPending}
                  data-testid="button-culture-dismiss"
                >
                  Dismiss
                </Button>
              )}
              <a href={selected.url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" data-testid="button-culture-open-source">
                  <ExternalLink size={13} className="mr-1.5" />
                  View on {SOURCE_META[selected.source]?.label ?? selected.source}
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
