import type { Metadata } from "next";
import { ExportsScreen } from "@/components/host/records-screens";

export const metadata: Metadata = { title: "Exports" };

export default function Page() {
  return <ExportsScreen />;
}
