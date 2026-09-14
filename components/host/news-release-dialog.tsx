"use client";

import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Badge } from "@/components/ui/badge";
import { ImpactLabel } from "@/components/market/widgets";
import { formatPrice } from "@/lib/domain/money";
import { previewImpact } from "@/lib/domain/news";
import { lastNewsReleaseAt } from "@/lib/domain/random-news";
import type { EventState, NewsItem } from "@/lib/domain/types";
import { formatDuration } from "@/lib/format";
import { releaseNews } from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { instrumentOf } from "@/lib/mock/selectors";
import { hostAction } from "./host-context";

/** Preview-and-confirm for one story: shows each affected stock's current price, configured impact and possible result. */
export function ReleaseNewsDialog({ state, item, onClose }: { state: EventState; item: NewsItem | null; onClose: () => void }) {
  const now = useNow();
  const live = state.event.status === "LIVE" || state.event.status === "PAUSED";
  const last = lastNewsReleaseAt(state);
  const random = state.randomNews;
  const gapWarning = random.mode === "RANDOM" && random.status === "RUNNING" && last !== null && now - last < random.minGapSeconds * 1000;

  return (
    <ConfirmActionDialog
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      tier="confirm"
      size="lg"
      title={item ? `Release news #${item.number}?` : "Release news"}
      description="Every team gets a breaking-news alert, the projector shows the takeover, and prices move immediately."
      confirmLabel="Release news"
      canConfirm={live && item?.status === "READY"}
      onConfirm={async ({ idempotencyKey }) => {
        if (!item) return { ok: true, value: undefined };
        return hostAction(
          releaseNews(state.event.id, item.id, idempotencyKey),
          (release) => `Released: ${release.headline}`,
          (release) =>
            release.impacts
              .map((i) => `${instrumentOf(state, i.instrumentId)?.symbol} ${i.appliedPct >= 0 ? "+" : ""}${i.appliedPct.toFixed(2)}% → ₹${formatPrice(i.newPrice)}${i.clamped ? " (limited)" : ""}`)
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
          {item.status !== "READY" && <p className="text-[13px] text-warning">Only stories marked Ready can be released.</p>}
          {gapWarning && last !== null && (
            <p className="rounded-md border border-warning/40 bg-warning/8 px-3 py-2 text-[13px] text-fg-primary">
              The last story went out {formatDuration(now - last)} ago. Random mode keeps at least {formatDuration(random.minGapSeconds * 1000)} between stories, so the next random story will be pushed back.
            </p>
          )}
          {item.impacts.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Informational only: no stocks are affected.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="bg-surface-raised text-[11px] tracking-wide text-fg-muted uppercase">
                    <th className="px-3 py-2 text-left font-medium">Stock</th>
                    <th className="px-3 py-2 text-right font-medium">Now</th>
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
          <p className="text-xs text-fg-muted">A range is drawn once at release; the exact result is stored in price history and the audit log.</p>
        </div>
      )}
    </ConfirmActionDialog>
  );
}
