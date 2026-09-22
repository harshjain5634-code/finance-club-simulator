import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default scales, so it would read the C4 type scale (text-caption,
 * text-h2, text-value-m…) as colours and drop it next to a text colour. Register the custom font sizes and
 * radius names so both survive.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "meta", "body-sm", "body", "h1", "h2", "h3", "value-s", "value-m", "value-l", "display", "overline"],
      radius: ["xs"],
    },
  },
});

/** Joins class names; later Tailwind utilities win over conflicting earlier ones (e.g. a caller's w-20 over a base w-full). */
export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(" "));
}
