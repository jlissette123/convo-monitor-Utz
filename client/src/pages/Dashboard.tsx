import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrand } from "@/components/BrandProvider";
import { MessageSquare, Clock, CheckCircle, XCircle, TrendingUp, ArrowRight, RefreshCw, Wifi, WifiOff, Zap } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ActivityEntry, Conversation } from "@shared/schema";

interface TavilyStatus {
  lastRunAt: string | null;
  nextRunAt: string | null;
  isRunning: boolean;
  totalRuns: number;
  lastIngestedCount: number;
  enabled: boolean;
}

function useCountdown(targetIso: string | null): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!targetIso) { setLabel(""); return; }
    function tick() {
      const diff = new Date(targetIso!).getTime() - Date.now();
      if (diff <= 0) { setLabel("any moment"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return label;
}

interface Stats {
  totalCaptures: number;
  awaitingReview: number;
  repliesSent: number;
  dismissed: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  platformBreakdown: Record<string, number>;
  brandMentions: Record<string, number>;
}

/** GlacialAI-style KPI card: colored large number, icon circle, subtle sub-label */
function KpiCard({ label, value, icon: Icon, sub, numColor, iconBg }: {
  label: string;
  value: number;
  icon: React.ElementType;
  sub?: string;
  numColor: string;   // Tailwind text color class for the big number
  iconBg: string;     // Tailwind bg + text class for icon circle
}) {
  return (
    <div
      className="bg-card border border-card-border rounded-xl p-5 shadow-sm"
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn("text-4xl font-bold mt-1 tabular-nums", numColor)}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={cn("p-2.5 rounded-full", iconBg)}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

const SENTIMENT_COLORS = ["#10b981", "#64748b", "#ef4444"];
const PLATFORM_COLORS = ["#0ea5e9", "#f97316", "#2563eb", "#9333ea", "#64748b", "#06b6d4", "#f59e0b"];

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Dashboard() {
  const { brand } = useBrand();
  const qc = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
  });

  const { data: conversations, isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: () => apiRequest("GET", "/api/conversations").then(r => r.json()),
  });

  const { data: activity, isLoading: activityLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["/api/activity"],
    queryFn: () => apiRequest("GET", "/api/activity").then(r => r.json()),
  });

  const { data: tavilyStatus } = useQuery<TavilyStatus>({
    queryKey: ["/api/tavily/status"],
    queryFn: () => apiRequest("GET", "/api/tavily/status").then(r => r.json()),
    refetchInterval: 15000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tavily/refresh").then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/activity"] });
      qc.invalidateQueries({ queryKey: ["/api/tavily/status"] });
    },
  });

  const countdown = useCountdown(tavilyStatus?.nextRunAt ?? null);

  const highPriority = conversations?.filter(c => c.priority === "high" && c.status === "pending") ?? [];
  const sentimentData = stats ? [
    { name: "Positive", value: stats.sentimentBreakdown.positive },
    { name: "Neutral",  value: stats.sentimentBreakdown.neutral },
    { name: "Negative", value: stats.sentimentBreakdown.negative },
  ] : [];
  const platformData = stats
    ? Object.entries(stats.platformBreakdown).map(([name, value]) => ({ name, value }))
    : [];
  const brandData = stats
    ? Object.entries(stats.brandMentions).map(([name, value]) => ({ name, value }))
    : [];

  const liveMonitoringActive = tavilyStatus?.enabled || (tavilyStatus?.totalRuns ?? 0) > 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header — GlacialAI style: title+sub left, live status + Review Queue right */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitoring {brand.monitoredBrands.slice(0, 4).join(", ")}{brand.monitoredBrands.length > 4 ? ` & ${brand.monitoredBrands.length - 4} more` : ""}
          </p>
        </div>

        {/* Right side: live status pill + Review Queue button */}
        <div className="flex items-center gap-3 shrink-0">
          {liveMonitoringActive ? (
            <div className="flex flex-col items-end gap-0.5" data-testid="tavily-status-bar">
              <div className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${tavilyStatus?.isRunning ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {tavilyStatus?.isRunning ? "Scanning now…" : "Live monitoring active · every 24 hours"}
                </span>
              </div>
              {!tavilyStatus?.isRunning && countdown && (
                <p className="text-xs text-muted-foreground">Next scan in {countdown}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="tavily-status-bar">
              <WifiOff size={12} />
              <span>Auto-scan offline</span>
            </div>
          )}

          {/* Solid teal Review Queue button matching GlacialAI */}
          <Button
            className="gap-2 shrink-0"
            data-testid="button-review-queue"
            onClick={() => window.location.hash = "/queue"}
          >
            <MessageSquare size={15} />
            Review Queue
          </Button>
        </div>
      </div>

      {/* Scan Now row — only when monitoring active */}
      {liveMonitoringActive && (
        <div className="flex items-center gap-2 -mt-3">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 px-2 text-muted-foreground"
            data-testid="button-manual-refresh"
            disabled={refreshMutation.isPending || tavilyStatus?.isRunning}
            onClick={() => refreshMutation.mutate()}
          >
            <RefreshCw size={11} className={cn("mr-1.5", refreshMutation.isPending && "animate-spin")} />
            {refreshMutation.isPending ? "Scanning…" : "Scan Now"}
          </Button>
        </div>
      )}

      {/* KPI Row — GlacialAI style with colored numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Total Captured"
              value={stats?.totalCaptures ?? 0}
              icon={MessageSquare}
              sub="All conversations"
              numColor="text-primary"
              iconBg="bg-primary/10 text-primary"
            />
            <KpiCard
              label="Awaiting Review"
              value={stats?.awaitingReview ?? 0}
              icon={Clock}
              sub={`${stats?.awaitingReview ?? 0} pending · 0 in review`}
              numColor="text-amber-500"
              iconBg="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
            />
            <KpiCard
              label="Replies Sent"
              value={stats?.repliesSent ?? 0}
              icon={CheckCircle}
              sub="Human-approved replies"
              numColor="text-emerald-600 dark:text-emerald-400"
              iconBg="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
            />
            <KpiCard
              label="Dismissed"
              value={stats?.dismissed ?? 0}
              icon={XCircle}
              sub="Not relevant / archived"
              numColor="text-slate-500"
              iconBg="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sentiment donut */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Sentiment Overview</h2>
          {statsLoading ? <Skeleton className="h-40 w-full" /> : (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {sentimentData.map((_, i) => <Cell key={i} fill={SENTIMENT_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex justify-center gap-4 mt-2">
            {[
              { label: "Positive", color: SENTIMENT_COLORS[0], val: stats?.sentimentBreakdown.positive },
              { label: "Neutral",  color: SENTIMENT_COLORS[1], val: stats?.sentimentBreakdown.neutral },
              { label: "Negative", color: SENTIMENT_COLORS[2], val: stats?.sentimentBreakdown.negative },
            ].map(({ label, color, val }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                {label} {val !== undefined && <span className="font-medium text-foreground">{val}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Platform bar */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">By Platform</h2>
          {statsLoading ? <Skeleton className="h-40 w-full" /> : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={platformData} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={25} />
                <Tooltip />
                <Bar dataKey="value" radius={[4,4,0,0]}>
                  {platformData.map((_, i) => <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Brand mentions */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Brand Mentions</h2>
          {statsLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-2.5 mt-1">
              {brandData.map((b, i) => (
                <div key={b.name} className="flex items-center gap-3" data-testid={`brand-mention-${b.name}`}>
                  <span className="text-xs text-muted-foreground w-28 truncate">{b.name}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${(b.value / (Math.max(...brandData.map(x => x.value)) || 1)) * 100}%`,
                        background: PLATFORM_COLORS[i % PLATFORM_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium w-5 text-right">{b.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* High priority + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* High priority queue */}
        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-500" />
              <h2 className="text-sm font-semibold">High Priority — Needs Review</h2>
            </div>
            <Link href="/queue" className="text-xs text-primary flex items-center gap-1 hover:underline" data-testid="link-view-queue">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {convsLoading ? (
              Array.from({length:3}).map((_, i) => <div key={i} className="px-5 py-3"><Skeleton className="h-10 w-full" /></div>)
            ) : highPriority.length === 0 ? (
              <p className="text-sm text-muted-foreground px-5 py-6 text-center">No high-priority conversations.</p>
            ) : highPriority.slice(0, 4).map(c => (
              <Link href={`/queue?id=${c.id}`} key={c.id} className="flex items-start gap-3 px-5 py-3 hover:bg-accent cursor-pointer" data-testid={`conv-preview-${c.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium truncate">{c.authorName}</p>
                    <span className="text-xs text-muted-foreground">— {c.sentiment === "positive" ? "Positive" : c.sentiment === "negative" ? "Negative" : "Neutral"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{c.content}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground">{c.platform}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(c.publishedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Activity log */}
        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
          </div>
          <div className="divide-y divide-border">
            {activityLoading ? (
              Array.from({length:4}).map((_, i) => <div key={i} className="px-5 py-3"><Skeleton className="h-8 w-full" /></div>)
            ) : (activity ?? []).slice(0, 6).map(entry => (
              <div key={entry.id} className="px-5 py-3 flex items-start gap-3" data-testid={`activity-${entry.id}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{entry.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(entry.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
