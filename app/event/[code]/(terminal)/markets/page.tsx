import type { Metadata } from "next";
import { MarketsScreen } from "@/components/participant/markets-screen";

export const metadata: Metadata = { title: "Markets" };

export default function Page() {
  return <MarketsScreen />;
}
