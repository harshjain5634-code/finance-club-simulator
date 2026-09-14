"use client";

import { useState } from "react";
import { Siren, Snowflake } from "lucide-react";
import { Button, type ButtonSize } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Field, Input } from "@/components/ui/field";
import type { EventState } from "@/lib/domain/types";
import { freezeTrading, unfreezeTrading } from "@/lib/mock/commands";
import { hostAction } from "./host-context";

/** Emergency freeze (fast confirm) and unfreeze (standard confirm). */
export function FreezeTradingControl({ state, size = "md", className }: { state: EventState; size?: ButtonSize; className?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const frozen = state.event.tradingFrozen;
  const live = state.event.status === "LIVE" || state.event.status === "PAUSED";

  return (
    <>
      {frozen ? (
        <Button variant="warning" size={size} onClick={() => setOpen(true)} className={className}>
          <Snowflake className="size-3.5" />
          Unfreeze trading
        </Button>
      ) : (
        <Button variant="warning-outline" size={size} onClick={() => setOpen(true)} disabled={!live} className={className}>
          <Siren className="size-3.5" />
          Freeze trading
        </Button>
      )}
      <ConfirmActionDialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setNote("");
        }}
        tier={frozen ? "confirm" : "emergency"}
        tone="warning"
        title={frozen ? "Unfreeze trading?" : "Freeze all trading now?"}
        description={
          frozen
            ? "Teams will be able to propose and accept trades again (subject to the round being open)."
            : "Every team is blocked from proposing or accepting trades immediately. Open proposals stay open but cannot settle until you unfreeze."
        }
        confirmLabel={frozen ? "Unfreeze trading" : "Freeze trading"}
        onConfirm={() =>
          frozen
            ? hostAction(unfreezeTrading(state.event.id), "Trading unfrozen")
            : hostAction(freezeTrading(state.event.id, note.trim() || null), "Trading frozen", "All teams are blocked from trading.")
        }
      >
        {!frozen && (
          <Field label="Note for the audit log (optional)" htmlFor="freeze-note">
            <Input id="freeze-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pricing dispute on NOVA" />
          </Field>
        )}
      </ConfirmActionDialog>
    </>
  );
}
