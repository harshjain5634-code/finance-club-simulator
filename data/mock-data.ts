import type {
  AppNotification,
  Competition,
  CurrentUser,
  Holding,
  MarketStatus,
  Stock,
  Trade,
} from "@/lib/types";
import { istTimestamp } from "./mock-series";

// Frozen "current time" for the simulation so every render is deterministic.
export const MOCK_NOW = istTimestamp(2026, 9, 14, 15, 10);
export const ACCOUNT_OPENED_AT = istTimestamp(2025, 6, 2, 15, 30);
export const STARTING_CAPITAL = 1_000_000;
export const AVAILABLE_CASH = 60_500;

export const currentUser: CurrentUser = {
  name: "Aarav Sharma",
  firstName: "Aarav",
  initials: "AS",
  role: "Club member",
};

export const marketStatus: MarketStatus = {
  state: "OPEN",
  exchange: "NSE",
  detail: "Closes 15:30 IST",
};

export const stocks: Stock[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy", exchange: "NSE", lastPrice: 1428.6, previousClose: 1409.2 },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT Services", exchange: "NSE", lastPrice: 3086.2, previousClose: 3121.9 },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", exchange: "NSE", lastPrice: 982.45, previousClose: 974.1 },
  { symbol: "INFY", name: "Infosys", sector: "IT Services", exchange: "NSE", lastPrice: 1521.35, previousClose: 1498.6 },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking", exchange: "NSE", lastPrice: 1394.8, previousClose: 1389.25 },
  { symbol: "ITC", name: "ITC", sector: "FMCG", exchange: "NSE", lastPrice: 409.15, previousClose: 412.8 },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", exchange: "NSE", lastPrice: 824.7, previousClose: 806.35 },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Infrastructure", exchange: "NSE", lastPrice: 3662.3, previousClose: 3640.15 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", exchange: "NSE", lastPrice: 1947.5, previousClose: 1896.3 },
  { symbol: "MARUTI", name: "Maruti Suzuki India", sector: "Automobile", exchange: "NSE", lastPrice: 12684.0, previousClose: 12905.4 },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharma", exchange: "NSE", lastPrice: 1662.8, previousClose: 1628.45 },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Banking", exchange: "NSE", lastPrice: 1148.35, previousClose: 1171.9 },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking", exchange: "NSE", lastPrice: 2094.6, previousClose: 2079.2 },
  { symbol: "WIPRO", name: "Wipro", sector: "IT Services", exchange: "NSE", lastPrice: 248.9, previousClose: 254.35 },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG", exchange: "NSE", lastPrice: 2386.7, previousClose: 2401.1 },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Financial Services", exchange: "NSE", lastPrice: 918.45, previousClose: 889.6 },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Consumer", exchange: "NSE", lastPrice: 2431.2, previousClose: 2489.75 },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer", exchange: "NSE", lastPrice: 3528.9, previousClose: 3497.3 },
  { symbol: "NTPC", name: "NTPC", sector: "Power", exchange: "NSE", lastPrice: 338.65, previousClose: 332.1 },
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Metals", exchange: "NSE", lastPrice: 158.42, previousClose: 162.9 },
];

export const holdings: Holding[] = [
  { symbol: "RELIANCE", quantity: 120, averagePrice: 1386.4 },
  { symbol: "TCS", quantity: 40, averagePrice: 3212.75 },
  { symbol: "HDFCBANK", quantity: 150, averagePrice: 948.3 },
  { symbol: "INFY", quantity: 60, averagePrice: 1468.0 },
  { symbol: "ICICIBANK", quantity: 90, averagePrice: 1352.1 },
  { symbol: "ITC", quantity: 300, averagePrice: 418.6 },
  { symbol: "SBIN", quantity: 110, averagePrice: 792.4 },
  { symbol: "LT", quantity: 25, averagePrice: 3590.0 },
];

export const indexSnapshots = [
  { id: "nifty50", name: "NIFTY 50", exchange: "NSE", value: 25184.35, previousClose: 25062.1, seed: 11 },
  { id: "sensex", name: "SENSEX", exchange: "BSE", value: 82356.8, previousClose: 82015.45, seed: 12 },
  { id: "banknifty", name: "BANK NIFTY", exchange: "NSE", value: 55742.6, previousClose: 55918.25, seed: 13 },
] as const;

// Portfolio value at the start of each chart range; the end is always the live portfolio value.
export const performanceStartValues = {
  "1W": 1_013_200,
  "1M": 993_000,
  "3M": 976_700,
  "1Y": 993_400,
  ALL: STARTING_CAPITAL,
};

export const trades: Trade[] = [
  { id: "ORD-24081", symbol: "SBIN", name: "State Bank of India", side: "BUY", orderType: "MARKET", quantity: 10, price: 824.7, placedAt: istTimestamp(2026, 9, 14, 15, 2), status: "EXECUTED" },
  { id: "ORD-24077", symbol: "TCS", name: "Tata Consultancy Services", side: "SELL", orderType: "LIMIT", quantity: 15, price: 3092.4, placedAt: istTimestamp(2026, 9, 14, 14, 36), status: "EXECUTED" },
  { id: "ORD-24070", symbol: "INFY", name: "Infosys", side: "BUY", orderType: "MARKET", quantity: 20, price: 1512.85, placedAt: istTimestamp(2026, 9, 14, 13, 18), status: "EXECUTED" },
  { id: "ORD-24064", symbol: "ICICIBANK", name: "ICICI Bank", side: "BUY", orderType: "LIMIT", quantity: 30, price: 1380.0, placedAt: istTimestamp(2026, 9, 14, 11, 47), status: "OPEN" },
  { id: "ORD-24058", symbol: "ITC", name: "ITC", side: "SELL", orderType: "MARKET", quantity: 100, price: 414.25, placedAt: istTimestamp(2026, 9, 14, 10, 5), status: "EXECUTED" },
  { id: "ORD-24012", symbol: "LT", name: "Larsen & Toubro", side: "BUY", orderType: "LIMIT", quantity: 5, price: 3618.0, placedAt: istTimestamp(2026, 9, 11, 14, 52), status: "EXECUTED" },
  { id: "ORD-24003", symbol: "HDFCBANK", name: "HDFC Bank", side: "BUY", orderType: "LIMIT", quantity: 50, price: 955.0, placedAt: istTimestamp(2026, 9, 11, 10, 21), status: "CANCELLED" },
];

export const competition: Omit<Competition, "portfolioValue"> = {
  id: "fc-challenge-2026",
  name: "Finance Club Trading Challenge 2026",
  rank: 7,
  rankChange: 2,
  participants: 126,
  leaderValue: 1_168_430,
  startsAt: istTimestamp(2026, 8, 17, 9, 15),
  endsAt: istTimestamp(2026, 10, 2, 15, 30),
};

export const notifications: AppNotification[] = [
  { id: "n1", kind: "order", title: "Order executed", body: "Bought 10 SBIN at ₹824.70", timeLabel: "8m ago", unread: true },
  { id: "n2", kind: "competition", title: "You moved up to rank #7", body: "Finance Club Trading Challenge 2026", timeLabel: "1h ago", unread: true },
  { id: "n3", kind: "alert", title: "Price alert triggered", body: "RELIANCE crossed ₹1,425.00", timeLabel: "2h ago", unread: true },
  { id: "n4", kind: "system", title: "Weekly market recap is ready", body: "Review last week's sector performance", timeLabel: "Sat", unread: false },
];
