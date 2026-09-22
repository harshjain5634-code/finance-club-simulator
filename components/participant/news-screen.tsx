"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Link2, Megaphone, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses, ButtonKbd } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { Avatar, Kbd, PageHeader, SearchInput } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { NewsCard, releaseMeta } from "@/components/market/news-card";
import { NEWS_PRIORITY_LABEL } from "@/components/market/status";
import { formatINR, formatPrice } from "@/lib/domain/money";
import { teamShares } from "@/lib/domain/portfolio";
import type { NewsPriority } from "@/lib/domain/types";
import { formatClock, formatQuantity } from "@/lib/format";
import { instrumentOf, releasesNewestFirst } from "@/lib/mock/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { markNewsRead, useNewsLastSeen, useTerminal } from "./terminal-context";

type Filter = "ALL" | "UNREAD" | "BREAKING" | "MINE";
const priorityTone: Record<NewsPriority, "warning" | "info" | "neutral"> = { HIGH: "warning", NORMAL: "info", LOW: "neutral" };

/**
 * C4 News (section 10): a filterable feed and a reading pane. The pane shows the story and what the market did
 * after it was released (observed prices only, never the configured effect), plus the team's exposure. J / K
 * move through stories, / searches. Phones get the feed as cards with the story text.
 */
export function NewsScreen() {
  const { state, teamId, code, eventId } = useTerminal();
  const searchParams = useSearchParams();
  const releases = releasesNewestFirst(state);
  const lastSeen = useNewsLastSeen(eventId, teamId);
  // Unread is judged against when the page opened, so stories stay marked until the next visit.
  const [openedAfter] = useState(lastSeen);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("story"));

  useEffect(() => {
    markNewsRead(eventId, teamId);
  }, [eventId, teamId, releases.length]);

  const held = useMemo(() => new Set(state.instruments.filter((i) => teamShares(state, teamId, i.id) > 0).map((i) => i.id)), [state, teamId]);
  const isUnread = (releasedAt: number) => releasedAt > openedAfter;
  const filtered = releases.filter((r) => {
    const meta = releaseMeta(state, r);
    if (filter === "UNREAD" && !isUnread(r.releasedAt)) return false;
    if (filter === "BREAKING" && meta.priority !== "HIGH") return false;
    if (filter === "MINE" && !r.impacts.some((i) => held.has(i.instrumentId))) return false;
    const q = query.trim().toLowerCase();
    if (q && !`${r.headline} ${meta.symbols.join(" ")} #${meta.number ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const selected = filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null;
  const index = selected ? filtered.findIndex((r) => r.id === selected.id) : -1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || (target && ["INPUT", "TEXTAREA"].includes(target.tagName))) return;
      if (event.key === "j" && index < filtered.length - 1) setSelectedId(filtered[index + 1].id);
      else if (event.key === "k" && index > 0) setSelectedId(filtered[index - 1].id);
      else if (event.key === "/") {
        event.preventDefault();
        document.getElementById("news-search")?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, index]);

  if (releases.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="News" description="Prices can move the moment a story is released." className="md:hidden" />
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-canvas-subtle text-fg-secondary">
            <Newspaper className="size-5" />
          </span>
          <p className="mt-3 text-h3 font-semibold text-fg-primary">No news released yet</p>
          <p className="mt-1 max-w-sm text-meta text-fg-secondary">Stories appear here and on the projector as the host releases them during rounds.</p>
        </Card>
      </div>
    );
  }

  const unread = releases.filter((r) => isUnread(r.releasedAt)).length;
  const breaking = releases.filter((r) => releaseMeta(state, r).priority === "HIGH").length;
  const mine = releases.filter((r) => r.impacts.some((i) => held.has(i.instrumentId))).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="News" description="Prices can move the moment a story is released." className="md:hidden" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <SegmentedControl
            size="md"
            label="Filter news"
            value={filter}
            onChange={setFilter}
            className="w-full [&>button]:flex-1"
            options={[
              { value: "ALL", label: `All ${releases.length}` },
              { value: "UNREAD", label: `Unread ${unread}` },
              { value: "BREAKING", label: `Breaking ${breaking}` },
              { value: "MINE", label: `My stocks ${mine}` },
            ]}
          />
          <div id="news-search">
            <SearchInput value={query} onChange={setQuery} placeholder="Search headlines and stocks" label="Search news" />
          </div>
          <p className="mt-1 flex items-center justify-between text-caption">
            <span className="eyebrow text-fg-muted">Newest first</span>
            <span className="text-fg-muted">{filtered.length} shown</span>
          </p>
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-meta text-fg-secondary">No stories match this filter.</p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Stories">
              {filtered.map((release) => (
                <li key={release.id}>
                  <NewsCard
                    state={state}
                    release={release}
                    code={code}
                    unread={isUnread(release.releasedAt)}
                    selected={selected?.id === release.id}
                    onSelect={() => setSelectedId(release.id)}
                    className="max-lg:[&_p+p]:line-clamp-none"
                    showBody={false}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 hidden items-center gap-3 text-caption text-fg-muted lg:flex">
            <Kbd>J</Kbd> next <Kbd>K</Kbd> previous <Kbd>/</Kbd> search
          </p>
        </div>

        {selected && (
          <Card className="flex min-w-0 flex-col gap-5 p-6 max-lg:order-first lg:sticky lg:top-24 lg:self-start lg:p-8" aria-label="Story">
            <StoryPane releaseId={selected.id} position={index} total={filtered.length} onOlder={() => index < filtered.length - 1 && setSelectedId(filtered[index + 1].id)} onNewer={() => index > 0 && setSelectedId(filtered[index - 1].id)} />
          </Card>
        )}
      </div>
    </div>
  );
}

function StoryPane({ releaseId, position, total, onOlder, onNewer }: { releaseId: string; position: number; total: number; onOlder: () => void; onNewer: () => void }) {
  const { state, teamId, code } = useTerminal();
  const release = state.newsReleases.find((r) => r.id === releaseId)!;
  const meta = releaseMeta(state, release);
  const paragraphs = release.body.split(/\n{2,}/).filter(Boolean);
  const exposures = release.impacts
    .map((impact) => {
      const instrument = instrumentOf(state, impact.instrumentId)!;
      const qty = teamShares(state, teamId, impact.instrumentId);
      const price = state.prices[impact.instrumentId]?.price ?? impact.newPrice;
      return { impact, instrument, qty, value: qty * price, sinceStory: qty * (price - impact.previousPrice) };
    })
    .filter((e) => e.instrument);
  const held = exposures.filter((e) => e.qty > 0);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/event/${code}/news?story=${release.id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone={priorityTone[meta.priority]}>{NEWS_PRIORITY_LABEL[meta.priority]}</Badge>
        {meta.number && <span className="text-[13px] font-medium text-fg-secondary">News #{meta.number}</span>}
        <span className="text-meta text-fg-muted">
          Released {formatClock(release.releasedAt, true)} · {meta.roundLabel}
        </span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={copyLink} aria-label="Copy link to this story">
          <Link2 />
        </Button>
      </div>
      <h2 className="text-value-l font-semibold tracking-[-0.015em] text-fg-primary">{release.headline}</h2>
      <div className="flex flex-col gap-3">
        {paragraphs.length ? (
          paragraphs.map((p, i) => (
            <p key={i} className="text-body text-fg-secondary">
              {p}
            </p>
          ))
        ) : (
          <p className="text-body text-fg-muted">No further details were released with this headline.</p>
        )}
      </div>

      {exposures.length > 0 && (
        <section className="rounded-md bg-canvas-subtle p-4" aria-labelledby="reaction-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="reaction-title" className="text-h3 font-semibold text-fg-primary">
              What the market did
            </h3>
            <span className="text-caption text-fg-muted">Observed after release · not a forecast</span>
          </div>
          <ul className="mt-3 flex flex-col gap-3">
            {exposures.map(({ impact, instrument }) => (
              <li key={impact.instrumentId} className="flex items-center gap-3">
                <Avatar name={instrument.name} text={instrument.symbol.slice(0, 2)} tone="accent" size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-fg-primary">{instrument.name}</span>
                  <span className="block text-caption text-fg-muted">
                    {instrument.symbol} · at {formatClock(release.releasedAt, true)}
                  </span>
                </span>
                <span className="font-mono text-[14px] text-fg-primary">
                  {formatPrice(impact.previousPrice)} → {formatPrice(impact.newPrice)}
                </span>
                <Delta value={((impact.newPrice - impact.previousPrice) / impact.previousPrice) * 100} variant="pill" showArrow />
              </li>
            ))}
          </ul>
        </section>
      )}

      {held.map((e) => (
        <section key={e.instrument.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-fg-primary">
              You hold {formatQuantity(e.qty)} {e.instrument.symbol} · {formatINR(e.value, 0)}
            </p>
            <p className="text-caption">
              <Delta value={e.sinceStory} format="inr" decimals={0} /> <span className="text-fg-muted">since this story</span>
            </p>
          </div>
          <Link href={`/event/${code}/markets/${e.instrument.symbol}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            View {e.instrument.symbol}
          </Link>
          <Link href={`/event/${code}/trade?symbol=${e.instrument.symbol}`} className={buttonClasses({ variant: "primary", size: "sm" })}>
            Trade {e.instrument.symbol} <ButtonKbd variant="primary">T</ButtonKbd>
          </Link>
        </section>
      ))}

      {exposures.length === 0 && (
        <p className="flex items-center gap-2 rounded-md bg-canvas-subtle px-4 py-3 text-meta text-fg-secondary">
          <Megaphone className="size-4 shrink-0 text-fg-muted" aria-hidden /> No stock prices changed with this story.
        </p>
      )}

      <div className={cn("mt-auto flex items-center gap-2 border-t border-border pt-4")}>
        <span className="text-caption text-fg-muted">{position === 0 ? "Newest story" : `${position + 1} of ${total}`}</span>
        <span className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onNewer} disabled={position <= 0}>
            Newer <ButtonKbd>K</ButtonKbd>
          </Button>
          <Button variant="ghost" size="sm" onClick={onOlder} disabled={position >= total - 1}>
            Older <ButtonKbd>J</ButtonKbd>
          </Button>
        </span>
      </div>
    </>
  );
}
