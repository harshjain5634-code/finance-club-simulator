"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { MarketStatus } from "./market-status";
import { NotificationsMenu } from "./notifications-menu";
import { StockSearch } from "./stock-search";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { findNavItem } from "@/lib/navigation";
import type { ShellData } from "@/lib/types";

type TopBarProps = {
  shell: ShellData;
  navOpen: boolean;
  onOpenNav: () => void;
};

export function TopBar({ shell, navOpen, onOpenNav }: TopBarProps) {
  const pathname = usePathname();
  const title = findNavItem(pathname)?.label ?? "Dashboard";

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur-md">
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenNav}
          aria-label="Open navigation"
          aria-controls="app-sidebar"
          aria-expanded={navOpen}
          className="-ml-1.5 lg:hidden"
        >
          <Menu className="size-4" />
        </Button>

        <h1 className="mr-auto truncate text-[15px] font-semibold tracking-tight text-fg sm:mr-0 sm:w-32 lg:w-40">
          {title}
        </h1>

        <StockSearch
          stocks={shell.searchableStocks}
          className="order-last w-full sm:order-none sm:w-auto sm:max-w-sm sm:flex-1"
        />

        <div className="flex items-center gap-2 sm:ml-auto">
          <MarketStatus status={shell.marketStatus} className="hidden md:flex" />

          <div className="hidden h-8 flex-col justify-center border-l border-line pl-3 leading-tight xl:flex">
            <span className="text-[10px] font-medium tracking-wide text-fg-subtle uppercase">Virtual cash</span>
            <span className="text-[13px] font-medium text-fg tabular-nums">{formatCurrency(shell.availableCash)}</span>
          </div>

          <div className="mx-1 hidden h-5 w-px bg-line xl:block" aria-hidden />

          <NotificationsMenu notifications={shell.notifications} />

          <button
            type="button"
            aria-label={`Account: ${shell.user.name}`}
            className="grid size-8 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent ring-1 ring-line transition-shadow duration-150 hover:ring-line-strong"
          >
            {shell.user.initials}
          </button>
        </div>
      </div>
    </header>
  );
}
