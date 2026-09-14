import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MockRuntime } from "@/components/shell/mock-runtime";
import { TooltipProvider } from "@/components/ui/controls";
import { Toaster } from "@/components/ui/toaster";
import { siteConfig } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: `${siteConfig.name} · ${siteConfig.product}`, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
};

export const viewport: Viewport = {
  themeColor: "#0b0f16",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
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
