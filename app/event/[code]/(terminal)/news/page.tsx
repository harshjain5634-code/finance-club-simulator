import type { Metadata } from "next";
import { NewsScreen } from "@/components/participant/records-screens";

export const metadata: Metadata = { title: "News" };

export default function Page() {
  return <NewsScreen />;
}
