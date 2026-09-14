import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { EntryFrame } from "@/components/entry/entry-frame";
import { JoinCodeForm } from "@/components/entry/join-code-form";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Join an event" };

export default function JoinPage() {
  return (
    <EntryFrame aside={<Link href="/demo" className={buttonClasses({ variant: "ghost", size: "sm" })}>Demo</Link>}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <span className="grid size-10 place-items-center rounded-lg border border-border bg-surface-raised text-accent">
          <KeyRound className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-fg-primary">Join an event</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-secondary">Enter the event code your host shared. You will pick your team and enter its PIN next.</p>
        <JoinCodeForm className="mt-5" autoFocus size="lg" />
        <p className="mt-4 text-xs text-fg-muted">
          Trying the prototype? The demo event code is <span className="font-mono text-fg-secondary">FINSIM26</span>.
        </p>
      </div>
    </EntryFrame>
  );
}
