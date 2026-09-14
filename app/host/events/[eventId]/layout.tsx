import { HostEventShell } from "@/components/host/host-shell";

export default function HostEventLayout({ children }: LayoutProps<"/host/events/[eventId]">) {
  return <HostEventShell>{children}</HostEventShell>;
}
