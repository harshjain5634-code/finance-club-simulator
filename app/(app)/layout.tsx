import { AppShell } from "@/components/layout/app-shell";
import { getShellData } from "@/lib/services/shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const shell = await getShellData();
  return <AppShell shell={shell}>{children}</AppShell>;
}
