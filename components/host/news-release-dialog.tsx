"use client";

import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Badge } from "@/components/ui/badge";
import { ImpactLabel } from "@/components/market/widgets";
import { formatPrice } from "@/lib/domain/money";
import { previewImpact } from "@/lib/domain/news";
import type { EventState, NewsItem } from "@/lib/domain/types";
import { releaseNews } from "@/lib/mock/commands";
import { instrumentOf } from "@/lib/mock/selectors";
import { hostAction } from "./host-context";

export function ReleaseNewsDialog({ state, item, onClose }: { state: EventState; item: NewsItem | null; onClose: () => void }) {
  const live = state.event.status === "LIVE" || state.event.status === "PAUSED";
  return (
    <ConfirmActionDialog
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      tier="confirm"
      size="lg"
      title={item ? `Release news #${item.number}?` : "Release news"}
      description="Teams see a breaking-news alert, the projector shows the takeover and each impact is resolved once and applied immediately."
      confirmLabel="Release news"
      canConfirm={live && item?.status === "READY"}
      onConfirm={async ({ idempotencyKey }) => {
        if (!item) return { ok: true, value: undefined };
        return hostAction(
          releaseNews(state.event.id, item.id, idempotencyKey),
          (release) => `Released: ${release.headline}`,
          (release) =>
            release.impacts
              .map((i) => `${instrumentOf(state, i.instrumentId)?.symbol} ${i.appliedPct >= 0 ? "+" : ""}${i.appliedPct.toFixed(2)}% → ₹${formatPrice(i.newPrice)}${i.clamped ? " (clamped)" : ""}`)
              .join(" · ") || "No price impact",
        );
      }}
    >
      {item && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-raised px-3.5 py-3">
            <p className="text-[14px] font-semibold text-fg-primary">{item.headline}</p>
            {item.body && <p className="mt-1 text-[13px] leading-relaxed text-fg-secondary">{item.body}</p>}
          </div>
          {!live && <p className="text-[13px] text-warning">Start the event before releasing news.</p>}
          {item.impacts.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Informational only: no stocks are affected.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="bg-surface-raised text-[11px] tracking-wide text-fg-muted uppercase">
                    <th className="px-3 py-2 text-left font-medium">Stock</th>
                    <th className="px-3 py-2 text-right font-medium">Current</th>
                    <th className="px-3 py-2 text-right font-medium">Configured</th>
                    <th className="px-3 py-2 text-right font-medium">Possible price</th>
                  </tr>
                </thead>
                <tbody>
                  {item.impacts.map((impact) => {
                    const preview = previewImpact(state, impact);
                    return (
                      <tr key={impact.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-fg-primary">{instrumentOf(state, impact.instrumentId)?.symbol}</td>
                        <td className="px-3 py-2 text-right tabular-nums">₹{formatPrice(preview.currentPrice)}</td>
                        <td className="px-3 py-2 text-right">
                          <ImpactLabel configured={preview.configured} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {preview.minPrice === preview.maxPrice ? `₹${formatPrice(preview.minPrice)}` : `₹${formatPrice(preview.minPrice)} – ₹${formatPrice(preview.maxPrice)}`}
                          {preview.mayClamp && (
                            <Badge tone="warning" className="ml-2">
                              Limit applies
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-fg-muted">Range impacts are drawn once at release; the exact value is stored in the price history and audit log.</p>
        </div>
      )}
    </ConfirmActionDialog>
  );
}
