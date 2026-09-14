import type { Metadata } from "next";
import { NewsDeskScreen } from "@/components/host/market-screens";

export const metadata: Metadata = { title: "News desk" };

export default function Page() {
  return <NewsDeskScreen />;
}
