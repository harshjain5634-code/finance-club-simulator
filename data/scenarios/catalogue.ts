import type { InstrumentConfig } from "@/lib/domain/event-config";
import { rupees } from "@/lib/domain/money";
import { generateHistory, seedFrom } from "../mock-history";
import { DEMO_DATE } from "./shared";

/**
 * Real company identities with static, illustrative starting prices. No market data API in Phase 1;
 * in the event, prices are controlled by the simulation (REAL_SIMULATED).
 */
export type CatalogueEntry = {
  symbol: string;
  name: string;
  sector: string;
  description: string;
  price: number;
  supply: number;
};

export const REAL_CATALOGUE: CatalogueEntry[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy & Retail", description: "Conglomerate spanning oil-to-chemicals, retail and digital services.", price: 1425, supply: 3000 },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT Services", description: "India's largest IT services and consulting company.", price: 3085, supply: 1500 },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", description: "Largest private-sector bank in India by assets.", price: 982.5, supply: 4000 },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking", description: "Major private-sector bank with retail, corporate and insurance businesses.", price: 1395, supply: 3000 },
  { symbol: "INFY", name: "Infosys", sector: "IT Services", description: "Global IT services, consulting and digital transformation company.", price: 1520, supply: 3000 },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", description: "India's largest public-sector bank.", price: 825, supply: 5000 },
  { symbol: "ITC", name: "ITC", sector: "FMCG", description: "Diversified company across FMCG, hotels, paperboards and agri-business.", price: 409.15, supply: 8000 },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Infrastructure", description: "Engineering, construction and technology conglomerate.", price: 3660, supply: 1500 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", description: "Telecommunications operator with mobile, broadband and enterprise services.", price: 1947.5, supply: 2500 },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharma", description: "India's largest pharmaceutical company by revenue.", price: 1662.8, supply: 2500 },
  { symbol: "MARUTI", name: "Maruti Suzuki India", sector: "Automobile", description: "Largest passenger car manufacturer in India.", price: 12684, supply: 400 },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer", description: "Jewellery, watches and eyewear brands.", price: 3528.9, supply: 1500 },
];

export function catalogueInstrument(entry: CatalogueEntry, date = DEMO_DATE): InstrumentConfig {
  return {
    symbol: entry.symbol,
    name: entry.name,
    sector: entry.sector,
    description: entry.description,
    mode: "REAL_SIMULATED",
    exchange: "NSE",
    startingPrice: rupees(entry.price),
    supply: entry.supply,
    floor: Math.round(rupees(entry.price * 0.5) / 5) * 5,
    ceiling: Math.round(rupees(entry.price * 2) / 5) * 5,
    circuitPct: 10,
    enabled: true,
    history: generateHistory({ endPrice: rupees(entry.price), endDate: date, seed: seedFrom(`real-${entry.symbol}`), driftPct: 3, volatilityPct: 1.1 }),
  };
}
