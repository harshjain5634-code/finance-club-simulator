"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Delta } from "@/components/ui/delta";
import { formatNumber } from "@/lib/format";
import type { StockQuote } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 7;

export function StockSearch({ stocks, className }: { stocks: StockQuote[]; className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stocks.slice(0, MAX_RESULTS);
    return stocks
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.symbol.toLowerCase().startsWith(q)) - Number(a.symbol.toLowerCase().startsWith(q)))
      .slice(0, MAX_RESULTS);
  }, [query, stocks]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function select(stock: StockQuote) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/trade?symbol=${encodeURIComponent(stock.symbol)}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter" && open && results[activeIndex]) {
      event.preventDefault();
      select(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showList = open;

  return (
    <div className={cn("relative", className)}>
      <div className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 transition-colors duration-150 focus-within:border-accent/70 focus-within:bg-surface-raised hover:border-line-strong">
        <Search className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search stocks"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          placeholder="Search stocks, e.g. RELIANCE"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-subtle focus-visible:outline-none"
        />
        <kbd className="hidden h-5 items-center rounded border border-line-strong px-1.5 font-sans text-[10px] text-fg-subtle sm:inline-flex">
          /
        </kbd>
      </div>

      {showList && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 animate-fade-in overflow-hidden rounded-lg border border-line-strong bg-surface-raised shadow-xl shadow-black/40">
          <p className="border-b border-line px-3 py-2 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
            {query.trim() ? `Results for "${query.trim()}"` : "Popular on NSE"}
          </p>
          <ul id={listboxId} role="listbox" aria-label="Stocks" className="max-h-80 overflow-y-auto py-1">
            {results.length === 0 && <li className="px-3 py-6 text-center text-xs text-fg-subtle">No matching stocks</li>}
            {results.map((stock, index) => (
              <li
                key={stock.symbol}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(stock)}
                className={cn(
                  "mx-1 flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5",
                  index === activeIndex && "bg-surface-hover",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">{stock.symbol}</p>
                  <p className="truncate text-[11px] text-fg-subtle">{stock.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-fg tabular-nums">{formatNumber(stock.lastPrice)}</p>
                  <Delta value={stock.changePct} className="text-[11px]" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
