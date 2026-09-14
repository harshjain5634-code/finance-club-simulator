import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectorScreen } from "@/components/projector/projector-screen";

export const metadata: Metadata = { title: "Projector" };

export default function ProjectorPage() {
  return (
    <Suspense fallback={<div className="h-dvh bg-black" />}>
      <ProjectorScreen />
    </Suspense>
  );
}
