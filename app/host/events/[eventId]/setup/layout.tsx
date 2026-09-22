import type { ReactNode } from "react";
import { SetupFrame } from "@/components/host/setup-frame";

export default function SetupLayout({ children }: { children: ReactNode }) {
  return <SetupFrame>{children}</SetupFrame>;
}
