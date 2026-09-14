import type { Metadata } from "next";
import { AuditLogScreen } from "@/components/host/records-screens";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AuditLogScreen />;
}
