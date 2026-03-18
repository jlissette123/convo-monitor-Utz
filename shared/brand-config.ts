/**
 * White-Label Brand Configuration
 *
 * All values are driven by environment variables so any brand can be applied
 * without touching source code.  Frontend reads them via VITE_ prefixed vars;
 * the Express server serves the /api/brand-config endpoint that returns the
 * same values for runtime consumption.
 *
 * ── REQUIRED ENV VARS ──────────────────────────────────────────────────────
 *   VITE_BRAND_NAME            Display name  e.g. "AquaWatch"
 *   VITE_BRAND_TAGLINE         Short tagline e.g. "Conversation Intelligence"
 *
 * ── OPTIONAL ENV VARS ──────────────────────────────────────────────────────
 *   VITE_BRAND_LOGO_URL        URL to logo image (falls back to SVG monogram)
 *   VITE_BRAND_FAVICON_URL     URL to favicon (falls back to generated SVG)
 *
 *   VITE_BRAND_PRIMARY_H       HSL hue   (0-360)       default: 183
 *   VITE_BRAND_PRIMARY_S       HSL sat % (0-100)        default: 98
 *   VITE_BRAND_PRIMARY_L       HSL light % (0-100)      default: 22
 *
 *   VITE_BRAND_DARK_PRIMARY_H  Dark-mode hue            default: 188
 *   VITE_BRAND_DARK_PRIMARY_S  Dark-mode sat %          default: 35
 *   VITE_BRAND_DARK_PRIMARY_L  Dark-mode light %        default: 47
 *
 *   VITE_BRAND_MONITORED_BRANDS   Comma-separated brand names to monitor
 *                                 e.g. "Utz Snacks,Zapp's,Dirty Potato Chips"
 *   VITE_BRAND_MONITORED_KEYWORDS Comma-separated keywords to track
 *                                 e.g. "salty snacks,potato chips,tortilla chips"
 *
 *   VITE_BRAND_FONT_HEADING    Google/Fontshare font name for headings
 *                              e.g. "Cabinet Grotesk"  default: "Cabinet Grotesk"
 *   VITE_BRAND_FONT_BODY       Font name for body text
 *                              e.g. "General Sans"     default: "General Sans"
 *
 *   VITE_BRAND_SUPPORT_EMAIL   Support / team email shown in Settings
 *   VITE_BRAND_PRIVACY_URL     Privacy policy URL
 *   VITE_BRAND_TERMS_URL       Terms of service URL
 *   VITE_BRAND_PLATFORM_DOMAIN Custom platform domain (used in meta tags)
 *
 *   TAVILY_API_KEY             Server-side Tavily search API key
 */

export interface BrandConfig {
  name: string;
  tagline: string;
  logoUrl?: string;
  faviconUrl?: string;
  primary: { h: number; s: number; l: number };
  darkPrimary: { h: number; s: number; l: number };
  monitoredBrands: string[];
  monitoredKeywords: string[];
  fontHeading: string;
  fontBody: string;
  supportEmail: string;
  privacyUrl?: string;
  termsUrl?: string;
  platformDomain?: string;
}

function num(v: string | undefined, fallback: number): number {
  const parsed = parseFloat(v ?? "");
  return isNaN(parsed) ? fallback : parsed;
}

function list(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Reads from import.meta.env (Vite) — use in frontend only */
export function getBrandConfigFromEnv(): BrandConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    name:             env.VITE_BRAND_NAME     ?? "ConvoMonitor",
    tagline:          env.VITE_BRAND_TAGLINE  ?? "Conversation Intelligence Platform",
    logoUrl:          env.VITE_BRAND_LOGO_URL,
    faviconUrl:       env.VITE_BRAND_FAVICON_URL,
    primary: {
      h: num(env.VITE_BRAND_PRIMARY_H, 183),
      s: num(env.VITE_BRAND_PRIMARY_S, 98),
      l: num(env.VITE_BRAND_PRIMARY_L, 22),
    },
    darkPrimary: {
      h: num(env.VITE_BRAND_DARK_PRIMARY_H, 188),
      s: num(env.VITE_BRAND_DARK_PRIMARY_S, 35),
      l: num(env.VITE_BRAND_DARK_PRIMARY_L, 47),
    },
    monitoredBrands:   list(env.VITE_BRAND_MONITORED_BRANDS)   || ["Your Brand"],
    monitoredKeywords: list(env.VITE_BRAND_MONITORED_KEYWORDS) || [],
    fontHeading:       env.VITE_BRAND_FONT_HEADING ?? "Cabinet Grotesk",
    fontBody:          env.VITE_BRAND_FONT_BODY    ?? "General Sans",
    supportEmail:      env.VITE_BRAND_SUPPORT_EMAIL ?? "team@example.com",
    privacyUrl:        env.VITE_BRAND_PRIVACY_URL,
    termsUrl:          env.VITE_BRAND_TERMS_URL,
    platformDomain:    env.VITE_BRAND_PLATFORM_DOMAIN,
  };
}

/** Reads from process.env — use in Express server only */
export function getBrandConfigFromProcess(): BrandConfig {
  return {
    name:             process.env.VITE_BRAND_NAME     ?? "ConvoMonitor",
    tagline:          process.env.VITE_BRAND_TAGLINE  ?? "Conversation Intelligence Platform",
    logoUrl:          process.env.VITE_BRAND_LOGO_URL,
    faviconUrl:       process.env.VITE_BRAND_FAVICON_URL,
    primary: {
      h: num(process.env.VITE_BRAND_PRIMARY_H, 183),
      s: num(process.env.VITE_BRAND_PRIMARY_S, 98),
      l: num(process.env.VITE_BRAND_PRIMARY_L, 22),
    },
    darkPrimary: {
      h: num(process.env.VITE_BRAND_DARK_PRIMARY_H, 188),
      s: num(process.env.VITE_BRAND_DARK_PRIMARY_S, 35),
      l: num(process.env.VITE_BRAND_DARK_PRIMARY_L, 47),
    },
    monitoredBrands:   list(process.env.VITE_BRAND_MONITORED_BRANDS)   || ["Your Brand"],
    monitoredKeywords: list(process.env.VITE_BRAND_MONITORED_KEYWORDS) || [],
    fontHeading:       process.env.VITE_BRAND_FONT_HEADING ?? "Cabinet Grotesk",
    fontBody:          process.env.VITE_BRAND_FONT_BODY    ?? "General Sans",
    supportEmail:      process.env.VITE_BRAND_SUPPORT_EMAIL ?? "team@example.com",
    privacyUrl:        process.env.VITE_BRAND_PRIVACY_URL,
    termsUrl:          process.env.VITE_BRAND_TERMS_URL,
    platformDomain:    process.env.VITE_BRAND_PLATFORM_DOMAIN,
  };
}
