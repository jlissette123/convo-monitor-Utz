import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrand } from "@/components/BrandProvider";
import { MessageSquare, Clock, CheckCircle, XCircle, TrendingUp, ArrowRight, RefreshCw, Wifi, WifiOff } from "lucide-react";
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

function KpiCard({ label, value, icon: Icon, sub, color }: {
  label: string; value: number; icon: React.ElementType; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={cn("p-2.5 rounded-lg", color)}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

const SENTIMENT_COLORS = ["#10b981", "#f59e0b", "#ef4444"];
const PLATFORM_COLORS = ["#0ea5e9", "#f97316", "#2563eb", "#9333ea", "#64748b"];

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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{brand.name} — Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitoring {brand.monitoredBrands.join(", ")}
          </p>
        </div>

        {/* Tavily refresh status pill */}
        {tavilyStatus && (
          <div className="flex items-center gap-3 shrink-0" data-testid="tavily-status-bar">
            {tavilyStatus.enabled ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-card-border rounded-lg px-3 py-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${tavilyStatus.isRunning ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <Wifi size={12} className="text-emerald-500" />
                <span className="font-medium">
                  {tavilyStatus.isRunning
                    ? "Scanning…"
                    : tavilyStatus.lastRunAt
                    ? `Last scan ${timeAgo(tavilyStatus.lastRunAt)}`
                    : "Scheduled"}
                </span>
                {!tavilyStatus.isRunning && countdown && (
                  <span className="text-muted-foreground">· Next in {countdown}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-card-border rounded-lg px-3 py-2">
                <WifiOff size={12} />
                <span>Auto-scan offline</span>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              data-testid="button-manual-refresh"
              disabled={refreshMutation.isPending || tavilyStatus?.isRunning}
              onClick={() => refreshMutation.mutate()}
            >
              <RefreshCw size={12} className={refreshMutation.isPending ? "animate-spin" : ""} />
              {refreshMutation.isPending ? "Scanning…" : "Scan Now"}
            </Button>
          </div>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <KpiCard label="Total Captures" value={stats?.totalCaptures ?? 0} icon={TrendingUp} sub="All time" color="bg-primary/10 text-primary" />
            <KpiCard label="Awaiting Review" value={stats?.awaitingReview ?? 0} icon={Clock} sub="Needs attention" color="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
            <KpiCard label="Replies Sent" value={stats?.repliesSent ?? 0} icon={CheckCircle} sub="Via Reply Studio" color="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
            <KpiCard label="Dismissed" value={stats?.dismissed ?? 0} icon={XCircle} sub="Not relevant" color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sentiment donut */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Sentiment Breakdown</h2>
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
            {["Positive","Neutral","Negative"].map((label, i) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full inline-block" style={{background: SENTIMENT_COLORS[i]}} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Platform bar */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Platform Distribution</h2>
          {statsLoading ? <Skeleton className="h-40 w-full" /> : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={platformData} barSize={20}>
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
            <div className="space-y-2 mt-2">
              {brandData.map((b, i) => (
                <div key={b.name} className="flex items-center gap-2" data-testid={`brand-mention-${b.name}`}>
                  <span className="text-xs text-muted-foreground w-24 truncate">{b.name}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${(b.value / (Math.max(...brandData.map(x => x.value)) || 1)) * 100}%`,
                        background: PLATFORM_COLORS[i % PLATFORM_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium w-4 text-right">{b.value}</span>
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
            <h2 className="text-sm font-semibold">High Priority Queue</h2>
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
                    <p className="text-sm font-medium truncate">{c.authorName}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.content}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium sentiment-${c.sentiment}`}>
                      {c.sentiment}
                    </span>
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
