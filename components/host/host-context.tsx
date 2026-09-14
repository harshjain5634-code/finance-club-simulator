"use client";

import { createContext, useContext } from "react";
import type { EventState, OpResult } from "@/lib/domain/types";
import { useEventById } from "@/lib/mock/hooks";
import { toast } from "@/lib/toast";

export const HostEventContext = createContext<string | null>(null);

export function useHostEvent(): { state: EventState; eventId: string } {
  const eventId = useContext(HostEventContext);
  if (!eventId) throw new Error("useHostEvent must be used inside the host event shell");
  const state = useEventById(eventId)!;
  return { state, eventId };
}

export const hostBase = (eventId: string) => `/host/events/${eventId}`;

/** Runs a host command and reports the outcome as a toast. Returns the result for dialogs. */
export async function hostAction<T>(promise: Promise<OpResult<T>>, success: string | ((value: T) => string), description?: string | ((value: T) => string | undefined)) {
  const result = await promise;
  if (result.ok) {
    toast.success(typeof success === "function" ? success(result.value) : success, typeof description === "function" ? description(result.value) : description);
  } else {
    toast.error("Action not completed", result.message);
  }
  return result;
}
