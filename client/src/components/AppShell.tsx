import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import {
  LayoutDashboard, MessageSquare, Edit3, BookOpen,
  Bell, Settings, Sun, Moon, Menu, X, Wifi, BarChart2, TrendingDown, Users,
} from "lucide-react";
import { useBrand } from "./BrandProvider";
import { BrandLogo } from "./BrandLogo";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
  {
    label: "MONITOR",
    items: [
      { path: "/",          icon: LayoutDashboard, label: "Dashboard",            badge: false, red: false },
      { path: "/negative",  icon: TrendingDown,    label: "Negative Sentiment",   badge: true,  red: true  },
      { path: "/queue",     icon: MessageSquare,   label: "Conversation Inbox",   badge: true,  red: false },
      { path: "/culture",   icon: Users,           label: "Culture Monitor",       badge: true,  red: false },
      { path: "/studio",    icon: Edit3,           label: "Reply Studio",         badge: false, red: false },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { path: "/knowledge", icon: BookOpen,   label: "Knowledge Base", badge: false },
      { path: "/analytics", icon: BarChart2,  label: "Analytics",      badge: false },
      { path: "/settings",  icon: Settings,   label: "Settings",       badge: false },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { brand, isDark, toggleTheme } = useBrand();
  const [location] = useHashLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: stats } = useQuery<{ pending: number; negative?: number }>({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
    refetchInterval: 30000,
  });
  const { data: cultureStats } = useQuery<{ pending: number }>({
    queryKey: ["/api/culture-reviews/stats"],
    queryFn: () => apiRequest("GET", "/api/culture-reviews/stats").then(r => r.json()),
    refetchInterval: 30000,
  });
  const pendingCount  = stats?.pending ?? 0;
  const negativeCount = stats?.negative ?? 0;
  const cultureCount  = cultureStats?.pending ?? 0;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar — dark navy matching GlacialAI */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col w-56 transition-transform duration-200",
          "bg-[hsl(222,20%,10%)] border-r border-[hsl(220,10%,18%)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[hsl(220,10%,18%)] min-h-[60px]">
          <BrandLogo size={32} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate text-white">{brand.name}</p>
            <p className="text-xs text-[hsl(220,8%,55%)] truncate">{brand.tagline}</p>
          </div>
        </div>

        {/* Nav with section labels */}
        <nav className="flex-1 py-4 overflow-y-auto" data-testid="sidebar-nav">
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label} className="mb-4">
              <p className="px-4 mb-1 text-[10px] font-semibold tracking-widest text-[hsl(220,8%,42%)] uppercase">
                {label}
              </p>
              {items.map(({ path, icon: Icon, label: itemLabel, badge, red }) => {
                const active = location === path || (path !== "/" && location.startsWith(path));
                const count = red ? negativeCount : path === "/culture" ? cultureCount : pendingCount;
                return (
                  <Link
                    key={path}
                    href={path}
                    data-testid={`nav-${itemLabel.toLowerCase().replace(/\s+/g, "-")}`}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                      active
                        ? red
                          ? "bg-red-500/10 text-red-400 font-medium border-r-2 border-red-500"
                          : "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] font-medium border-r-2 border-[hsl(var(--primary))]"
                        : red
                          ? "text-red-400 hover:bg-red-500/10 hover:text-red-400"
                          : "text-[hsl(220,8%,65%)] hover:bg-[hsl(220,10%,15%)] hover:text-white"
                    )}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon size={15} />
                    <span className="flex-1">{itemLabel}</span>
                    {badge && count > 0 && (
                      <span className={cn(
                        "text-xs rounded-full px-1.5 py-0.5 font-medium min-w-[20px] text-center",
                        red
                          ? "bg-red-500 text-white"
                          : "bg-primary text-primary-foreground"
                      )}>
                        {count > 999 ? "999+" : count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-[hsl(220,10%,18%)] space-y-2">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Monitoring active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[hsl(220,8%,45%)]">
              {brand.monitoredBrands.length} brand{brand.monitoredBrands.length !== 1 ? "s" : ""} tracked
            </span>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded hover:bg-[hsl(220,10%,15%)] text-[hsl(220,8%,55%)]"
              aria-label="Toggle theme"
              data-testid="button-toggle-theme"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
          {/* User identity */}
          <div className="flex items-center gap-2 pt-1">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
              JL
            </div>
            <div className="min-w-0">
              <p className="text-xs text-white truncate">{brand.supportEmail?.split("@")[0] ?? "Admin"}</p>
              <p className="text-[10px] text-[hsl(220,8%,45%)]">Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile topbar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-50 flex items-center gap-3 px-4 py-3 bg-[hsl(222,20%,10%)] border-b border-[hsl(220,10%,18%)] h-[60px]">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1 rounded text-white"
          data-testid="button-mobile-menu"
        >
          <Menu size={20} />
        </button>
        <BrandLogo size={24} />
        <span className="font-bold text-sm text-white">{brand.name}</span>
      </div>

      {/* Main content */}
      <main className="flex-1 md:ml-56 overflow-y-auto">
        <div className="pt-[60px] md:pt-0 min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
