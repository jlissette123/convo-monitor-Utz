import { createContext, useContext, useEffect, useState } from "react";
import { loadBrandConfig, applyBrandToDOM, type BrandConfig } from "@/lib/brand";

interface BrandContextValue {
  brand: BrandConfig;
  isDark: boolean;
  toggleTheme: () => void;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand] = useState<BrandConfig>(() => loadBrandConfig());
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // Apply brand + theme to DOM on every change
  useEffect(() => {
    applyBrandToDOM(brand, isDark);
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [brand, isDark]);

  const toggleTheme = () => setIsDark((d) => !d);

  return (
    <BrandContext.Provider value={{ brand, isDark, toggleTheme }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within BrandProvider");
  return ctx;
}
