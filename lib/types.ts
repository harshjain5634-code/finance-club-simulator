export type Stock = {
  symbol: string;
  name: string;
  sector: string;
  exchange: "NSE" | "BSE";
  lastPrice: number;
  previousClose: number;
};

export type StockQuote = Stock & {
  change: number;
  changePct: number;
};

export type MarketIndex = {
  id: string;
  name: string;
  exchange: "NSE" | "BSE";
  value: number;
  previousClose: number;
  intraday: number[];
};

export type Holding = {
  symbol: string;
  quantity: number;
  averagePrice: number;
};

export type HoldingRow = {
  symbol: string;
  name: string;
  sector: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  dayChangePct: number;
  investedValue: number;
  currentValue: number;
  pnl: number;
  returnPct: number;
};

export type PortfolioSummary = {
  startingCapital: number;
  portfolioValue: number;
  holdingsValue: number;
  investedValue: number;
  availableCash: number;
  unrealizedPnl: number;
  todayPnl: number;
  todayPnlPct: number;
  totalReturn: number;
  totalReturnPct: number;
};

export type PerformanceRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export type PerformancePoint = {
  t: number;
  value: number | null;
};

export type TradeSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type TradeStatus = "EXECUTED" | "OPEN" | "CANCELLED";

export type Trade = {
  id: string;
  symbol: string;
  name: string;
  side: TradeSide;
  orderType: OrderType;
  quantity: number;
  price: number;
  placedAt: number;
  status: TradeStatus;
};

export type Competition = {
  id: string;
  name: string;
  rank: number;
  rankChange: number;
  participants: number;
  portfolioValue: number;
  leaderValue: number;
  startsAt: number;
  endsAt: number;
};

export type MarketStatus = {
  state: "OPEN" | "CLOSED" | "PRE_OPEN";
  exchange: string;
  detail: string;
};

export type NotificationKind = "order" | "competition" | "alert" | "system";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  timeLabel: string;
  unread: boolean;
};

export type CurrentUser = {
  name: string;
  firstName: string;
  initials: string;
  role: string;
};

export type ShellData = {
  user: CurrentUser;
  marketStatus: MarketStatus;
  availableCash: number;
  notifications: AppNotification[];
  searchableStocks: StockQuote[];
};

export type DashboardData = {
  asOf: number;
  user: CurrentUser;
  summary: PortfolioSummary;
  holdings: HoldingRow[];
  performance: Record<PerformanceRange, PerformancePoint[]>;
  indices: MarketIndex[];
  gainers: StockQuote[];
  losers: StockQuote[];
  trades: Trade[];
  competition: Competition;
};
