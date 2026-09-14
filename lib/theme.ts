"use client";

import { useEffect, useState, type RefObject } from "react";

export type ChartPalette = {
  accent: string;
  positive: string;
  negative: string;
  warning: string;
  grid: string;
  axis: string;
  cursor: string;
  canvas: string;
  surface: string;
};

const FALLBACK: ChartPalette = {
  accent: "#4b8bf5",
  positive: "#22c55e",
  negative: "#f05252",
  warning: "#f5a524",
  grid: "#1f2633",
  axis: "#7a8497",
  cursor: "#2b3444",
  canvas: "#0b0f16",
  surface: "#111620",
};

function readPalette(element: HTMLElement): ChartPalette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    accent: read("--color-accent", FALLBACK.accent),
    positive: read("--color-positive", FALLBACK.positive),
    negative: read("--color-negative", FALLBACK.negative),
    warning: read("--color-warning", FALLBACK.warning),
    grid: read("--color-border", FALLBACK.grid),
    axis: read("--color-fg-muted", FALLBACK.axis),
    cursor: read("--color-border-strong", FALLBACK.cursor),
    canvas: read("--color-canvas", FALLBACK.canvas),
    surface: read("--color-surface", FALLBACK.surface),
  };
}

/**
 * Recharts writes colours into SVG attributes, which don't reliably resolve CSS variables,
 * so charts read the resolved token values and refresh when any data-theme attribute changes.
 */
export function useChartPalette(scope?: RefObject<HTMLElement | null>): ChartPalette {
  const [palette, setPalette] = useState<ChartPalette>(FALLBACK);

  useEffect(() => {
    const element = scope?.current ?? document.documentElement;
    const update = () => setPalette(readPalette(element));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], subtree: true });
    return () => observer.disconnect();
  }, [scope]);

  return palette;
}

export type ThemeName = "dark" | "light";

const PREFERENCE_KEY = "finsim:theme-preference";

export function readThemePreference(): ThemeName | null {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function writeThemePreference(theme: ThemeName) {
  try {
    localStorage.setItem(PREFERENCE_KEY, theme);
  } catch {
    // Preference is a convenience only.
  }
}

export function applyDocumentTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
}
