import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import { MockRuntime } from "@/components/shell/mock-runtime";
import { TooltipProvider } from "@/components/ui/controls";
import { Toaster } from "@/components/ui/toaster";
import { siteConfig } from "@/lib/site";
import "./globals.css";

// C4 typography: DM Sans for UI, DM Mono where fixed-width figures help scanning (tables, clocks, prices).
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: `${siteConfig.name} · ${siteConfig.product}`, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e12" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className={`${dmSans.variable} ${dmMono.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh bg-canvas text-fg-primary">
        <TooltipProvider>
          {children}
          <Toaster />
          <MockRuntime />
        </TooltipProvider>
      </body>
    </html>
  );
}
