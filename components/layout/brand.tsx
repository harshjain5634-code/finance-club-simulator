import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function BrandMark() {
  return (
    <span className="grid size-7 place-items-center rounded-md bg-accent-strong text-white">
      <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M4 3v10M4 5.5h-1.5v5H4M4 5.5h1.5v5H4" strokeLinecap="round" />
        <path d="M11 2v12M11 4.5H9.5v6H11M11 4.5h1.5v6H11" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Brand() {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-md">
      <BrandMark />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-semibold text-fg">{siteConfig.name}</span>
        <span className="block truncate text-[11px] text-fg-subtle">{siteConfig.product}</span>
      </span>
    </Link>
  );
}
