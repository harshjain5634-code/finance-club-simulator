import type { Metadata } from "next";
import { LeaderboardScreen } from "@/components/participant/records-screens";

export const metadata: Metadata = { title: "Leaderboard" };

export default function Page() {
  return <LeaderboardScreen />;
}
