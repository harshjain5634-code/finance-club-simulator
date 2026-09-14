import { twMerge } from "tailwind-merge";

/** Joins class names; later Tailwind utilities win over conflicting earlier ones (e.g. a caller's w-20 over a base w-full). */
export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(" "));
}
