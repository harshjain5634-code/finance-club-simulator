import type { Metadata } from "next";
import { NewsScreen } from "@/components/participant/news-screen";

export const metadata: Metadata = { title: "News" };

export default function Page() {
  return <NewsScreen />;
}
