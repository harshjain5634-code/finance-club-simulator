import Link from "next/link";
import { ArrowRight, ClipboardList, Gauge, MonitorPlay, Newspaper, ShieldCheck, SquareTerminal, Users } from "lucide-react";
import { JoinCodeForm } from "@/components/entry/join-code-form";
import { BrandMark } from "@/components/shell/brand";
import { buttonClasses } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

const EXPERIENCES = [
  {
    icon: Gauge,
    title: "Host control room",
    body: "Start rounds, release news, move prices, freeze trading and audit every action from one console.",
    points: ["Round timers and emergency freeze", "News desk with price impacts", "Full audit log and CSV exports"],
  },
  {
    icon: SquareTerminal,
    title: "Team trading terminal",
    body: "Each team trades from a professional terminal with live prices, portfolio P&L and peer-to-peer settlement.",
    points: ["Propose and accept trades", "Instant, double-entry settlement", "Live rank and breaking news"],
  },
  {
    icon: MonitorPlay,
    title: "Projector display",
    body: "A broadcast-style screen for the room: countdown, leaderboard, market board and breaking-news takeovers.",
    points: ["Rotating scenes", "Breaking-news takeover", "Final results podium"],
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold text-fg-primary">{siteConfig.name}</span>
              <span className="block text-[11px] text-fg-muted">{siteConfig.product}</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/demo" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Demo
            </Link>
            <Link href="/host" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Host console
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-fg-secondary">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              Live stock-market simulation events
            </p>
            <h1 className="mt-5 max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-fg-primary sm:text-4xl">
              Run a live trading competition for your finance club.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-secondary">
              Teams trade in rounds with virtual capital, the host drives the market with news, and every trade settles through an
              auditable ledger, from a 20-team room to a large event.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link href="/join" className={buttonClasses({ variant: "primary", size: "lg" })}>
                Join an event
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/host" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                Host an event
              </Link>
              <Link href="/demo" className={buttonClasses({ variant: "ghost", size: "lg" })}>
                Try the demo
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-md border border-border bg-surface-raised text-accent">
                <Users className="size-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-fg-primary">Join with your event code</h2>
                <p className="text-xs text-fg-muted">Your host shares the code and your team PIN.</p>
              </div>
            </div>
            <JoinCodeForm className="mt-4" size="lg" />
            <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-center text-xs">
              {[
                ["Rounds", "Briefing + trading"],
                ["Settlement", "Double-entry"],
                ["Scoring", "Return %"],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface-raised px-2 py-3">
                  <p className="text-fg-muted">{label}</p>
                  <p className="mt-0.5 font-medium text-fg-primary">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 border-t border-border py-12 md:grid-cols-3">
          {EXPERIENCES.map(({ icon: Icon, title, body, points }) => (
            <article key={title} className="rounded-lg border border-border bg-surface p-5">
              <span className="grid size-9 place-items-center rounded-md border border-border bg-surface-raised text-fg-secondary">
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-fg-primary">{title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">{body}</p>
              <ul className="mt-4 space-y-1.5 text-[13px] text-fg-secondary">
                {points.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-accent" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="grid gap-6 border-t border-border py-12 md:grid-cols-3">
          {[
            { icon: Newspaper, title: "News moves the market", body: "Prepared headlines resolve fixed or ranged impacts once, and the exact result is stored permanently." },
            { icon: ShieldCheck, title: "Built against cheating", body: "Price bands, no short selling, no negative cash, and one settlement per proposal, no matter how many clicks." },
            { icon: ClipboardList, title: "Every action audited", body: "Trades, adjustments, releases and host actions are recorded with reasons and before/after values." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
              <div>
                <h3 className="text-[14px] font-semibold text-fg-primary">{title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-secondary">{body}</p>
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-fg-muted sm:px-6">
          <span>{siteConfig.name} · {siteConfig.product}</span>
          <span>Phase 1 prototype: simulated data, no real money or market data.</span>
        </div>
      </footer>
    </div>
  );
}
