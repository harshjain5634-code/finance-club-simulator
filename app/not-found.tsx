import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { EntryFrame } from "@/components/entry/entry-frame";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Participants reach this by mistyping an event code or opening a stale link during an event,
 * so it points at the two routes that actually get them unstuck.
 */
export default function NotFound() {
  return (
    <EntryFrame>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <span className="grid size-10 place-items-center rounded-lg border border-border bg-surface-raised text-fg-secondary">
          <Compass className="size-5" />
        </span>
        <p className="mt-4 font-mono text-[11px] tracking-[0.16em] text-fg-muted uppercase">Error 404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg-primary">This page doesn&apos;t exist</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
          The link may be mistyped or out of date. If you were trading, your team session is still active — rejoin with your event code.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/join" className={buttonClasses({ variant: "primary" })}>
            Join an event
          </Link>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Back to home
          </Link>
        </div>
      </div>
    </EntryFrame>
  );
}
