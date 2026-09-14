import type { Metadata } from "next";
import { LeaderboardControlScreen } from "@/components/host/market-screens";

export const metadata: Metadata = { title: "Leaderboard control" };

export default function Page() {
  return <LeaderboardControlScreen />;
}
