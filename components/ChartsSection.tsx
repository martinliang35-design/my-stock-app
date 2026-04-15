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
  /** 顶部「总资产(可投资)」金额（CNY）；大于 0 时饼图与列表占比以该项为分母 */
  totalInvestableCny: number;
  /** 顶部输入的「可用现金」（CNY），可负；饼图现金扇区与列表现金行用此值 */
  availableCashCny: number;
};

const SLATE_BORDER = "rgba(148, 163, 184, 0.4)";
const CASH_SLICE_COLOR = "#64748b";

/** 饼图按标的着色，颜色循环使用 */
const PIE_COLORS = [
  "#38bdf8",
  "#818cf8",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#2dd4bf",
  "#fcd34d",
  "#94a3b8",
  "#f97316",
  "#22d3ee",
];

function marketSuffix(market: Holding["market"]): string {
  if (market === "HK") return "H";
  if (market === "US") return "美";
  if (market === "FUND") return "基";
  return "A";
}

function pieLabelForHolding(h: Holding): string {
  const name = (h.name || h.code || "未命名").trim() || "—";
  return `${name}(${marketSuffix(h.market)})`;
}

export default function ChartsSection({
  holdings,
  rates,
  totalInvestableCny,
  availableCashCny,
}: ChartsSectionProps) {
  const pieSlices = holdings
    .map((h) => ({
      h,
      mv: computeRowMetrics(h, rates).marketValue,
    }))
    .filter(({ mv }) => mv > 0.000001);

  const totalMv = pieSlices.reduce((s, x) => s + x.mv, 0);
  const hasTotalAssets = totalInvestableCny > 0.000001;
  /** 占比分母：有总资产用总资产，否则退回为持仓市值合计 */
  const denom = hasTotalAssets ? totalInvestableCny : totalMv > 0 ? totalMv : 1;
  /** 现金：来自顶部输入（可负）；无总资产时列表不展示现金行 */
  const cashAmount = hasTotalAssets ? availableCashCny : 0;
  /** 饼图里现金扇区仅在为正时绘制（负现金无法用扇区表示） */
  const cashSliceValue = hasTotalAssets && cashAmount > 0.000001 ? cashAmount : 0;

  const pieLabels = [
    ...pieSlices.map(({ h }) => pieLabelForHolding(h)),
    ...(cashSliceValue > 0.000001 ? ["现金(可用)"] : []),
  ];
  const pieValues = [
    ...pieSlices.map(({ mv }) => mv),
    ...(cashSliceValue > 0.000001 ? [cashSliceValue] : []),
  ];
  const pieBackgrounds = [
    ...pieSlices.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
    ...(cashSliceValue > 0.000001 ? [CASH_SLICE_COLOR] : []),
  ];

  const pieData = {
    labels: pieLabels,
    datasets: [
      {
        data: pieValues,
        backgroundColor: pieBackgrounds,
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
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx: { raw?: unknown; label?: string }) => {
            const raw = Number(ctx.raw);
            const pct =
              Number.isFinite(raw) && denom > 0 ? ((raw / denom) * 100).toFixed(1) : "0";
            const suffix = hasTotalAssets ? "总资产" : "持仓合计";
            return `${ctx.label ?? ""}: ${Number.isFinite(raw) ? formatMoney(raw) : ""}（占${suffix} ${pct}%）`;
          },
        },
      },
    },
  };

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-300">资产占比（总资产为分母）</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {hasTotalAssets
            ? "占比 = 该项 ÷ 顶部「总资产」；含现金。名称后 A= A股，H=港股，美=美股。"
            : "请先填写顶部「总资产」，即可按总资产显示占比与现金；未填写时占比按持仓市值合计为分母。"}
        </p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="h-52 min-w-0 flex-1">
            {(pieSlices.length > 0 || cashSliceValue > 0.000001) && (
              <Pie data={pieData} options={pieOptions} />
            )}
            {pieSlices.length === 0 && cashSliceValue <= 0.000001 && (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">暂无持仓数据</div>
            )}
          </div>
          {(pieSlices.length > 0 || hasTotalAssets) && (
            <ul className="max-h-52 w-full shrink-0 space-y-1 overflow-y-auto text-xs text-slate-400 lg:max-w-[240px]">
              {pieSlices.map(({ h, mv }, i) => {
                const pct = denom > 0 ? ((mv / denom) * 100).toFixed(1) : "0.0";
                return (
                  <li key={h.id} className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-1.5 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-slate-300" title={pieLabelForHolding(h)}>
                      <span
                        className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-sm align-middle"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        aria-hidden
                      />
                      {pieLabelForHolding(h)}
                    </span>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="text-sky-300/90">{pct}%</div>
                      <div className="text-[10px] text-slate-500">{formatMoney(mv)}</div>
                    </div>
                  </li>
                );
              })}
              {hasTotalAssets && (
                <li className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-1.5 pt-0.5 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-slate-300">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-sm align-middle"
                      style={{ backgroundColor: CASH_SLICE_COLOR }}
                      aria-hidden
                    />
                    现金{cashAmount < -0.000001 ? "（缺口）" : "（可用）"}
                  </span>
                  <div className="shrink-0 text-right tabular-nums">
                    <div
                      className={
                        cashAmount < -0.005
                          ? "text-red-400"
                          : cashAmount > 0.005
                            ? "text-emerald-400/90"
                            : "text-slate-400"
                      }
                    >
                      {denom > 0 ? ((cashAmount / denom) * 100).toFixed(1) : "0.0"}%
                    </div>
                    <div className="text-[10px] text-slate-500">{formatMoney(cashAmount)}</div>
                  </div>
                </li>
              )}
            </ul>
          )}
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
