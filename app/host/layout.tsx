import type { ReactNode } from "react";
import { ThemeScope } from "@/components/shell/theme-scope";

/** Every host screen uses C4 Host Dark in compact density (section 13). */
export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeScope theme="host" density="compact">
      {children}
    </ThemeScope>
  );
}
