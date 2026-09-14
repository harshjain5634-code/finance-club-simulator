import type { Metadata } from "next";
import { RulesScreen } from "@/components/participant/records-screens";

export const metadata: Metadata = { title: "Rules" };

export default function Page() {
  return <RulesScreen />;
}
