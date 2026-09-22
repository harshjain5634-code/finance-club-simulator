import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * C4 Button (Figma 04 · Button). Heights follow the density scope: md = --control-h (40 comfortable / 32 compact),
 * sm = --control-h-sm. "warning" is the solid amber button, "warning-outline" the soft one.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "warning" | "warning-outline" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-fg-primary hover:bg-surface-hover",
  ghost: "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary",
  soft: "bg-accent-soft text-accent-text hover:bg-surface-selected",
  warning: "bg-warning text-warning-fg hover:brightness-105",
  "warning-outline": "border border-warning bg-warning-soft text-warning hover:brightness-[0.98]",
  danger: "border border-negative bg-surface text-negative hover:bg-negative-soft",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 rounded-sm px-2 text-caption font-medium",
  sm: "h-(--control-h-sm) gap-1.5 px-3 text-[13px] leading-[18px] font-semibold",
  md: "h-(--control-h) gap-2 px-(--control-px) text-[14px] leading-5 font-semibold",
  lg: "h-11 gap-2 px-5 text-[15px] leading-5 font-semibold",
  icon: "size-(--control-h)",
  "icon-sm": "size-(--control-h-sm)",
};

export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-md whitespace-nowrap transition-[background-color,border-color,color,filter] duration-150 ease-(--ease-standard) select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

/** Keyboard hint inside a button, e.g. <Button shortcut="N">Release</Button>. Tinted to the button's colour. */
export function ButtonKbd({ children, variant = "secondary" }: { children: ReactNode; variant?: ButtonVariant }) {
  const onFill = variant === "primary" || variant === "warning";
  return (
    <kbd
      aria-hidden
      className={cn(
        "ml-0.5 inline-grid h-5 min-w-5 place-items-center rounded-xs px-1 font-mono text-[11px] leading-none font-normal",
        onFill ? "bg-accent-fg-soft text-current" : "border border-border-strong bg-surface text-fg-muted",
      )}
    >
      {children}
    </kbd>
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; shortcut?: string };

export function Button({ variant, size, className, type = "button", shortcut, children, ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, className })} aria-keyshortcuts={shortcut} {...props}>
      {children}
      {shortcut && <ButtonKbd variant={variant}>{shortcut}</ButtonKbd>}
    </button>
  );
}
