import type { Metadata } from "next";
import { SetupRoundsScreen } from "@/components/host/setup-screens";

export const metadata: Metadata = { title: "Rounds" };

export default function Page() {
  return <SetupRoundsScreen />;
}
