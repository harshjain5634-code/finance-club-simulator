import { TerminalShell } from "@/components/participant/terminal-shell";

export default function TerminalLayout({ children }: LayoutProps<"/event/[code]">) {
  return <TerminalShell>{children}</TerminalShell>;
}
