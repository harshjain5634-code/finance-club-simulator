"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Info } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { setupIssues, stepStatus, type SetupStepId } from "@/lib/domain/setup-checks";
import type { EventState } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { hostBase, useHostEvent } from "./host-context";

export type SetupStep = { id: SetupStepId | "review"; label: string; path: string; summary: (s: EventState) => string };

/** Setup steps map onto the existing pages; News, Teams and Projector open their live screens. */
export const SETUP_STEPS: SetupStep[] = [
  { id: "general", label: "Basics & rules", path: "/setup/general", summary: (s) => `${s.event.code} · ±${s.event.rules.priceBandPct}% band · ${Math.round(s.event.rules.proposalExpirySeconds / 60)} min expiry` },
  { id: "stocks", label: "Stocks", path: "/setup/instruments", summary: (s) => `${s.instruments.filter((i) => i.enabled).length} of ${s.instruments.length} enabled` },
  { id: "allocations", label: "Starting portfolios", path: "/setup/allocations", summary: (s) => (s.event.allocationsApplied ? "Applied to the ledger" : "Not applied yet") },
  { id: "rounds", label: "Rounds", path: "/setup/rounds", summary: (s) => `${s.rounds.filter((r) => r.type === "BRIEFING").length ? "Briefing + " : ""}${s.rounds.filter((r) => r.type === "TRADING").length} rounds` },
  { id: "news", label: "News", path: "/news", summary: (s) => `${s.news.length} stories · ${s.news.filter((n) => n.status === "READY").length} ready` },
  { id: "teams", label: "Teams", path: "/teams", summary: (s) => `${s.teams.length} teams` },
  { id: "projector", label: "Projector", path: "/display", summary: (s) => `${s.event.projector.scenes.filter((x) => x.enabled).length} scenes` },
  { id: "review", label: "Review & start", path: "/setup/review", summary: () => "Checks and go live" },
];

/**
 * C4 Event Setup frame (section 17, frames 109:7410 / 110:7530): a numbered step rail with live status per step,
 * the step content, and Back / Next. Steps can be visited in any order; nothing goes live until Start event.
 */
export function SetupFrame({ children }: { children: ReactNode }) {
  const { state, eventId } = useHostEvent();
  const pathname = usePathname();
  const base = hostBase(eventId);
  const issues = setupIssues(state);
  const index = Math.max(0, SETUP_STEPS.findIndex((s) => pathname.startsWith(`${base}${s.path}`)));
  const ok = SETUP_STEPS.filter((s) => s.id !== "review" && stepStatus(issues, s.id as SetupStepId) !== "MUST_FIX").length;
  const mustFix = issues.filter((i) => i.level === "MUST_FIX").length;
  const prev = SETUP_STEPS[index - 1];
  const next = SETUP_STEPS[index + 1];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Event setup steps" className="lg:sticky lg:top-[128px] lg:self-start">
        <p className="text-caption text-fg-secondary">
          {ok} of {SETUP_STEPS.length - 1} ready{mustFix ? ` · ${mustFix} to fix` : ""}
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-canvas-subtle">
          <div className="h-full rounded-full bg-accent" style={{ width: `${(ok / (SETUP_STEPS.length - 1)) * 100}%` }} />
        </div>
        <ol className="mt-4 flex flex-col gap-1">
          {SETUP_STEPS.map((step, i) => {
            const status = step.id === "review" ? (mustFix ? "MUST_FIX" : "OK") : stepStatus(issues, step.id);
            const active = i === index;
            return (
              <li key={step.id}>
                <Link
                  href={`${base}${step.path}`}
                  aria-current={active ? "step" : undefined}
                  className={cn("flex items-start gap-3 rounded-md px-3 py-2.5", active ? "bg-accent-soft" : "hover:bg-surface-hover")}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold",
                      active ? "bg-accent text-accent-fg" : status === "MUST_FIX" ? "bg-warning-soft text-warning" : status === "OK" ? "bg-positive-soft text-positive" : "bg-canvas-subtle text-fg-secondary",
                    )}
                    aria-hidden
                  >
                    {active ? i + 1 : status === "MUST_FIX" ? <AlertTriangle className="size-3.5" /> : status === "OK" ? <Check className="size-3.5" /> : <Info className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-[14px] font-medium", active ? "text-accent-text" : "text-fg-primary")}>{step.label}</span>
                    <span className={cn("block truncate text-caption", status === "MUST_FIX" ? "text-warning" : "text-fg-muted")}>
                      {status === "MUST_FIX" ? `${issues.filter((x) => x.step === step.id && x.level === "MUST_FIX").length || mustFix} to fix · ` : ""}
                      {step.summary(state)}
                    </span>
                    <span className="sr-only">{status === "MUST_FIX" ? "needs attention" : status === "OK" ? "ready" : "has notes"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="flex min-w-0 flex-col gap-4">
        <p className="eyebrow text-fg-muted">
          Step {index + 1} of {SETUP_STEPS.length}
        </p>
        {children}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          {prev ? (
            <Link href={`${base}${prev.path}`} className={buttonClasses({ variant: "ghost" })}>
              <ArrowLeft className="size-4" /> Back: {prev.label}
            </Link>
          ) : (
            <span />
          )}
          <span className="hidden text-caption text-fg-muted md:block">You can come back to any step. Nothing goes live until you start the event.</span>
          {next && (
            <Link href={`${base}${next.path}`} className={buttonClasses({ variant: "primary" })}>
              Next: {next.label} <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
