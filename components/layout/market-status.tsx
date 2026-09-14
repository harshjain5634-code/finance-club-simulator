import type { MarketStatus as MarketStatusData } from "@/lib/types";
import { cn } from "@/lib/utils";

const stateLabel: Record<MarketStatusData["state"], string> = {
  OPEN: "Market open",
  PRE_OPEN: "Pre-open",
  CLOSED: "Market closed",
};

export function MarketStatus({ status, className }: { status: MarketStatusData; className?: string }) {
  const live = status.state === "OPEN";
  return (
    <div
      className={cn("flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs", className)}
      title="Simulated market session"
    >
      <span className="relative flex size-2">
        {live && <span className="absolute inset-0 animate-pulse-dot rounded-full bg-accent/60" />}
        <span className={cn("relative size-2 rounded-full", live ? "bg-accent" : "bg-fg-subtle")} />
      </span>
      <span className="font-medium text-fg">{stateLabel[status.state]}</span>
      <span className="text-fg-subtle">
        {status.exchange} · {status.detail}
      </span>
    </div>
  );
}
