import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrand } from "@/components/BrandProvider";
import { TrendingUp, Percent, Zap, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart, Area,
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface Stats {
  total: number;
  pending: number;
  replied: number;
  dismissed: number;
  positiveRate: number;
  totalEngagement: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  platformBreakdown: Record<string, number>;
  brandBreakdown: Record<string, number>;
}

const SENTIMENT_COLORS = { positive: "#10b981", neutral: "#94a3b8", negative: "#ef4444" };
const PLATFORM_COLORS = ["#0ea5e9", "#f97316", "#2563eb", "#9333ea", "#64748b", "#ec4899"];
const BRAND_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#f97316"];

// Engagement data — realistic per-platform benchmarks
const ENGAGEMENT_TABLE = [
  { platform: "Twitter / X",  avgEngagement: 342,   totalReach: 4789  },
  { platform: "Reddit",       avgEngagement: 524,   totalReach: 2620  },
  { platform: "LinkedIn",     avgEngagement: 1240,  totalReach: 1240  },
  { platform: "Blogs & News", avgEngagement: 2750,  totalReach: 5500  },
  { platform: "TikTok",       avgEngagement: 8420,  totalReach: 12630 },
  { platform: "Instagram",    avgEngagement: 5180,  totalReach: 10360 },
];
const MAX_REACH = Math.max(...ENGAGEMENT_TABLE.map(r => r.totalReach));

function KpiCard({ label, value, icon: Icon, color, suffix = "" }: {
  label: string; value: number | string; icon: React.ElementType; color: string; suffix?: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}{suffix}</p>
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

// Generate synthetic weekly trend data from stats breakdown
function buildWeeklyTrend(stats: Stats) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const total = stats.total;
  // Distribute across 7 days with some variance
  const weights = [0.18, 0.16, 0.14, 0.17, 0.15, 0.10, 0.10];
  return days.map((day, i) => {
    const dayTotal = Math.round(total * weights[i]);
    const pos = Math.round(dayTotal * (stats.sentimentBreakdown.positive / Math.max(total, 1)));
    const neg = Math.round(dayTotal * (stats.sentimentBreakdown.negative / Math.max(total, 1)));
    const neu = dayTotal - pos - neg;
    return { day, positive: pos, neutral: Math.max(0, neu), negative: neg };
  });
}

export function Analytics() {
  const { brand } = useBrand();

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
  });

  const weeklyTrend = stats ? buildWeeklyTrend(stats) : [];
  const platformData = stats
    ? Object.entries(stats.platformBreakdown).map(([name, value]) => ({ name, value }))
    : [];
  const brandData = stats
    ? Object.entries(stats.brandBreakdown).map(([name, value]) => ({ name, value }))
    : [];
  const maxBrand = Math.max(...brandData.map(b => b.value), 1);

  // Sentiment split per brand (synthetic — distribute evenly for demo)
  const sentimentSplit = brandData.slice(0, 4).map((b, i) => ({
    name: b.name.length > 12 ? b.name.slice(0, 12) + "…" : b.name,
    positive: Math.round(b.value * 0.52),
    neutral:  Math.round(b.value * 0.40),
    negative: Math.round(b.value * 0.08),
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">{brand.name} — Analytics & Reporting</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Conversation intelligence across all monitored brands
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <KpiCard label="Total Mentions"    value={stats?.total ?? 0}           icon={MessageSquare} color="bg-primary/10 text-primary" />
            <KpiCard label="Positive Rate"     value={stats?.positiveRate ?? 0}    icon={Percent}       color="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" suffix="%" />
            <KpiCard label="Total Engagement"  value={stats?.totalEngagement ?? 0} icon={Zap}           color="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
            <KpiCard label="Replied"           value={stats?.replied ?? 0}         icon={TrendingUp}    color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" />
          </>
        )}
      </div>

      {/* Weekly Capture Trend */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold mb-4">Weekly Capture Trend — Sentiment Breakdown</h2>
        {isLoading ? <Skeleton className="h-56 w-full" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="positive" stackId="1" stroke={SENTIMENT_COLORS.positive} fill={SENTIMENT_COLORS.positive} fillOpacity={0.7} name="Positive" />
              <Area type="monotone" dataKey="neutral"  stackId="1" stroke={SENTIMENT_COLORS.neutral}  fill={SENTIMENT_COLORS.neutral}  fillOpacity={0.5} name="Neutral" />
              <Area type="monotone" dataKey="negative" stackId="1" stroke={SENTIMENT_COLORS.negative} fill={SENTIMENT_COLORS.negative} fillOpacity={0.7} name="Negative" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 3-col charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Platform pie */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">By Platform</h2>
          {isLoading ? <Skeleton className="h-44 w-full" /> : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={platformData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {platformData.map((_, i) => <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                {platformData.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: PLATFORM_COLORS[i % PLATFORM_COLORS.length] }} />
                    {p.name} ({p.value})
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Brand mentions bars */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Brand Mentions</h2>
          {isLoading ? <Skeleton className="h-44 w-full" /> : (
            <div className="space-y-2.5 mt-2">
              {brandData.map((b, i) => (
                <div key={b.name} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 truncate">{b.name}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${(b.value / maxBrand) * 100}%`, background: BRAND_COLORS[i % BRAND_COLORS.length] }}
                    />
                  </div>
                  <span className="text-xs font-medium w-6 text-right">{b.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sentiment split by brand */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Sentiment Split</h2>
          {isLoading ? <Skeleton className="h-44 w-full" /> : (
            <ResponsiveContainer width="100%" height={175}>
              <BarChart data={sentimentSplit} barSize={12} margin={{ left: -20, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="positive" stackId="a" fill={SENTIMENT_COLORS.positive} radius={[0,0,0,0]} name="Positive" />
                <Bar dataKey="neutral"  stackId="a" fill={SENTIMENT_COLORS.neutral}  name="Neutral" />
                <Bar dataKey="negative" stackId="a" fill={SENTIMENT_COLORS.negative} radius={[3,3,0,0]} name="Negative" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Engagement by Platform table */}
      <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Engagement by Platform</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Platform</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Avg Engagement</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Total Reach</th>
                <th className="px-5 py-3 text-xs font-medium text-muted-foreground w-40">Reach Distribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ENGAGEMENT_TABLE.map((row) => (
                <tr key={row.platform} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 font-medium">{row.platform}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{row.avgEngagement.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{row.totalReach.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <div className="bg-muted rounded-full h-1.5 w-full">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${(row.totalReach / MAX_REACH) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
