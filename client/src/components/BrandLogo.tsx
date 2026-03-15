import { useBrand } from "./BrandProvider";

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * Renders either a custom logo image (if VITE_BRAND_LOGO_URL is set)
 * or a generated SVG monogram derived from the brand name.
 */
export function BrandLogo({ size = 32, className = "" }: BrandLogoProps) {
  const { brand } = useBrand();

  if (brand.logoUrl) {
    return (
      <img
        src={brand.logoUrl}
        alt={brand.name}
        width={size}
        height={size}
        className={`object-contain rounded ${className}`}
        data-testid="brand-logo-image"
      />
    );
  }

  // Generate monogram from first letters of first two words
  const words = brand.name.trim().split(/\s+/);
  const monogram = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : brand.name.slice(0, 2).toUpperCase();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label={brand.name}
      className={`flex-shrink-0 ${className}`}
      data-testid="brand-logo-svg"
    >
      <rect width="32" height="32" rx="7" fill="hsl(var(--primary))" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontSize={monogram.length === 2 ? "13" : "14"}
        fontWeight="700"
        fontFamily="var(--font-sans)"
        fill="hsl(var(--primary-foreground))"
      >
        {monogram}
      </text>
    </svg>
  );
}
