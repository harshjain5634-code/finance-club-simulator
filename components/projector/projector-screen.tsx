"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Maximize } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import type { ProjectorScene } from "@/lib/domain/types";
import { useEventByCode } from "@/lib/mock/hooks";
import { applyDocumentTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ProjectorStage, StageScaler, type StageOverride } from "./projector-stage";

/** `?scene=` values for reviewing a single scene on this screen only; the shared rotation is untouched. */
const SCENE_PARAM: Record<string, ProjectorScene> = {
  standby: "STANDBY",
  round: "ROUND_STATUS",
  leaderboard: "LEADERBOARD",
  market: "MARKET_BOARD",
  movers: "TOP_MOVERS",
  news: "NEWS_WALL",
  message: "CUSTOM_MESSAGE",
  final: "FINAL_RESULTS",
};

/** Full-screen audience display. No controls; the host configures everything from the console. */
export function ProjectorScreen() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const code = decodeURIComponent(params.code).toUpperCase();
  const state = useEventByCode(code);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const host = window.location.host;
    window.requestAnimationFrame(() => setOrigin(host));
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);

  const theme = state?.event.projector.theme;
  useEffect(() => {
    if (!theme) return;
    applyDocumentTheme(theme === "LIGHT" ? "light" : "stage");
    return () => applyDocumentTheme("light");
  }, [theme]);

  if (state === null) return <div className="h-dvh bg-black" aria-busy="true" />;
  if (state === undefined) {
    return (
      <main className="grid h-dvh place-items-center bg-canvas">
        <EmptyState title={`No event with code ${code}`} description="Check the projector link in the host console." />
      </main>
    );
  }
  const key = searchParams.get("key");
  if (key !== null && key !== state.event.projector.projectorKey) {
    return (
      <main className="grid h-dvh place-items-center bg-canvas">
        <EmptyState title="This projector link is no longer valid" description="Open the projector again from Host console → Projector. The link may have been regenerated." />
      </main>
    );
  }

  const sceneParam = searchParams.get("scene")?.toLowerCase() ?? null;
  const override: StageOverride | null = sceneParam === "breaking" ? { breaking: true } : sceneParam && SCENE_PARAM[sceneParam] ? { scene: SCENE_PARAM[sceneParam] } : null;
  const breakingUnavailable = sceneParam === "breaking" && state.newsReleases.length === 0;

  return (
    <IdleCursor>
      {/* The stage is display typography; this is the page's one real heading. */}
      <h1 className="sr-only">{state.event.name} — audience display</h1>
      <StageScaler className="h-dvh w-screen">
        <ProjectorStage state={state} joinUrl={`${origin || "your-site"}/join`} override={override} />
      </StageScaler>
      {breakingUnavailable && (
        <p className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-fg-secondary">No news released yet — release a story from the news desk to preview breaking news.</p>
      )}
    </IdleCursor>
  );
}

/** Hides the cursor while idle and offers a full-screen button when the mouse moves. */
function IdleCursor({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const onMove = () => {
      setActive(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setActive(false), 2500);
    };
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("mousemove", onMove);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  return (
    <div className={cn("relative", !active && "cursor-none")}>
      {children}
      {!fullscreen && (
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className={cn(
            "fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-md border border-border-strong bg-surface-raised/95 px-3 py-2 text-sm font-medium text-fg-primary shadow-lg transition-opacity duration-300",
            active ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <Maximize className="size-4" /> Enter full screen
        </button>
      )}
    </div>
  );
}
