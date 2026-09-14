import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/shell/brand";
import { siteConfig } from "@/lib/site";

export function EntryFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold text-fg-primary">{siteConfig.name}</span>
              <span className="block text-[11px] text-fg-muted">{siteConfig.product}</span>
            </span>
          </Link>
          {aside}
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">{children}</main>
    </div>
  );
}
