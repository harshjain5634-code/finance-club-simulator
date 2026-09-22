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
  muted: string;
  primary: string;
};

/** Mirrors the participant-light tokens in app/globals.css; used only before the CSS variables resolve. */
const FALLBACK: ChartPalette = {
  accent: "#2f4bdb",
  positive: "#07775d",
  negative: "#c33620",
  warning: "#a35a00",
  grid: "#eeeeea",
  axis: "#60656e",
  cursor: "#d0cfc8",
  canvas: "#f5f5f2",
  surface: "#ffffff",
  muted: "#60656e",
  primary: "#111318",
};

function readPalette(element: HTMLElement): ChartPalette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    accent: read("--color-accent", FALLBACK.accent),
    positive: read("--color-positive", FALLBACK.positive),
    negative: read("--color-negative", FALLBACK.negative),
    warning: read("--color-warning", FALLBACK.warning),
    grid: read("--color-border-subtle", FALLBACK.grid),
    axis: read("--color-fg-muted", FALLBACK.axis),
    cursor: read("--color-border-strong", FALLBACK.cursor),
    canvas: read("--color-canvas", FALLBACK.canvas),
    surface: read("--color-surface", FALLBACK.surface),
    muted: read("--color-fg-muted", FALLBACK.muted),
    primary: read("--color-fg-primary", FALLBACK.primary),
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

/** Participant themes are user-selectable; host and stage are fixed per surface. */
export type ThemeName = "dark" | "light" | "host" | "stage";
export type ParticipantTheme = "dark" | "light";

const PREFERENCE_KEY = "finsim:theme-preference";

export function readThemePreference(): ParticipantTheme | null {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function writeThemePreference(theme: ParticipantTheme) {
  try {
    localStorage.setItem(PREFERENCE_KEY, theme);
  } catch {
    // Preference is a convenience only.
  }
}

export function applyDocumentTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
}
