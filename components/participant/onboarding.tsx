"use client";

import { useRef, useState } from "react";
import { ArrowLeftRight, Newspaper, TrendingUp, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Newspaper, title: "Watch the news", body: "Prices react to event developments the moment the host releases a story." },
  { icon: ArrowLeftRight, title: "Trade with other teams", body: "Agree a deal, send a proposal, and it settles once both sides confirm." },
  { icon: TrendingUp, title: "Grow your portfolio", body: "Your rank is based on percentage return, not on absolute portfolio size." },
];

const storageKey = (eventId: string, teamId: string) => `finsim:onboarded:${eventId}:${teamId}`;

/** Compact first-entry introduction. Shown once per team per event in this browser. */
export function OnboardingDialog({ eventId, teamId, eventName, teamName }: { eventId: string; teamId: string; eventName: string; teamName: string }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey(eventId, teamId)) !== "done";
    } catch {
      return false;
    }
  });

  const startButton = useRef<HTMLButtonElement>(null);

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(eventId, teamId), "done");
    } catch {
      // If storage is unavailable the dialog simply shows again next time.
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && dismiss()}>
      {open && (
        <DialogContent
          title={`Welcome, ${teamName}`}
          description={`${eventName} in three steps.`}
          size="md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            startButton.current?.focus();
          }}
          footer={
            <>
              <Button variant="ghost" onClick={dismiss}>
                Skip
              </Button>
              <Button ref={startButton} variant="primary" size="lg" onClick={dismiss}>
                Start trading
              </Button>
            </>
          }
        >
          <ol className="flex flex-col gap-2.5">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="flex items-start gap-3.5 rounded-lg border border-border bg-surface-raised/60 px-4 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/12 text-accent-text">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-fg-primary">
                    <span className="mr-1.5 text-fg-muted tabular-nums">{index + 1}.</span>
                    {title}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-fg-secondary">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </DialogContent>
      )}
    </Dialog>
  );
}
