import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EntryFrame } from "@/components/entry/entry-frame";
import { TeamLogin } from "@/components/entry/team-login";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Team sign in" };

export default function TeamLoginPage() {
  return (
    <EntryFrame aside={<Link href="/join" className={buttonClasses({ variant: "ghost", size: "sm" })}>Different code</Link>}>
      <Suspense>
        <TeamLogin />
      </Suspense>
    </EntryFrame>
  );
}
