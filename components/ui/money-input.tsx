"use client";

import { useState, type ComponentProps } from "react";
import { parseRupees } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { inputClasses } from "./field";

type MoneyInputProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  /** Value in paise; null when the field is empty or invalid. */
  value: number | null;
  onValueChange: (paise: number | null) => void;
};

const toText = (paise: number | null) => (paise === null ? "" : (paise / 100).toFixed(2).replace(/\.00$/, ""));

/** Rupee input that reports integer paise. Keeps the typed text while editing. */
export function MoneyInput({ value, onValueChange, className, ...props }: MoneyInputProps) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    if (parseRupees(text) !== value) setText(toText(value));
  }

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[13px] text-fg-muted">₹</span>
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^[\d,]*\.?\d{0,2}$/.test(next)) return;
          setText(next);
          const parsed = parseRupees(next);
          setLastValue(parsed);
          onValueChange(parsed);
        }}
        className={cn(inputClasses, "pl-6")}
      />
    </div>
  );
}
