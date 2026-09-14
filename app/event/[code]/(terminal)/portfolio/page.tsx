import type { Metadata } from "next";
import { PortfolioScreen } from "@/components/participant/portfolio-screen";

export const metadata: Metadata = { title: "Portfolio" };

export default function Page() {
  return <PortfolioScreen />;
}
