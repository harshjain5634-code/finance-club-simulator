import type { Metadata } from "next";
import { SetupGeneralScreen } from "@/components/host/setup-screens";

export const metadata: Metadata = { title: "General settings" };

export default function Page() {
  return <SetupGeneralScreen />;
}
