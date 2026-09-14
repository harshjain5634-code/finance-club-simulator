import type { Metadata } from "next";
import Link from "next/link";
import { DemoLauncher } from "@/components/entry/demo-launcher";
import { EntryFrame } from "@/components/entry/entry-frame";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Demo launcher" };

export default function DemoPage() {
  return (
    <EntryFrame aside={<Link href="/host" className={buttonClasses({ variant: "ghost", size: "sm" })}>Host console</Link>}>
      <DemoLauncher />
    </EntryFrame>
  );
}
