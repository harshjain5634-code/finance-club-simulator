import type { Metadata } from "next";
import { CreateEventWizard } from "@/components/host/host-home";

export const metadata: Metadata = { title: "Create event" };

export default function Page() {
  return <CreateEventWizard />;
}
