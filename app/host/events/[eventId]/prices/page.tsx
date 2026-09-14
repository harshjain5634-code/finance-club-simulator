import type { Metadata } from "next";
import { PricesScreen } from "@/components/host/market-screens";

export const metadata: Metadata = { title: "Prices" };

export default function Page() {
  return <PricesScreen />;
}
