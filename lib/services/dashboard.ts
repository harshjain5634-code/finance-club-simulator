import {
  ACCOUNT_OPENED_AT,
  AVAILABLE_CASH,
  MOCK_NOW,
  STARTING_CAPITAL,
  competition,
  currentUser,
  holdings,
  indexSnapshots,
  performanceStartValues,
  stocks,
  trades,
} from "@/data/mock-data";
import { buildPerformanceSeries, intradaySeries } from "@/data/mock-series";
import { buildHoldingRows, summarizePortfolio, toQuote } from "@/lib/portfolio";
import type { DashboardData } from "@/lib/types";

// Swap the mock imports for database/API calls later; components only depend on DashboardData.
export async function getDashboardData(): Promise<DashboardData> {
  const rows = buildHoldingRows(holdings, stocks);
  const summary = summarizePortfolio(rows, stocks, AVAILABLE_CASH, STARTING_CAPITAL);

  const quotes = stocks.map(toQuote).sort((a, b) => b.changePct - a.changePct);

  return {
    asOf: MOCK_NOW,
    user: currentUser,
    summary,
    holdings: rows,
    performance: buildPerformanceSeries({
      now: MOCK_NOW,
      accountOpenedAt: ACCOUNT_OPENED_AT,
      currentValue: summary.portfolioValue,
      previousCloseValue: summary.portfolioValue - summary.todayPnl,
      startValues: performanceStartValues,
    }),
    indices: indexSnapshots.map(({ seed, ...index }) => ({
      ...index,
      intraday: intradaySeries(MOCK_NOW, index.previousClose, index.value, 0.0006, seed),
    })),
    gainers: quotes.filter((q) => q.changePct > 0).slice(0, 5),
    losers: quotes.filter((q) => q.changePct < 0).reverse().slice(0, 5),
    trades,
    competition: { ...competition, portfolioValue: summary.portfolioValue },
  };
}
