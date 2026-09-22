"use client";

import { useRef, useState, type ReactNode } from "react";
import { ShieldAlert, Siren, TriangleAlert } from "lucide-react";
import type { OpResult } from "@/lib/domain/types";
import { Button } from "./button";
import { Dialog, DialogContent } from "./dialog";
import { Field, Input, Textarea } from "./field";
import { cn } from "@/lib/utils";

/**
 * Consistent confirmation UX for host actions.
 * confirm   – states the exact effect, action-named button
 * emergency – confirm button focused so Enter works immediately
 * reason    – requires a written reason
 * typed     – requires typing a confirmation phrase and a reason
 */
export type ConfirmTier = "confirm" | "emergency" | "reason" | "typed";

type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tier: ConfirmTier;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "accent" | "warning";
  typedPhrase?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  minReasonLength?: number;
  /** Extra form content (previews, inputs) rendered above the reason. */
  children?: ReactNode;
  /** Set false while caller-owned inputs are invalid. */
  canConfirm?: boolean;
  size?: "sm" | "md" | "lg";
  onConfirm: (input: { reason: string; idempotencyKey: string }) => Promise<OpResult<unknown>>;
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function ConfirmActionDialog(props: ConfirmActionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ConfirmBody {...props} />}
    </Dialog>
  );
}

function ConfirmBody({
  onOpenChange,
  tier,
  title,
  description,
  confirmLabel,
  tone = tier === "confirm" ? "accent" : "warning",
  typedPhrase,
  reasonLabel = "Reason (recorded in the audit log)",
  reasonPlaceholder = "Explain why this action is needed",
  minReasonLength = 5,
  children,
  canConfirm = true,
  size = "md",
  onConfirm,
}: ConfirmActionDialogProps) {
  const [idempotencyKey] = useState(newKey);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsReason = tier === "reason" || tier === "typed";
  const reasonOk = !needsReason || reason.trim().length >= minReasonLength;
  const typedOk = tier !== "typed" || (typedPhrase !== undefined && typed.trim() === typedPhrase);
  const ready = canConfirm && reasonOk && typedOk && !pending;

  const submit = async () => {
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      const result = await onConfirm({ reason: reason.trim(), idempotencyKey });
      if (result.ok) onOpenChange(false);
      else setError(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  };

  const Icon = tier === "emergency" ? Siren : tier === "typed" ? ShieldAlert : TriangleAlert;

  return (
    <DialogContent
      title={title}
      description={description}
      size={size}
      tone={tone === "warning" ? "warning" : "default"}
      icon={<Icon className="size-4" />}
      onOpenAutoFocus={(event) => {
        if (tier === "emergency") {
          event.preventDefault();
          confirmRef.current?.focus();
        } else if (tier === "confirm") {
          event.preventDefault();
          cancelRef.current?.focus();
        }
      }}
      footer={
        <>
          <Button ref={cancelRef} variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === "warning" ? "warning" : "primary"}
            onClick={submit}
            disabled={!ready}
            data-idempotency-key={idempotencyKey}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        {children}
        {needsReason && (
          <Field label={reasonLabel} htmlFor="confirm-reason" required hint={`At least ${minReasonLength} characters.`}>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              rows={2}
              autoFocus={tier === "reason"}
            />
          </Field>
        )}
        {tier === "typed" && typedPhrase && (
          <Field label={<>Type <span className="font-mono text-fg-primary">{typedPhrase}</span> to confirm</>} htmlFor="confirm-typed" required>
            <Input
              id="confirm-typed"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={cn("font-mono", typed && !typedOk && "border-warning")}
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-fg-primary">
            {error}
          </p>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </DialogContent>
  );
}
