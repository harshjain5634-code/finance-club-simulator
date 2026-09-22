import type { Metadata } from "next";
import { SetupReviewScreen } from "@/components/host/setup-review";

export const metadata: Metadata = { title: "Review & start" };

export default function Page() {
  return <SetupReviewScreen />;
}
