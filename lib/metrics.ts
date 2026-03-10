import type { Holding } from "@/lib/holdings";

export type Rates = { usdToCny: number; hkdToCny: number };

function toCny(market: string, value: number, rates: Rates): number {
  if (market === "US") return value * rates.usdToCny;
  if (market === "HK") return value * rates.hkdToCny;
  return value;
}

export function computeRowMetrics(
  h: Holding,
  rates: Rates
): { marketValue: number; cost: number; profit: number; profitPercent: number } {
  const mv = Number(h.current_price) * Number(h.quantity);
  const cost = Number(h.cost_price) * Number(h.quantity);
  const marketValueCny = toCny(h.market, mv, rates);
  const costCny = toCny(h.market, cost, rates);
  const profit = marketValueCny - costCny;
  const profitPercent = costCny > 0 ? (profit / costCny) * 100 : 0;
  return { marketValue: marketValueCny, cost: costCny, profit, profitPercent };
}

export function computeTotals(
  holdings: Holding[],
  rates: Rates
): {
  totalMv: number;
  totalCost: number;
  totalProfit: number;
  totalProfitPercent: number;
} {
  let totalMv = 0;
  let totalCost = 0;
  for (const h of holdings) {
    const { marketValue, cost } = computeRowMetrics(h, rates);
    totalMv += marketValue;
    totalCost += cost;
  }
  const totalProfit = totalMv - totalCost;
  const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  return { totalMv, totalCost, totalProfit, totalProfitPercent };
}
