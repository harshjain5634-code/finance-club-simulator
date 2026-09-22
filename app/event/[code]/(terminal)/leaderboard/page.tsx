import type { Metadata } from "next";
import { LeaderboardScreen } from "@/components/participant/leaderboard-screen";

export const metadata: Metadata = { title: "Leaderboard" };

export default function Page() {
  return <LeaderboardScreen />;
}
