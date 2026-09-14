import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("min-w-0 rounded-lg border border-border bg-surface", className)} {...props} />;
}

type CardHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  divider?: boolean;
  className?: string;
};

export function CardHeader({ title, subtitle, action, icon, divider = false, className }: CardHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5",
        divider && "border-b border-border",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface-raised text-fg-secondary">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold text-fg-primary">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-fg-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 py-3.5", className)} {...props} />;
}
