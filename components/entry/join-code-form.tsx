"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function JoinCodeForm({ className, autoFocus = false, size = "md" }: { className?: string; autoFocus?: boolean; size?: "md" | "lg" }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = /^[A-Z0-9]{4,10}$/.test(code);
  return (
    <form
      className={cn("flex gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) router.push(`/join/${code}`);
      }}
    >
      <label htmlFor="event-code" className="sr-only">
        Event code
      </label>
      <Input
        id="event-code"
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
        placeholder="Event code, e.g. FINSIM26"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        className={cn("font-mono tracking-wider uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case", size === "lg" && "h-10 text-sm")}
      />
      <Button type="submit" variant="primary" size={size === "lg" ? "lg" : "md"} disabled={!valid}>
        Continue
        <ArrowRight className="size-3.5" />
      </Button>
    </form>
  );
}
