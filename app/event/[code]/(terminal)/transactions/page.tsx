import type { Metadata } from "next";
import { TransactionsScreen } from "@/components/participant/records-screens";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return <TransactionsScreen />;
}
