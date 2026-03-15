import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ActivityEntry, Conversation } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Bell, MessageSquare, CheckCircle, BookOpen, RefreshCw, TrendingUp } from "lucide-react";
import { useBrand } from "@/components/BrandProvider";
import { cn } from "@/lib/utils";

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  capture:           { icon: TrendingUp,   color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",    label: "Capture" },
  review:            { icon: MessageSquare, color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", label: "Review" },
  reply:             { icon: CheckCircle,   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", label: "Reply" },
  dismiss:           { icon: RefreshCw,     color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", label: "Dismiss" },
  knowledge_update:  { icon: BookOpen,      color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300", label: "KB Update" },
};

export function Notifications() {
  const { brand } = useBrand();

  const { data: activity, isLoading: activityLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["/api/activity", 100],
    queryFn: () => apiRequest("GET", "/api/activity?limit=100").then(r => r.json()),
  });

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: () => apiRequest("GET", "/api/conversations").then(r => r.json()),
  });

  const highPriority = (conversations ?? []).filter(c => c.priority === "high" && c.status === "pending");
  const negative = (conversations ?? []).filter(c => c.sentiment === "negative" && c.status === "pending");

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Activity log and alerts for {brand.name}</p>
      </div>

      {/* Alert summary */}
      {(highPriority.length > 0 || negative.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Alerts Requiring Attention</h2>
          {highPriority.length > 0 && (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3" data-testid="alert-high-priority">
              <Bell size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  {highPriority.length} high-priority conversation{highPriority.length !== 1 ? "s" : ""} awaiting review
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                  Brands: {[...new Set(highPriority.flatMap(c => c.brandMentions ?? []))].join(", ") || "—"}
                </p>
              </div>
            </div>
          )}
          {negative.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3" data-testid="alert-negative">
              <Bell size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {negative.length} negative conversation{negative.length !== 1 ? "s" : ""} pending action
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Review and draft responses in the Queue</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity log */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Activity Log</h2>
        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          {activityLoading ? (
            Array.from({length: 5}).map((_, i) => (
              <div key={i} className="px-5 py-3 border-b border-border last:border-0">
                <Skeleton className="h-8 w-full" />
              </div>
            ))
          ) : (activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground px-5 py-8 text-center">No activity yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {(activity ?? []).map(entry => {
                const meta = TYPE_META[entry.type] ?? TYPE_META.capture;
                const Icon = meta.icon;
                return (
                  <div key={entry.id} className="flex items-start gap-3 px-5 py-3" data-testid={`activity-entry-${entry.id}`}>
                    <div className={cn("p-1.5 rounded-lg shrink-0 mt-0.5", meta.color)}>
                      <Icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{entry.description}</p>
                      {entry.conversationId && (
                        <p className="text-xs text-muted-foreground mt-0.5">Conversation: {entry.conversationId}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(entry.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
