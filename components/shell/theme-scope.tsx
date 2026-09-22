"use client";

import { useEffect, type ReactNode } from "react";
import { applyDocumentTheme, type ThemeName } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type Density = "comfortable" | "compact" | "touch";

/**
 * Pins a C4 colour mode and density to a surface (host console, projector). The wrapper styles its own subtree
 * immediately; the document attributes follow so portalled dialogs, sheets and toasts match.
 */
export function ThemeScope({ theme, density = "comfortable", className, children }: { theme: ThemeName; density?: Density; className?: string; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.theme;
    const previousDensity = root.dataset.density;
    applyDocumentTheme(theme);
    root.dataset.density = density;
    return () => {
      if (previousTheme) root.dataset.theme = previousTheme;
      if (previousDensity) root.dataset.density = previousDensity;
      else delete root.dataset.density;
    };
  }, [theme, density]);

  return (
    <div data-theme={theme} data-density={density} className={cn("min-h-dvh bg-canvas text-fg-primary", className)}>
      {children}
    </div>
  );
}
