import type { Metadata } from "next";
import { TradesMonitorScreen } from "@/components/host/trades-screen";

export const metadata: Metadata = { title: "Trade monitor" };

export default function Page() {
  return <TradesMonitorScreen />;
}
