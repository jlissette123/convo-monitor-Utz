import { useBrand } from "@/components/BrandProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TeamMember } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, Users, Tag, Palette, ExternalLink, Code } from "lucide-react";

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

export function Settings() {
  const { brand } = useBrand();

  const { data: team, isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
    queryFn: () => apiRequest("GET", "/api/team").then(r => r.json()),
  });

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Brand configuration and platform settings</p>
      </div>

      {/* Brand Identity */}
      <Section title="Brand Identity" icon={Palette}>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <BrandLogo size={48} />
            <div>
              <p className="font-semibold">{brand.name}</p>
              <p className="text-sm text-muted-foreground">{brand.tagline}</p>
              {brand.platformDomain && (
                <a href={`https://${brand.platformDomain}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary flex items-center gap-1 mt-1 hover:underline">
                  {brand.platformDomain} <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Primary Color (light)</p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="w-5 h-5 rounded border border-border"
                  style={{ background: `hsl(${brand.primary.h} ${brand.primary.s}% ${brand.primary.l}%)` }}
                />
                <code className="text-xs">hsl({brand.primary.h} {brand.primary.s}% {brand.primary.l}%)</code>
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Primary Color (dark)</p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="w-5 h-5 rounded border border-border"
                  style={{ background: `hsl(${brand.darkPrimary.h} ${brand.darkPrimary.s}% ${brand.darkPrimary.l}%)` }}
                />
                <code className="text-xs">hsl({brand.darkPrimary.h} {brand.darkPrimary.s}% {brand.darkPrimary.l}%)</code>
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Heading Font</p>
              <p className="font-medium mt-1 text-xs">{brand.fontHeading}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Body Font</p>
              <p className="font-medium mt-1 text-xs">{brand.fontBody}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Monitored Brands */}
      <Section title="Monitored Brands" icon={Tag}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Set via <code className="bg-muted px-1 py-0.5 rounded text-xs">VITE_BRAND_MONITORED_BRANDS</code> environment variable.</p>
          <div className="flex flex-wrap gap-2">
            {brand.monitoredBrands.map(b => (
              <Badge key={b} className="text-sm py-1 px-3" data-testid={`brand-tag-${b}`}>{b}</Badge>
            ))}
          </div>
          {brand.monitoredKeywords.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mt-2">Keywords: {brand.monitoredKeywords.join(", ")}</p>
            </>
          )}
        </div>
      </Section>

      {/* Team */}
      <Section title="Team Access" icon={Users}>
        <div className="space-y-3">
          {teamLoading ? (
            Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
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

      {/* Environment Variables Reference */}
      <Section title="Configuration Reference" icon={Code}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Configure this platform for any brand by setting these environment variables before deployment.</p>
          <div className="bg-muted/50 rounded-lg p-4 text-xs font-mono space-y-1.5 overflow-x-auto">
            {[
              ["VITE_BRAND_NAME", brand.name],
              ["VITE_BRAND_TAGLINE", brand.tagline],
              ["VITE_BRAND_LOGO_URL", brand.logoUrl ?? "(optional)"],
              ["VITE_BRAND_PRIMARY_H", String(brand.primary.h)],
              ["VITE_BRAND_PRIMARY_S", String(brand.primary.s)],
              ["VITE_BRAND_PRIMARY_L", String(brand.primary.l)],
              ["VITE_BRAND_DARK_PRIMARY_H", String(brand.darkPrimary.h)],
              ["VITE_BRAND_DARK_PRIMARY_S", String(brand.darkPrimary.s)],
              ["VITE_BRAND_DARK_PRIMARY_L", String(brand.darkPrimary.l)],
              ["VITE_BRAND_MONITORED_BRANDS", brand.monitoredBrands.join(",")],
              ["VITE_BRAND_MONITORED_KEYWORDS", brand.monitoredKeywords.join(",") || "(optional)"],
              ["VITE_BRAND_FONT_HEADING", brand.fontHeading],
              ["VITE_BRAND_FONT_BODY", brand.fontBody],
              ["VITE_BRAND_SUPPORT_EMAIL", brand.supportEmail],
              ["TAVILY_API_KEY", "(server-side only)"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2 min-w-0">
                <span className="text-primary shrink-0">{k}</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-foreground break-all">{v}</span>
              </div>
            ))}
          </div>
          {brand.supportEmail && (
            <p className="text-xs text-muted-foreground">Support: <a href={`mailto:${brand.supportEmail}`} className="text-primary hover:underline">{brand.supportEmail}</a></p>
          )}
          {brand.privacyUrl && (
            <a href={brand.privacyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              Privacy Policy <ExternalLink size={10} />
            </a>
          )}
        </div>
      </Section>
    </div>
  );
}
