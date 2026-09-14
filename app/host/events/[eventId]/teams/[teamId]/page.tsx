import type { Metadata } from "next";
import { TeamDetailScreen } from "@/components/host/teams-screens";

export const metadata: Metadata = { title: "Team detail" };

export default function Page() {
  return <TeamDetailScreen />;
}
