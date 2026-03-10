"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  ArcElement,
  PieController,
  Tooltip,
  Legend,
} from "chart.js";
import { Pie, Bar } from "react-chartjs-2";
import type { Holding } from "@/lib/holdings";
import type { Rates } from "@/lib/metrics";
import { computeRowMetrics } from "@/lib/metrics";
import { formatMoney } from "@/lib/format";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  ArcElement,
  PieController,
  Tooltip,
  Legend
);

export type ChartsSectionProps = {
  holdings: Holding[];
  rates: Rates;
};

const SLATE_PALETTE = ["#38bdf8", "#818cf8", "#f472b6"];
const SLATE_BG = "rgba(30, 41, 59, 0.8)";
const SLATE_BORDER = "rgba(148, 163, 184, 0.4)";

export default function ChartsSection({ holdings, rates }: ChartsSectionProps) {
  const byMarket = { A: 0, HK: 0, US: 0 };
  for (const h of holdings) {
    const { marketValue } = computeRowMetrics(h, rates);
    byMarket[h.market] = (byMarket[h.market] ?? 0) + marketValue;
  }

  const pieData = {
    labels: ["A股", "港股", "美股"],
    datasets: [
      {
        data: [byMarket.A, byMarket.HK, byMarket.US],
        backgroundColor: SLATE_PALETTE,
        borderColor: SLATE_BORDER,
        borderWidth: 1,
      },
    ],
  };

  const sortedByMv = [...holdings]
    .map((h) => ({ h, mv: computeRowMetrics(h, rates).marketValue }))
    .sort((a, b) => b.mv - a.mv)
    .slice(0, 5);

  const barData = {
    labels: sortedByMv.map(({ h }) => h.name || h.code || "—"),
    datasets: [
      {
        label: "市值(CNY)",
        data: sortedByMv.map(({ mv }) => mv),
        backgroundColor: "rgba(56, 189, 248, 0.7)",
        borderColor: "#38bdf8",
        borderWidth: 1,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#cbd5e1" } },
      tooltip: {
        callbacks: {
          label: (ctx: { raw?: unknown }) =>
            ctx.raw != null && Number.isFinite(Number(ctx.raw)) ? formatMoney(Number(ctx.raw)) : "",
        },
      },
    },
    scales: {
      x: { ticks: { color: "#94a3b8" }, grid: { color: SLATE_BORDER } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: SLATE_BORDER } },
    },
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#cbd5e1" } },
      tooltip: {
        callbacks: {
          label: (ctx: { raw?: unknown; label?: string; dataset?: { data?: number[] } }) => {
            const raw = Number(ctx.raw);
            const data = ctx.dataset?.data ?? [];
            const total = data.reduce((a, b) => a + b, 0) || 1;
            const pct = Number.isFinite(raw) && total > 0 ? ((raw / total) * 100).toFixed(1) : "0";
            return `${ctx.label ?? ""}: ${Number.isFinite(raw) ? formatMoney(raw) : ""} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-300">各市场资产占比</h2>
        <div className="mt-2 h-52">
          <Pie data={pieData} options={pieOptions} />
        </div>
      </div>
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-300">持仓市值 Top 5</h2>
        <div className="mt-2 h-52">
          <Bar data={barData} options={barOptions} />
        </div>
      </div>
    </section>
  );
}
