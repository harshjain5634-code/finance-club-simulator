"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Delta } from "@/components/ui/delta";
import { formatPrice } from "@/lib/domain/money";
import type { InstrumentRow } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";

export function InstrumentSearch({ rows, hrefFor, className }: { rows: InstrumentRow[]; hrefFor: (symbol: string) => string; className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows.slice(0, 8);
    return rows
      .filter((r) => r.instrument.symbol.toLowerCase().includes(q) || r.instrument.name.toLowerCase().includes(q) || r.instrument.sector.toLowerCase().includes(q))
      .sort((a, b) => Number(b.instrument.symbol.toLowerCase().startsWith(q)) - Number(a.instrument.symbol.toLowerCase().startsWith(q)))
      .slice(0, 8);
  }, [query, rows]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const select = (row: InstrumentRow) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(hrefFor(row.instrument.symbol));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter" && open && results[active]) {
      event.preventDefault();
      select(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 transition-colors focus-within:border-accent/70 focus-within:bg-surface-raised hover:border-border-strong">
        <Search className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search event stocks"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listboxId}-${active}` : undefined}
          placeholder="Search stocks"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg-primary placeholder:text-fg-muted focus-visible:outline-none"
        />
        <kbd className="hidden h-5 items-center rounded border border-border-strong px-1.5 font-sans text-[10px] text-fg-muted sm:inline-flex">/</kbd>
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-1.5 min-w-72 animate-fade-in overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-xl shadow-black/40">
          <p className="border-b border-border px-3 py-2 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
            {query.trim() ? `Results for "${query.trim()}"` : "Event stocks"}
          </p>
          <ul id={listboxId} role="listbox" aria-label="Stocks" className="max-h-80 overflow-y-auto py-1">
            {results.length === 0 && <li className="px-3 py-6 text-center text-xs text-fg-muted">No matching stocks in this event</li>}
            {results.map((row, index) => (
              <li
                key={row.instrument.id}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => select(row)}
                className={cn("mx-1 flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5", index === active && "bg-surface-hover")}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-primary">
                    {row.instrument.symbol}
                    {row.instrument.halted && <Badge tone="warning">Halted</Badge>}
                  </p>
                  <p className="truncate text-[11px] text-fg-muted">{row.instrument.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-fg-primary tabular-nums">{formatPrice(row.price)}</p>
                  <Delta value={row.roundChangePct} className="text-[11px]" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
