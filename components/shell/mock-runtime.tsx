"use client";

import { useEffect } from "react";
import { startScheduler } from "@/lib/mock/runtime";

/** Mounts the prototype scheduler (single leader tab via Web Locks). Renders nothing. */
export function MockRuntime() {
  useEffect(() => {
    startScheduler();
  }, []);
  return null;
}
