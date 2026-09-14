import type { Metadata } from "next";
import { SetupAllocationsScreen } from "@/components/host/setup-screens";

export const metadata: Metadata = { title: "Allocations" };

export default function Page() {
  return <SetupAllocationsScreen />;
}
