import type { Metadata } from "next";
import { TeamsScreen } from "@/components/host/teams-screens";

export const metadata: Metadata = { title: "Teams" };

export default function Page() {
  return <TeamsScreen />;
}
