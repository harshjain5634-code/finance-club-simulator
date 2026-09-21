"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Sun } from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { AppFrame } from "@/components/shell/app-frame";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, InlineBanner } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/controls";
import { SessionChip, useRoundClock } from "@/components/market/round-clock";
import { ScreenSkeleton } from "@/components/market/widgets";
import { formatINR } from "@/lib/domain/money";
import { teamCash } from "@/lib/domain/portfolio";
import type { EventState, MarketState } from "@/lib/domain/types";
import { participantNav, participantTitle } from "@/lib/navigation";
import { useEventByCode } from "@/lib/mock/hooks";
import { startTeamPresence } from "@/lib/mock/runtime";
import { instrumentRows, proposalsForTeam, releasesNewestFirst } from "@/lib/mock/selectors";
import { clearTeamSession, useTeamSession } from "@/lib/mock/session";
import { applyDocumentTheme, readThemePreference, writeThemePreference } from "@/lib/theme";
import { InstrumentSearch } from "./instrument-search";
import { BreakingNewsToast, NewsAlertsMenu, ProposalNotifier } from "./live-alerts";
import { OnboardingDialog } from "./onboarding";
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
    const theme = policy === "FORCE_LIGHT" ? "light" : policy === "FORCE_DARK" ? "dark" : (readThemePreference() ?? "dark");
    applyDocumentTheme(theme);
    return () => applyDocumentTheme("dark");
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
            <Link href="/join" className="text-[13px] text-accent hover:underline">
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
  const { marketState } = useRoundClock(state);

  const signOut = () => {
    clearTeamSession(code);
    router.replace(`/join/${code}`);
  };

  return (
    <AppFrame
      label="Team terminal navigation"
      nav={participantNav(code)}
      badges={{ incoming, news: pathname.endsWith("/news") ? 0 : unreadNews }}
      sidebarHeader={<Brand href={`/event/${code}/dashboard`} subtitle={state.event.name} />}
      sidebarFooter={
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface-raised px-2.5 py-2">
          <Avatar name={team.name} tone="accent" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium text-fg-primary">{team.name}</span>
            <span className="block truncate font-mono text-[11px] text-fg-muted">
              {team.loginCode} · {state.event.code}
            </span>
          </span>
          <Tooltip content="Sign out of this team session">
            <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label="Sign out">
              <LogOut className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      }
      topBar={({ openNav, navOpen }) => (
        <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:flex-nowrap">
          <Button variant="ghost" size="icon" onClick={openNav} aria-label="Open navigation" aria-controls="app-sidebar" aria-expanded={navOpen} className="-ml-1.5 lg:hidden">
            <Menu className="size-4" />
          </Button>
          {/* Wayfinding label, not the page heading: each screen renders its own <h1> below. */}
          <p className="mr-auto truncate text-[15px] font-semibold tracking-tight text-fg-primary lg:mr-0 lg:w-28">{participantTitle(pathname, code)}</p>
          <InstrumentSearch rows={rows} hrefFor={stockHref(code)} className="order-last w-full md:order-none md:w-52 xl:w-64" />
          <div className="flex items-center gap-2 md:ml-auto">
            <SessionChip state={state} className="hidden md:flex" />
            <div className="hidden h-8 flex-col justify-center border-l border-border pl-3 leading-tight xl:flex">
              <span className="text-[11px] font-medium tracking-wide text-fg-muted uppercase">Cash</span>
              <span className="text-[13px] font-medium text-fg-primary tabular-nums">{formatINR(teamCash(state, teamId))}</span>
            </div>
            <ThemeToggle policy={state.event.themePolicy} />
            <NewsAlertsMenu state={state} teamId={teamId} code={code} />
          </div>
          <SessionChip state={state} className="w-full md:hidden [&>span:first-child]:flex-1" />
        </div>
      )}
      banner={<MarketNotice marketState={marketState} />}
    >
      {children}
      <BreakingNewsToast state={state} code={code} />
      <ProposalNotifier state={state} teamId={teamId} />
    </AppFrame>
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

/** Only the two states that block trading unexpectedly get a global banner; the rest is shown in the session chip. */
function MarketNotice({ marketState }: { marketState: MarketState }) {
  if (marketState !== "FROZEN" && marketState !== "PAUSED") return null;
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pt-3 sm:px-6">
      <InlineBanner tone="warning" title={marketState === "FROZEN" ? "Trading frozen by host." : "Trading is paused."}>
        {marketState === "FROZEN" ? "Proposals cannot be sent or accepted until the host reopens the market." : "The round timer is on hold. Trading resumes when the host restarts the round."}
      </InlineBanner>
    </div>
  );
}
