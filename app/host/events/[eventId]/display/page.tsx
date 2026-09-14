import type { Metadata } from "next";
import { DisplayScreen } from "@/components/host/display-screen";

export const metadata: Metadata = { title: "Projector display" };

export default function Page() {
  return <DisplayScreen />;
}
