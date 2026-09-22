"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, InlineBanner } from "@/components/ui/misc";
import { ScreenSkeleton } from "@/components/market/widgets";
import { computeLeaderboard, sharedRanks } from "@/lib/domain/leaderboard";
import type { EventState } from "@/lib/domain/types";
import { useEventByCode } from "@/lib/mock/hooks";
import { startTeamPresence } from "@/lib/mock/runtime";
import { instrumentRows, proposalsForTeam, releasesNewestFirst } from "@/lib/mock/selectors";
import { clearTeamSession, useTeamSession } from "@/lib/mock/session";
import { applyDocumentTheme, readThemePreference, writeThemePreference } from "@/lib/theme";
import { InstrumentSearch } from "./instrument-search";
import { BreakingNewsToast, NewsAlertsMenu, ProposalNotifier } from "./live-alerts";
import { OnboardingDialog } from "./onboarding";
import { ParticipantFrame } from "./participant-frame";
import { stockHref, TerminalContext, useNewsLastSeen } from "./terminal-context";

export function TerminalShell({ children }: { children: ReactNode }) {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code).toUpperCase();
  const router = useRouter();
  const state = useEventByCode(code);
  const session = useTeamSession(code);
  const team = state && session ? state.teams.find((t) => t.id === session.teamId) : undefined;

  useEffect(() => {
    if (session === null) router.replace(`/join/${code}`);
  }, [session, code, router]);

  const presenceEventId = state?.event.id;
  const presenceTeamId = team?.id;
  useEffect(() => {
    if (!presenceEventId || !presenceTeamId) return;
    return startTeamPresence(presenceEventId, presenceTeamId);
  }, [presenceEventId, presenceTeamId]);

  const policy = state?.event.themePolicy;
  useEffect(() => {
    if (!policy) return;
    const theme = policy === "FORCE_LIGHT" ? "light" : policy === "FORCE_DARK" ? "dark" : (readThemePreference() ?? "light");
    applyDocumentTheme(theme);
    return () => applyDocumentTheme("light");
  }, [policy]);

  if (state === null || session === undefined || (session && !team && state)) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <ScreenSkeleton />
      </div>
    );
  }
  if (state === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <EmptyState
          title={`No event with code ${code}`}
          description="Check the event code with your host."
          action={
            <Link href="/join" className="tap-target text-[13px] text-accent-text hover:underline">
              Enter a different code
            </Link>
          }
        />
      </main>
    );
  }
  if (!session || !team) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <ScreenSkeleton />
      </div>
    );
  }

  return (
    <TerminalContext.Provider value={{ code, eventId: state.event.id, teamId: team.id }}>
      <TerminalFrame state={state} code={code} teamId={team.id}>
        {team.status === "DISABLED" && (
          <InlineBanner tone="warning" className="mb-3" title="Your team has been disabled by the host.">
            You can still view the market, but trading is blocked until the host re-enables your team.
          </InlineBanner>
        )}
        {children}
      </TerminalFrame>
      <OnboardingDialog eventId={state.event.id} teamId={team.id} eventName={state.event.name} teamName={team.name} />
    </TerminalContext.Provider>
  );
}

function TerminalFrame({ state, code, teamId, children }: { state: EventState; code: string; teamId: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const team = state.teams.find((t) => t.id === teamId)!;
  const lastSeen = useNewsLastSeen(state.event.id, teamId);
  const rows = useMemo(() => instrumentRows(state, { enabledOnly: true }), [state]);
  const incoming = proposalsForTeam(state, teamId).incomingOpen.length;
  const unreadNews = releasesNewestFirst(state).filter((r) => r.releasedAt > lastSeen).length;
  const standings = useMemo(() => computeLeaderboard(state), [state]);
  const rankLabel = useMemo(() => {
    const shared = sharedRanks(standings)[teamId];
    return shared ? shared.label : null;
  }, [standings, teamId]);

  const signOut = () => {
    clearTeamSession(code);
    router.replace(`/join/${code}`);
  };

  return (
    <ParticipantFrame
      state={state}
      code={code}
      teamName={team.name}
      teamMeta={`${state.event.code}${rankLabel ? ` · Rank ${rankLabel}` : ""}`}
      rankLabel={rankLabel}
      badges={{ incoming, news: pathname.endsWith("/news") ? 0 : unreadNews }}
      onSignOut={signOut}
      search={<InstrumentSearch rows={rows} hrefFor={stockHref(code)} className="w-full" />}
      actions={
        <>
          <ThemeToggle policy={state.event.themePolicy} />
          <NewsAlertsMenu state={state} teamId={teamId} code={code} />
        </>
      }
    >
      {children}
      <BreakingNewsToast state={state} code={code} />
      <ProposalNotifier state={state} teamId={teamId} />
    </ParticipantFrame>
  );
}

function ThemeToggle({ policy }: { policy: EventState["event"]["themePolicy"] }) {
  if (policy !== "PARTICIPANT_CHOICE") return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle light or dark theme"
      onClick={() => {
        const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        writeThemePreference(next);
        applyDocumentTheme(next);
      }}
    >
      <Sun className="size-4 [[data-theme=dark]_&]:hidden" />
      <Moon className="size-4 [[data-theme=light]_&]:hidden" />
    </Button>
  );
}
