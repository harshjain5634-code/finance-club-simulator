import type { Metadata } from "next";
import { ControlRoomScreen } from "@/components/host/control-room-screen";

export const metadata: Metadata = { title: "Control room" };

export default function Page() {
  return <ControlRoomScreen />;
}
