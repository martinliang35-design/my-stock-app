"use client";

import { useCallback, useState } from "react";
import type { Holding } from "@/lib/holdings";
import type { Rates } from "@/lib/metrics";
import { computeRowMetrics } from "@/lib/metrics";
import { formatMoney, formatPercent, getProfitColorClass } from "@/lib/format";

export type HoldingsTableProps = {
  holdings: Holding[];
  rates: Rates;
  showDetailColumns?: boolean;
  onUpdate: (id: string, updates: Partial<Omit<Holding, "id" | "created_at" | "updated_at">>) => void;
  onDelete: (id: string) => void;
  onOrderChange: (ids: string[]) => void;
  onOpenKline: (code: string, market: "A" | "HK" | "US" | "FUND", name: string) => void;
  onOpenStrategy: (holding: Holding) => void;
};

const MARKETS: Array<"A" | "HK" | "US" | "FUND"> = ["A", "HK", "US", "FUND"];
const MARKET_LABELS: Record<string, string> = {
  A: "A股",
  HK: "港股",
  US: "美股",
  FUND: "基金",
};

export default function HoldingsTable({
  holdings,
  rates,
  showDetailColumns = true,
  onUpdate,
  onDelete,
  onOrderChange,
  onOpenKline,
  onOpenStrategy,
}: HoldingsTableProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverId(null);
      setDraggedId(null);
      const sourceId = e.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === targetId) return;
      const idx = holdings.findIndex((h) => h.id === sourceId);
      const targetIdx = holdings.findIndex((h) => h.id === targetId);
      if (idx < 0 || targetIdx < 0) return;
      const reordered = [...holdings];
      const [removed] = reordered.splice(idx, 1);
      reordered.splice(targetIdx, 0, removed);
      onOrderChange(reordered.map((h) => h.id));
    },
    [holdings, onOrderChange]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const orderedHoldings = [...holdings];

  const thBase = "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-300";
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/60">
      <table className="w-full min-w-[900px] divide-y divide-slate-700 text-sm">
        <thead>
          <tr className="border-b-2 border-slate-500/80 bg-slate-800">
            <th className={`w-8 text-left ${thBase}`} aria-label="拖拽" />
            <th className={`text-left ${thBase}`}>代码</th>
            <th className={`text-left ${thBase}`}>名称</th>
            <th className={`text-left ${thBase}`}>市场</th>
            {showDetailColumns && (
              <>
                <th className={`text-right ${thBase}`}>数量</th>
                <th className={`text-right ${thBase}`}>成本</th>
              </>
            )}
            <th className={`text-right ${thBase}`}>现价</th>
            <th className={`text-right ${thBase}`}>市值</th>
            <th className={`text-right ${thBase}`}>盈亏</th>
            <th className={`text-right ${thBase}`}>盈亏%</th>
            <th className={`text-center ${thBase}`}>操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/80 bg-slate-950/50">
          {orderedHoldings.map((h) => {
            const metrics = computeRowMetrics(h, rates);
            const rowKey = h.id;
            const isDragging = draggedId === h.id;
            const isDragOver = dragOverId === h.id;
            return (
              <tr
                key={rowKey}
                draggable
                onDragStart={(e) => handleDragStart(e, h.id)}
                onDragOver={(e) => handleDragOver(e, h.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, h.id)}
                onDragEnd={handleDragEnd}
                className={`text-slate-200 transition-colors ${
                  isDragging ? "opacity-50" : ""
                } ${isDragOver ? "bg-sky-900/30" : "hover:bg-slate-800/50"}`}
              >
                <td className="cursor-grab px-3 py-2.5 text-slate-500 active:cursor-grabbing" title="拖拽排序">
                  ⋮⋮
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="text"
                    defaultValue={h.code}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== h.code) onUpdate(h.id, { code: v });
                    }}
                    className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="text"
                    defaultValue={h.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== h.name) onUpdate(h.id, { name: v });
                    }}
                    className="min-w-[80px] rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <select
                    value={h.market}
                    onChange={(e) => {
                      const v = e.target.value as "A" | "HK" | "US" | "FUND";
                      if (v !== h.market) onUpdate(h.id, { market: v });
                    }}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  >
                    {MARKETS.map((m) => (
                      <option key={m} value={m}>
                        {MARKET_LABELS[m] || m}
                      </option>
                    ))}
                  </select>
                </td>
                {showDetailColumns && (
                  <>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        defaultValue={h.quantity != null && Number(h.quantity) !== 0 ? String(h.quantity) : ""}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const v = raw === "" ? 0 : Number(raw);
                          if (Number.isFinite(v) && v >= 0 && v !== h.quantity) onUpdate(h.id, { quantity: v });
                        }}
                        className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        defaultValue={
                          h.cost_price != null && Number(h.cost_price) !== 0 ? String(h.cost_price) : ""
                        }
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const v = raw === "" ? 0 : Number(raw);
                          if (Number.isFinite(v) && v >= 0 && v !== Number(h.cost_price)) onUpdate(h.id, { cost_price: v });
                        }}
                        className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </td>
                  </>
                )}
                <td className="px-3 py-2.5 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    defaultValue={
                      h.current_price != null && Number(h.current_price) !== 0 ? String(h.current_price) : ""
                    }
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const v = raw === "" ? 0 : Number(raw);
                      if (Number.isFinite(v) && v >= 0 && v !== Number(h.current_price)) onUpdate(h.id, { current_price: v });
                    }}
                    className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </td>
                <td className="px-3 py-2.5 text-right text-slate-300">{formatMoney(metrics.marketValue)}</td>
                <td className={`px-3 py-2.5 text-right ${getProfitColorClass(metrics.profit)}`}>
                  {formatMoney(metrics.profit)}
                </td>
                <td className={`px-3 py-2.5 text-right ${getProfitColorClass(metrics.profitPercent)}`}>
                  {formatPercent(metrics.profitPercent)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {h.market !== "FUND" && (
                    <button
                      type="button"
                      onClick={() => onOpenKline(h.code, h.market, h.name)}
                      className="mr-2 text-sky-400 hover:text-sky-300"
                      title="K线"
                    >
                      K线
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenStrategy(h)}
                    className="mr-2 rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                    title="投资策略"
                  >
                    投资策略
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm(`确认删除该持仓吗？\n\n${h.name || h.code}（${h.market}）`);
                      if (ok) onDelete(h.id);
                    }}
                    className="rounded border border-red-500/60 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900/40"
                    title="删除"
                  >
                    删除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
