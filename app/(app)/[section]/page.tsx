import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { allNavItems } from "@/lib/navigation";

// Temporary stand-in for sections that haven't been designed yet; real pages in app/(app)/<name>/ take precedence.
export const dynamicParams = false;

function itemFor(section: string) {
  return allNavItems.find((item) => item.href === `/${section}` && item.href !== "/dashboard");
}

export function generateStaticParams() {
  return allNavItems.filter((item) => item.href !== "/dashboard").map((item) => ({ section: item.href.slice(1) }));
}

export async function generateMetadata({ params }: PageProps<"/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: itemFor(section)?.label };
}

export default async function SectionPlaceholderPage({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = itemFor(section);
  if (!item) notFound();
  const Icon = item.icon;

  return (
    <Card className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-10 place-items-center rounded-lg border border-line bg-surface-raised text-fg-muted">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <h2 className="mt-4 text-[15px] font-semibold text-fg">{item.label} is on the way</h2>
        <p className="mt-1.5 text-[13px] text-fg-subtle">
          This section will be designed in an upcoming phase. The dashboard is fully interactive in the meantime.
        </p>
        <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
          <ArrowLeft className="size-3.5" />
          Back to dashboard
        </Link>
      </div>
    </Card>
  );
}
