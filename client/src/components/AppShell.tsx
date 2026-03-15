import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import {
  LayoutDashboard, MessageSquare, Edit3, BookOpen,
  Bell, Settings, Sun, Moon, Menu, X, Wifi, BarChart2,
} from "lucide-react";
import { useBrand } from "./BrandProvider";
import { BrandLogo } from "./BrandLogo";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const NAV = [
  { path: "/",            icon: LayoutDashboard, label: "Dashboard",          badge: false },
  { path: "/queue",       icon: MessageSquare,   label: "Conversation Inbox", badge: true  },
  { path: "/studio",      icon: Edit3,           label: "Reply Studio",       badge: false },
  { path: "/knowledge",   icon: BookOpen,        label: "Knowledge Base",     badge: false },
  { path: "/analytics",   icon: BarChart2,       label: "Analytics",          badge: false },
  { path: "/settings",    icon: Settings,        label: "Settings",           badge: false },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { brand, isDark, toggleTheme } = useBrand();
  const [location] = useHashLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: stats } = useQuery<{ pending: number }>({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
    refetchInterval: 30000,
  });
  const pendingCount = stats?.pending ?? 0;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border min-h-[60px]">
          <BrandLogo size={32} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate text-sidebar-foreground">{brand.name}</p>
            <p className="text-xs text-muted-foreground truncate">{brand.tagline}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto" data-testid="sidebar-nav">
          {NAV.map(({ path, icon: Icon, label, badge }) => {
            const active = location === path || (path !== "/" && location.startsWith(path));
            return (
              <Link key={path} href={path}
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {badge && pendingCount > 0 && (
                  <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-medium min-w-[20px] text-center">
                    {pendingCount > 999 ? "999+" : pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wifi size={12} className="text-emerald-500" />
            <span>Monitoring active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {brand.monitoredBrands.length} brand{brand.monitoredBrands.length !== 1 ? "s" : ""} tracked
            </span>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded hover:bg-sidebar-accent text-sidebar-foreground"
              aria-label="Toggle theme"
              data-testid="button-toggle-theme"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
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
      <div className="md:hidden fixed top-0 inset-x-0 z-50 flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-sidebar-border h-[60px]">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1 rounded text-sidebar-foreground"
          data-testid="button-mobile-menu"
        >
          <Menu size={20} />
        </button>
        <BrandLogo size={24} />
        <span className="font-bold text-sm">{brand.name}</span>
      </div>

      {/* Main content */}
      <main className="flex-1 md:ml-64 overflow-y-auto">
        <div className="pt-[60px] md:pt-0 min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
