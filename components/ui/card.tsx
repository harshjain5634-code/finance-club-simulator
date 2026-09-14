import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("min-w-0 rounded-lg border border-line bg-surface", className)} {...props} />;
}

type CardHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  divider?: boolean;
  className?: string;
};

export function CardHeader({ title, subtitle, action, divider = false, className }: CardHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 px-4 py-2.5",
        divider && "border-b border-line",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[13px] font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-fg-subtle">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
