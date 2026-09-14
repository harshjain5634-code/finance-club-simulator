import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "warning" | "warning-outline";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent-strong text-accent-fg hover:bg-accent-strong-hover",
  secondary: "border border-border-strong bg-surface-raised text-fg-primary hover:bg-surface-hover hover:border-fg-muted/40",
  ghost: "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary",
  warning: "bg-warning-strong text-warning-fg hover:bg-warning",
  "warning-outline": "border border-warning/50 bg-warning/8 text-warning hover:bg-warning/15 hover:border-warning/70",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 px-2 text-[11px]",
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-8 gap-2 px-3 text-[13px]",
  lg: "h-10 gap-2 px-4 text-sm",
  icon: "size-8",
  "icon-sm": "size-7",
};

export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
