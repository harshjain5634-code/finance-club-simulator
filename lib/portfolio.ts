import type { Holding, HoldingRow, PortfolioSummary, Stock, StockQuote } from "./types";

export function toQuote(stock: Stock): StockQuote {
  const change = stock.lastPrice - stock.previousClose;
  return { ...stock, change, changePct: (change / stock.previousClose) * 100 };
}

export function buildHoldingRows(holdings: Holding[], stocks: Stock[]): HoldingRow[] {
  const bySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));

  return holdings.flatMap((holding) => {
    const stock = bySymbol.get(holding.symbol);
    if (!stock) return [];

    const investedValue = holding.quantity * holding.averagePrice;
    const currentValue = holding.quantity * stock.lastPrice;
    const pnl = currentValue - investedValue;

    return [
      {
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        quantity: holding.quantity,
        averagePrice: holding.averagePrice,
        currentPrice: stock.lastPrice,
        dayChangePct: toQuote(stock).changePct,
        investedValue,
        currentValue,
        pnl,
        returnPct: (pnl / investedValue) * 100,
      },
    ];
  });
}

export function summarizePortfolio(
  rows: HoldingRow[],
  stocks: Stock[],
  availableCash: number,
  startingCapital: number,
): PortfolioSummary {
  const bySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));

  let holdingsValue = 0;
  let investedValue = 0;
  let todayPnl = 0;

  for (const row of rows) {
    holdingsValue += row.currentValue;
    investedValue += row.investedValue;
    const stock = bySymbol.get(row.symbol);
    if (stock) todayPnl += row.quantity * (stock.lastPrice - stock.previousClose);
  }

  const portfolioValue = holdingsValue + availableCash;
  const previousValue = portfolioValue - todayPnl;
  const totalReturn = portfolioValue - startingCapital;

  return {
    startingCapital,
    portfolioValue,
    holdingsValue,
    investedValue,
    availableCash,
    unrealizedPnl: holdingsValue - investedValue,
    todayPnl,
    todayPnlPct: (todayPnl / previousValue) * 100,
    totalReturn,
    totalReturnPct: (totalReturn / startingCapital) * 100,
  };
}
