import type { Metadata } from "next";
import { StockDetailScreen } from "@/components/participant/stock-detail-screen";

export async function generateMetadata({ params }: PageProps<"/event/[code]/markets/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol).toUpperCase() };
}

export default function Page() {
  return <StockDetailScreen />;
}
