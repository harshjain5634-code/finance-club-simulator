import type { Metadata } from "next";
import { HostEventsScreen } from "@/components/host/host-home";

export const metadata: Metadata = { title: "Host console" };

export default function Page() {
  return <HostEventsScreen />;
}
