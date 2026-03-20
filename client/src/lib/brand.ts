/**
 * Runtime brand configuration.
 *
 * Reads VITE_BRAND_* environment variables and applies CSS custom properties
 * to document.documentElement so the entire UI reflects the brand without a
 * rebuild.
 *
 * This module is the frontend mirror of shared/brand-config.ts.
 *
 * Default colors: teal H183 S98 L22 (light) / H188 S35 L47 (dark).
 * Color env vars (VITE_BRAND_PRIMARY_H/S/L, VITE_BRAND_DARK_PRIMARY_H/S/L)
 * are OPTIONAL — omit them to use the teal defaults.
 */

/** Semantic build version — bump when forcing a cache-bust deploy. */
export const BUILD_VERSION = "2.0.3";

/** Default teal primary color (light mode). Exported for reference/testing. */
export const DEFAULT_PRIMARY = { h: 183, s: 98, l: 22 } as const;
/** Default teal primary color (dark mode). */
export const DEFAULT_DARK_PRIMARY = { h: 188, s: 35, l: 47 } as const;

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
  const p = parseFloat(v ?? "");
  return isNaN(p) ? fallback : p;
}

function list(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export function loadBrandConfig(): BrandConfig {
  const e = import.meta.env as Record<string, string | undefined>;
  return {
    name:             e.VITE_BRAND_NAME     ?? "ConvoMonitor",
    tagline:          e.VITE_BRAND_TAGLINE  ?? "Conversation Intelligence Platform",
    logoUrl:          e.VITE_BRAND_LOGO_URL,
    faviconUrl:       e.VITE_BRAND_FAVICON_URL,
    primary: {
      h: num(e.VITE_BRAND_PRIMARY_H, 183),
      s: num(e.VITE_BRAND_PRIMARY_S, 98),
      l: num(e.VITE_BRAND_PRIMARY_L, 22),
    },
    darkPrimary: {
      h: num(e.VITE_BRAND_DARK_PRIMARY_H, 188),
      s: num(e.VITE_BRAND_DARK_PRIMARY_S, 35),
      l: num(e.VITE_BRAND_DARK_PRIMARY_L, 47),
    },
    monitoredBrands:   list(e.VITE_BRAND_MONITORED_BRANDS)   || ["Your Brand"],
    monitoredKeywords: list(e.VITE_BRAND_MONITORED_KEYWORDS) || [],
    fontHeading:       e.VITE_BRAND_FONT_HEADING ?? "Cabinet Grotesk",
    fontBody:          e.VITE_BRAND_FONT_BODY    ?? "General Sans",
    supportEmail:      e.VITE_BRAND_SUPPORT_EMAIL ?? "team@example.com",
    privacyUrl:        e.VITE_BRAND_PRIVACY_URL,
    termsUrl:          e.VITE_BRAND_TERMS_URL,
    platformDomain:    e.VITE_BRAND_PLATFORM_DOMAIN,
  };
}

/**
 * Injects CSS custom properties onto :root for the brand's primary color.
 * Also dynamically loads the configured fonts and updates the document title.
 */
export function applyBrandToDOM(cfg: BrandConfig, isDark: boolean): void {
  const root = document.documentElement;
  const { h, s, l } = isDark ? cfg.darkPrimary : cfg.primary;
  const hsl = `${h} ${s}% ${l}%`;
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--sidebar-primary", hsl);
  root.style.setProperty("--sidebar-ring", hsl);
  root.style.setProperty("--ring", hsl);

  // Font override
  const fontStack = `'${cfg.fontHeading}', '${cfg.fontBody}', system-ui, sans-serif`;
  root.style.setProperty("--font-sans", fontStack);

  // Page title
  document.title = cfg.name;

  // Favicon (if custom URL provided)
  if (cfg.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = cfg.faviconUrl;
  }
}
