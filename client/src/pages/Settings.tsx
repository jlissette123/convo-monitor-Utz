import { useBrand } from "@/components/BrandProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TeamMember } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Settings2, Users, Tag, Palette, ExternalLink, Code, Twitter, Linkedin, Globe, Shield, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Icon size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        on ? "bg-primary" : "bg-muted"
      )}
      role="switch"
      aria-checked={on}
    >
      <span className={cn(
        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform",
        on ? "translate-x-4" : "translate-x-0"
      )} />
    </button>
  );
}

const PLATFORMS = [
  { id: "twitter",   label: "Twitter / X",   desc: "Public tweets and replies",                           active: true,  soon: false },
  { id: "reddit",    label: "Reddit",         desc: "Posts and comments in relevant subreddits",           active: true,  soon: false },
  { id: "linkedin",  label: "LinkedIn",       desc: "Posts and articles from professionals",               active: true,  soon: false },
  { id: "blog",      label: "Blogs & News",   desc: "Articles indexed via Google News and RSS feeds",      active: true,  soon: false },
  { id: "instagram", label: "Instagram",      desc: "Public posts and captions",                           active: false, soon: true  },
  { id: "tiktok",    label: "TikTok",         desc: "Video captions and comments",                         active: false, soon: true  },
];

const DEFAULT_NOTIFICATIONS = [
  { id: "high_priority",   label: "High priority conversations",  desc: "Alert when a high-priority mention is captured",     on: true  },
  { id: "negative_spike",  label: "Negative sentiment spike",     desc: "Alert when negative sentiment increases rapidly",    on: true  },
  { id: "viral_posts",     label: "Viral posts",                  desc: "Alert when a post reaches high engagement",          on: true  },
  { id: "authority",       label: "Authority mention",            desc: "Alert when a verified or high-follower account mentions the brand", on: false },
  { id: "blog_coverage",   label: "Blog coverage",                desc: "Alert when a new blog article mentions the brand",   on: true  },
  { id: "reply_approved",  label: "Reply approved",               desc: "Alert when a draft reply is approved by a reviewer", on: false },
];

export function Settings() {
  const { brand } = useBrand();

  const { data: team, isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
    queryFn: () => apiRequest("GET", "/api/team").then(r => r.json()),
  });

  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);

  function toggleNotification(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, on: !n.on } : n));
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Monitoring configuration and platform settings</p>
      </div>

      {/* Brand Monitors */}
      <Section title="Brand Monitors" icon={Tag}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Brands and keywords being actively monitored. Configure via{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">VITE_BRAND_MONITORED_BRANDS</code> environment variable.
          </p>
          <div className="flex flex-wrap gap-2">
            {brand.monitoredBrands.map(b => (
              <Badge key={b} className="text-xs py-1 px-2.5" data-testid={`brand-tag-${b}`}>{b}</Badge>
            ))}
          </div>
          {brand.monitoredKeywords.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Keywords: {brand.monitoredKeywords.join(", ")}
            </p>
          )}
        </div>
      </Section>

      {/* Monitored Sources */}
      <Section title="Monitored Sources" icon={Globe}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLATFORMS.map(p => (
            <div key={p.id} className="flex items-start gap-3 bg-muted/30 rounded-lg p-3 border border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{p.label}</p>
                  {p.soon ? (
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Coming soon</span>
                  ) : (
                    <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded font-medium">Active</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Notification Rules */}
      <Section title="Notification Rules" icon={Settings2}>
        <div className="space-y-4">
          {notifications.map(n => (
            <div key={n.id} className="flex items-center justify-between gap-4" data-testid={`notif-rule-${n.id}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
              </div>
              <Toggle on={n.on} onToggle={() => toggleNotification(n.id)} />
            </div>
          ))}
        </div>
      </Section>

      {/* Team Access */}
      <Section title="Team Access" icon={Users}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Manage who has access to this monitor.</p>
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5">
              <UserPlus size={12} />
              Invite team member
            </Button>
          </div>
          {teamLoading ? (
            Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
          ) : (team ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No team members yet.</p>
          ) : (team ?? []).map(member => (
            <div key={member.id} className="flex items-center gap-3" data-testid={`team-member-${member.id}`}>
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {member.avatarInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </div>
              <Badge variant="secondary" className="text-xs capitalize">{member.role}</Badge>
            </div>
          ))}
        </div>
      </Section>

      {/* AI Non-Posting Policy */}
      <Section title="AI Non-Posting Policy" icon={Shield}>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">This platform never posts automatically.</p>
          <p>All AI-generated draft replies require human review and approval before they can be sent. No content is published to any platform without explicit reviewer action in the Reply Studio.</p>
          <p className="text-xs">This policy cannot be changed — it is enforced at the infrastructure level.</p>
        </div>
      </Section>

      {/* Configuration Reference */}
      <Section title="Configuration Reference" icon={Code}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Deploy this platform for any brand by setting these environment variables in Railway (or any host) before the build.</p>
          <div className="bg-muted/50 rounded-lg p-4 text-xs font-mono space-y-1.5 overflow-x-auto">
            {[
              ["VITE_BRAND_NAME",               brand.name],
              ["VITE_BRAND_TAGLINE",            brand.tagline],
              ["VITE_BRAND_PRIMARY_H",          String(brand.primary.h)],
              ["VITE_BRAND_PRIMARY_S",          String(brand.primary.s)],
              ["VITE_BRAND_PRIMARY_L",          String(brand.primary.l)],
              ["VITE_BRAND_DARK_PRIMARY_H",     String(brand.darkPrimary.h)],
              ["VITE_BRAND_DARK_PRIMARY_S",     String(brand.darkPrimary.s)],
              ["VITE_BRAND_DARK_PRIMARY_L",     String(brand.darkPrimary.l)],
              ["VITE_BRAND_MONITORED_BRANDS",   brand.monitoredBrands.join(",")],
              ["VITE_BRAND_MONITORED_KEYWORDS", brand.monitoredKeywords.join(",") || "(optional)"],
              ["VITE_BRAND_FONT_HEADING",       brand.fontHeading],
              ["VITE_BRAND_FONT_BODY",          brand.fontBody],
              ["VITE_BRAND_SUPPORT_EMAIL",      brand.supportEmail],
              ["TAVILY_API_KEY",                "(server-side — never expose to frontend)"],
              ["NODE_ENV",                      "production"],
              ["PORT",                          "5000"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2 min-w-0">
                <span className="text-primary shrink-0">{k}</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-foreground break-all">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
