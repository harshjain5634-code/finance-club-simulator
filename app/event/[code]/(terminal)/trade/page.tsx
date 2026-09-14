import { Suspense } from "react";
import type { Metadata } from "next";
import { ScreenSkeleton } from "@/components/market/widgets";
import { TradeScreen } from "@/components/participant/trade-screen";

export const metadata: Metadata = { title: "Trade" };

export default function Page() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <TradeScreen />
    </Suspense>
  );
}
