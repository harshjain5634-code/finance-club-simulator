"use client";

import { useSyncExternalStore } from "react";

export type ToastTone = "success" | "error" | "info" | "warning";
export type Toast = { id: number; tone: ToastTone; title: string; description?: string; durationMs: number };

let toasts: Toast[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const EMPTY: Toast[] = [];

function emit() {
  for (const listener of listeners) listener();
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(tone: ToastTone, title: string, description?: string, durationMs = 4500) {
  const id = ++counter;
  toasts = [...toasts.slice(-4), { id, tone, title, description, durationMs }];
  emit();
  window.setTimeout(() => dismissToast(id), durationMs);
  return id;
}

export const toast = {
  success: (title: string, description?: string) => push("success", title, description),
  error: (title: string, description?: string) => push("error", title, description, 6500),
  info: (title: string, description?: string) => push("info", title, description),
  warning: (title: string, description?: string) => push("warning", title, description, 6000),
};

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
    () => EMPTY,
  );
}
