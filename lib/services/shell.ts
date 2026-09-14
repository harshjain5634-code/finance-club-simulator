import { AVAILABLE_CASH, currentUser, marketStatus, notifications, stocks } from "@/data/mock-data";
import { toQuote } from "@/lib/portfolio";
import type { ShellData } from "@/lib/types";

export async function getShellData(): Promise<ShellData> {
  return {
    user: currentUser,
    marketStatus,
    availableCash: AVAILABLE_CASH,
    notifications,
    searchableStocks: stocks.map(toQuote),
  };
}
