"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar, SIDEBAR_WIDTH_CLASS } from "./sidebar";
import { TopBar } from "./top-bar";
import type { ShellData } from "@/lib/types";

export function AppShell({ shell, children }: { shell: ShellData; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  return (
    <div className="min-h-dvh">
      <Sidebar user={shell.user} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className={SIDEBAR_WIDTH_CLASS}>
        <TopBar shell={shell} navOpen={navOpen} onOpenNav={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-5">{children}</main>
      </div>
    </div>
  );
}
