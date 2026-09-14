"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/misc";
import { useEventByCode } from "@/lib/mock/hooks";
import { applyDocumentTheme } from "@/lib/theme";
import { ProjectorStage, StageScaler } from "./projector-stage";

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
    applyDocumentTheme(theme === "LIGHT" ? "light" : "dark");
    return () => applyDocumentTheme("dark");
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

  return (
    <StageScaler className="h-dvh w-screen">
      <ProjectorStage state={state} joinUrl={`${origin || "your-site"}/join`} />
    </StageScaler>
  );
}
