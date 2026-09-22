"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog as RadixDialog } from "radix-ui";
import {
  ArrowLeftRight,
  ChartCandlestick,
  CirclePause,
  CirclePlay,
  Flag,
  MonitorPlay,
  Newspaper,
  Radio,
  Search,
  SkipForward,
  Snowflake,
  Square,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Kbd } from "@/components/ui/misc";
import { formatINR, formatPrice } from "@/lib/domain/money";
import { computeLeaderboard, sharedRanks } from "@/lib/domain/leaderboard";
import { SCENE_LABEL } from "@/lib/domain/projector";
import type { ProjectorScene } from "@/lib/domain/types";
import { hostRailNav } from "@/lib/navigation";
import { pinProjectorScene } from "@/lib/mock/commands";
import { instrumentRows } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { hostAction, hostBase } from "./host-context";
import { useHostCommands, type HostCommandId } from "./host-commands";

/**
 * Remembers what was focused before a shortcut-opened dialog appeared and puts focus back afterwards, so a
 * keyboard-only host never loses their place (C4 section 21: dialogs trap focus and return it).
 */
function useReturnFocus(open: boolean) {
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) previous.current = document.activeElement as HTMLElement | null;
  }, [open]);
  return (event: Event) => {
    const target = previous.current;
    if (!target || !target.isConnected || target === document.body) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  };
}

type Item = { key: string; group: string; icon: LucideIcon; label: string; hint?: string; keys?: string[]; tone?: "warning"; run: () => void };

const COMMAND_ICON: Record<HostCommandId, LucideIcon> = {
  releaseNext: Zap,
  freeze: Snowflake,
  unfreeze: Snowflake,
  pauseRound: CirclePause,
  resumeRound: CirclePlay,
  startRound: CirclePlay,
  endRound: Square,
  nextRound: SkipForward,
  startEvent: CirclePlay,
  pauseEvent: CirclePause,
  resumeEvent: CirclePlay,
  endEvent: Flag,
  projectorBreaking: Radio,
  projectorClear: X,
};

/** Go-to shortcuts shared by the palette, the keyboard handler and the shortcut bar. */
export const GOTO_KEYS: Record<string, { key: string; path: string; label: string }> = {
  c: { key: "C", path: "", label: "Control room" },
  n: { key: "N", path: "/news", label: "News desk" },
  t: { key: "T", path: "/trades", label: "Trades & approvals" },
  p: { key: "P", path: "/display", label: "Projector" },
  l: { key: "L", path: "/leaderboard", label: "Leaderboard" },
  m: { key: "M", path: "/teams", label: "Teams" },
  s: { key: "S", path: "/setup/general", label: "Event setup" },
};

/**
 * ⌘K command palette (C4 section 13). Actions that are unavailable right now are hidden rather than disabled, so
 * the list only ever offers something that will work. Risky actions open the same confirmation as the buttons.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { state, commands, available, run } = useHostCommands();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const returnFocus = useReturnFocus(open);
  const listRef = useRef<HTMLDivElement>(null);
  const eventId = state.event.id;
  const base = hostBase(eventId);

  const items = useMemo<Item[]>(() => {
    const close = (fn: () => void) => () => {
      onOpenChange(false);
      fn();
    };
    const out: Item[] = [];
    for (const c of commands) {
      if (!available(c.id)) continue;
      out.push({ key: c.id, group: c.group, icon: COMMAND_ICON[c.id], label: c.label, hint: c.hint, keys: c.shortcut ? [c.shortcut] : undefined, tone: c.tone, run: close(() => run(c.id)) });
    }
    const pinned = state.event.projector.pinnedScene;
    for (const s of state.event.projector.scenes) {
      if (!s.enabled || s.scene === pinned) continue;
      out.push({
        key: `take-${s.scene}`,
        group: "Projector",
        icon: MonitorPlay,
        label: `Take: ${SCENE_LABEL[s.scene]}`,
        hint: "cut the program to this scene and hold it",
        run: close(() => void hostAction(pinProjectorScene(eventId, s.scene as ProjectorScene), `On air: ${SCENE_LABEL[s.scene]}`)),
      });
    }
    if (pinned) {
      out.push({ key: "rotate", group: "Projector", icon: MonitorPlay, label: "Resume scene rotation", hint: `release the hold on ${SCENE_LABEL[pinned]}`, run: close(() => void hostAction(pinProjectorScene(eventId, null), "Rotation resumed")) });
    }
    const approvals = state.proposals.filter((p) => p.status === "PENDING_APPROVAL").length;
    for (const [k, g] of Object.entries(GOTO_KEYS)) {
      out.push({ key: `go-${k}`, group: "Go to", icon: k === "n" ? Newspaper : k === "t" ? ArrowLeftRight : k === "m" ? Users : MonitorPlay, label: g.label, hint: k === "t" && approvals ? `${approvals} waiting` : undefined, keys: ["G", g.key], run: close(() => router.push(`${base}${g.path}`)) });
    }
    for (const group of hostRailNav(eventId)) {
      for (const item of group.items) {
        if (out.some((o) => o.group === "Go to" && o.label === item.label)) continue;
        if (Object.values(GOTO_KEYS).some((g) => `${base}${g.path}` === item.href)) continue;
        out.push({ key: `nav-${item.href}`, group: "Go to", icon: item.icon, label: item.label, run: close(() => router.push(item.href)) });
      }
    }
    const board = computeLeaderboard(state);
    const ranks = sharedRanks(board);
    for (const row of board) {
      const open = state.proposals.filter((p) => p.status === "PROPOSED" && (p.proposerTeamId === row.teamId || p.counterpartyTeamId === row.teamId)).length;
      out.push({
        key: `team-${row.teamId}`,
        group: "Teams & stocks",
        icon: Users,
        label: row.teamName,
        hint: `${ranks[row.teamId]?.label ?? `#${row.rank}`} · ${formatINR(row.netWorth, 0)}${open ? ` · ${open} open proposal${open === 1 ? "" : "s"}` : ""}`,
        run: close(() => router.push(`${base}/teams/${row.teamId}`)),
      });
    }
    for (const row of instrumentRows(state)) {
      out.push({
        key: `inst-${row.instrument.id}`,
        group: "Teams & stocks",
        icon: ChartCandlestick,
        label: `${row.instrument.symbol} · ${row.instrument.name}`,
        hint: `${formatPrice(row.price)}${row.instrument.halted ? " · halted" : ""}`,
        run: close(() => router.push(`${base}/prices`)),
      });
    }
    return out;
  }, [state, commands, available, run, router, base, eventId, onOpenChange]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.filter((i) => i.group !== "Teams & stocks");
    return items.filter((i) => `${i.label} ${i.hint ?? ""} ${i.group}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const groups: { name: string; items: (Item & { index: number })[] }[] = [];
  filtered.forEach((item, index) => {
    const g = groups.find((x) => x.name === item.group) ?? groups[groups.push({ name: item.group, items: [] }) - 1];
    g.items.push({ ...item, index });
  });

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <RadixDialog.Content
          aria-label="Command palette"
          onCloseAutoFocus={returnFocus}
          className="fixed top-24 left-1/2 z-50 flex max-h-[min(640px,calc(100dvh-8rem))] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-dialog animate-pop-in focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              filtered[active]?.run();
            }
          }}
        >
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Search actions, pages, teams and stocks. Use the arrow keys and Enter.</RadixDialog.Description>
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
            <Search className="size-4 text-fg-muted" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Type a command, page, team or stock"
              className="h-full flex-1 bg-transparent text-body text-fg-primary outline-none placeholder:text-fg-muted"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={filtered[active] ? `palette-${filtered[active].key}` : undefined}
            />
            <Kbd>esc</Kbd>
          </div>
          <div ref={listRef} id="palette-list" role="listbox" className="flex-1 overflow-y-auto p-2">
            {groups.length === 0 && <p className="px-3 py-8 text-center text-meta text-fg-secondary">Nothing matches “{query}”.</p>}
            {groups.map((g) => (
              <div key={g.name} role="group" aria-label={g.name} className="mb-1">
                <p className="eyebrow px-2.5 pt-2 pb-1.5">{g.name}</p>
                {g.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.key}
                      id={`palette-${item.key}`}
                      role="option"
                      aria-selected={item.index === active}
                      data-index={item.index}
                      onMouseMove={() => setActive(item.index)}
                      onClick={item.run}
                      className={cn("flex h-9 cursor-pointer items-center gap-3 rounded-md px-2.5", item.index === active && "bg-surface-selected")}
                    >
                      <Icon className={cn("size-4 shrink-0", item.tone === "warning" ? "text-warning" : "text-fg-secondary")} aria-hidden />
                      <span className={cn("shrink-0 text-[14px] font-medium", item.tone === "warning" ? "text-warning" : "text-fg-primary")}>{item.label}</span>
                      {item.hint && <span className="min-w-0 flex-1 truncate text-caption text-fg-muted">{item.hint}</span>}
                      {item.keys && (
                        <span className="ml-auto flex shrink-0 gap-1">
                          {item.keys.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border bg-canvas-subtle px-4 text-caption text-fg-muted">
            <span className="flex items-center gap-1.5">
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> run
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>esc</Kbd> close
            </span>
            <span className="ml-auto">Risky commands always ask to confirm</span>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function Row({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <li className="flex h-9 items-center justify-between gap-3 border-b border-border-subtle last:border-0">
      <span className="text-[14px] text-fg-primary">{children}</span>
      <span className="flex gap-1">
        {keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </span>
    </li>
  );
}

/** "?" sheet listing every host shortcut. */
export function ShortcutsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const returnFocus = useReturnFocus(open);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <RadixDialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-surface-raised p-6 shadow-dialog animate-pop-in focus:outline-none">
          <div className="flex items-start justify-between">
            <div>
              <RadixDialog.Title className="text-h2 font-semibold text-fg-primary">Keyboard shortcuts</RadixDialog.Title>
              <RadixDialog.Description className="mt-1 text-meta text-fg-secondary">Shortcuts never fire while you are typing. Risky ones open a confirmation first.</RadixDialog.Description>
            </div>
            <RadixDialog.Close className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg-primary" aria-label="Close">
              <X className="size-4" />
            </RadixDialog.Close>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <p className="eyebrow pb-1">Live</p>
              <ul>
                <Row keys={["N"]}>Release next story</Row>
                <Row keys={["F"]}>Freeze / unfreeze trading</Row>
                <Row keys={["P"]}>Pause / resume round</Row>
                <Row keys={["E"]}>End round</Row>
                <Row keys={["⌘", "K"]}>Command palette</Row>
                <Row keys={["?"]}>This sheet</Row>
              </ul>
            </div>
            <div>
              <p className="eyebrow pb-1">Go to</p>
              <ul>
                {Object.values(GOTO_KEYS).map((g) => (
                  <Row key={g.key} keys={["G", g.key]}>
                    {g.label}
                  </Row>
                ))}
              </ul>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
