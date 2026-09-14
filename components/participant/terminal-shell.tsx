"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { BookOpen, LogOut, Menu, Moon, PauseCircle, Snowflake, Sun, Timer } from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { AppFrame } from "@/components/shell/app-frame";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, InlineBanner } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/controls";
import { MarketStateBadge } from "@/components/market/status";
import { RoundPill, useRoundClock } from "@/components/market/round-clock";
import { ScreenSkeleton } from "@/components/market/widgets";
import { formatINR } from "@/lib/domain/money";
import { teamCash } from "@/lib/domain/portfolio";
import type { EventState, MarketState } from "@/lib/domain/types";
import { formatDuration } from "@/lib/format";
import { participantNav, participantTitle } from "@/lib/navigation";
import { useEventByCode } from "@/lib/mock/hooks";
import { startTeamPresence } from "@/lib/mock/runtime";
import { instrumentRows, proposalsForTeam, releasesNewestFirst } from "@/lib/mock/selectors";
import { clearTeamSession, useTeamSession } from "@/lib/mock/session";
import { applyDocumentTheme, readThemePreference, writeThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { InstrumentSearch } from "./instrument-search";
import { BreakingNewsAlert, NewsAlertsMenu, ProposalNotifier } from "./live-alerts";
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

  if (state === null || session === undefined) {
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
  const { marketState, round, remaining } = useRoundClock(state);

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
        <>
          <Link
            href={`/event/${code}/rules`}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
              pathname.endsWith("/rules") ? "bg-surface-hover font-medium text-fg-primary" : "text-fg-secondary hover:bg-surface-hover/70 hover:text-fg-primary",
            )}
          >
            <BookOpen className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
            Rules
          </Link>
          <div className="mt-3 flex items-center gap-2.5 rounded-md border border-border bg-surface-raised px-2.5 py-2">
            <Avatar name={team.name} tone="accent" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-fg-primary">{team.name}</span>
              <span className="block truncate font-mono text-[11px] text-fg-muted">{team.loginCode} · {state.event.code}</span>
            </span>
            <Tooltip content="Sign out of this team session">
              <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label="Sign out">
                <LogOut className="size-3.5" />
              </Button>
            </Tooltip>
          </div>
        </>
      }
      topBar={({ openNav, navOpen }) => (
        <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:flex-nowrap">
          <Button variant="ghost" size="icon" onClick={openNav} aria-label="Open navigation" aria-controls="app-sidebar" aria-expanded={navOpen} className="-ml-1.5 lg:hidden">
            <Menu className="size-4" />
          </Button>
          <h1 className="mr-auto truncate text-[15px] font-semibold tracking-tight text-fg-primary lg:mr-0 lg:w-32 xl:w-36">{participantTitle(pathname, code)}</h1>
          <InstrumentSearch rows={rows} hrefFor={stockHref(code)} className="order-last w-full lg:order-none lg:w-56 xl:w-72" />
          <div className="flex items-center gap-2 lg:ml-auto">
            <span className="hidden md:contents">
              <RoundPill state={state} />
            </span>
            <span className="hidden md:contents">
              <MarketStateBadge state={marketState} size="md" />
            </span>
            <div className="hidden h-8 flex-col justify-center border-l border-border pl-3 leading-tight xl:flex">
              <span className="text-[10px] font-medium tracking-wide text-fg-muted uppercase">Cash</span>
              <span className="text-[13px] font-medium text-fg-primary tabular-nums">{formatINR(teamCash(state, teamId))}</span>
            </div>
            <ThemeToggle policy={state.event.themePolicy} />
            <NewsAlertsMenu state={state} teamId={teamId} code={code} />
            <span className="hidden sm:contents">
              <Avatar name={team.name} tone="accent" />
            </span>
          </div>
          <div className="flex w-full items-center justify-between gap-2 md:hidden">
            <span className="min-w-0 truncate text-xs text-fg-secondary">
              {round ? `R${round.number} · ${round.name}` : "Awaiting first round"}
              {round && (round.status === "RUNNING" || round.status === "PAUSED") && <span className="ml-2 font-mono text-fg-primary tabular-nums">{formatDuration(remaining)}</span>}
            </span>
            <MarketStateBadge state={marketState} />
          </div>
        </div>
      )}
      banner={<TradingStateBanner marketState={marketState} />}
    >
      {children}
      <BreakingNewsAlert state={state} code={code} />
      <ProposalNotifier state={state} teamId={teamId} code={code} />
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

const bannerCopy: Partial<Record<MarketState, { title: string; body: string; icon: ReactNode; tone: "warning" | "accent" | "neutral" }>> = {
  FROZEN: { title: "Trading frozen by host.", body: "All proposals and acceptances are blocked until the host unfreezes trading.", icon: <Snowflake className="size-4" />, tone: "warning" },
  PAUSED: { title: "Market paused.", body: "The host has paused the round; the timer is held and trading is blocked.", icon: <PauseCircle className="size-4" />, tone: "warning" },
  BRIEFING: { title: "Market briefing.", body: "Study the stocks and news. Trading opens when the first trading round starts.", icon: <BookOpen className="size-4" />, tone: "accent" },
  BETWEEN_ROUNDS: { title: "Between rounds.", body: "Trading is closed until the host starts the next round.", icon: <Timer className="size-4" />, tone: "neutral" },
  NOT_STARTED: { title: "The event has not started yet.", body: "Your portfolio is ready; trading opens once the host starts a trading round.", icon: <Timer className="size-4" />, tone: "neutral" },
  COMPLETED: { title: "The event has ended.", body: "Final standings are on the leaderboard. Trading is closed.", icon: <BookOpen className="size-4" />, tone: "neutral" },
};

function TradingStateBanner({ marketState }: { marketState: MarketState }) {
  const copy = bannerCopy[marketState];
  if (!copy) return null;
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pt-3 sm:px-6">
      <InlineBanner tone={copy.tone} icon={copy.icon} title={copy.title}>
        {copy.body}
      </InlineBanner>
    </div>
  );
}
