import type { Metadata } from "next";
import { NewsDeskScreen } from "@/components/host/news-desk-screen";

export const metadata: Metadata = { title: "News desk" };

export default function Page() {
  return <NewsDeskScreen />;
}
