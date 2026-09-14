import type { Metadata } from "next";
import { SetupInstrumentsScreen } from "@/components/host/setup-screens";

export const metadata: Metadata = { title: "Instruments" };

export default function Page() {
  return <SetupInstrumentsScreen />;
}
