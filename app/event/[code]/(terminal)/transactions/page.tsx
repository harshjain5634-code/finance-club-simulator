import type { Metadata } from "next";
import { TransactionsScreen } from "@/components/participant/transactions-screen";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return <TransactionsScreen />;
}
