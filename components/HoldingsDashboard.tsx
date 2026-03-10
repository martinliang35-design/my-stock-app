"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Holding } from "@/lib/holdings";
import {
  fetchHoldings,
  insertHolding,
  updateHolding,
  deleteHolding,
  updateHoldingsOrder,
} from "@/lib/holdings";
import type { Rates } from "@/lib/metrics";
import { computeTotals } from "@/lib/metrics";
import { formatMoney, formatPercent, getProfitColorClass } from "@/lib/format";
import HoldingsTable from "@/components/HoldingsTable";
import ChartsSection from "@/components/ChartsSection";
import KlineModal from "@/components/KlineModal";

const RATES_STORAGE_KEY = "stock-dashboard-rates";
const DEFAULT_RATES: Rates = { usdToCny: 7.2, hkdToCny: 0.92 };

function loadRatesFromStorage(): Rates {
  if (typeof window === "undefined") return DEFAULT_RATES;
  try {
    const raw = localStorage.getItem(RATES_STORAGE_KEY);
    if (!raw) return DEFAULT_RATES;
    const parsed = JSON.parse(raw) as Partial<Rates>;
    return {
      usdToCny: Number(parsed?.usdToCny) || DEFAULT_RATES.usdToCny,
      hkdToCny: Number(parsed?.hkdToCny) || DEFAULT_RATES.hkdToCny,
    };
  } catch {
    return DEFAULT_RATES;
  }
}

function saveRatesToStorage(rates: Rates) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates));
  } catch {}
}

type KlineModalState = {
  open: boolean;
  code: string;
  market: "A" | "HK" | "US";
  name: string;
};

export default function HoldingsDashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [rates, setRates] = useState<Rates>(() => loadRatesFromStorage());
  const [loading, setLoading] = useState(true);
  const [showDetailColumns, setShowDetailColumns] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<number | null>(null);
  const [klineModal, setKlineModal] = useState<KlineModalState>({
    open: false,
    code: "",
    market: "A",
    name: "",
  });
  const holdingsRef = useRef<Holding[]>(holdings);
  holdingsRef.current = holdings;
  const importInputRef = useRef<HTMLInputElement>(null);

  const refetchHoldings = useCallback(async () => {
    try {
      const data = await fetchHoldings();
      setHoldings(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchHoldings();
  }, [refetchHoldings]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rates")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { usdToCny?: number; hkdToCny?: number } | null) => {
        if (cancelled || !json) return;
        const next = {
          usdToCny: Number(json.usdToCny) ?? rates.usdToCny,
          hkdToCny: Number(json.hkdToCny) ?? rates.hkdToCny,
        };
        setRates(next);
        saveRatesToStorage(next);
        setRatesUpdatedAt(Date.now());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    saveRatesToStorage(rates);
  }, [rates]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const interval = setInterval(() => {
      const list = holdingsRef.current;
      if (list.length === 0) return;
      list.forEach((h) => {
        if (!h.code) return;
        fetch(`/api/price?code=${encodeURIComponent(h.code)}&market=${h.market}`)
          .then((res) => res.json())
          .then((json: { price?: number }) => {
            if (json?.price != null && Number.isFinite(json.price))
              updateHolding(h.id, { current_price: json.price }).then(() => refetchHoldings());
          })
          .catch(() => {});
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled, refetchHoldings]);

  const handleRefreshPrices = useCallback(async () => {
    setRefreshLoading(true);
    const list = holdingsRef.current;
    for (const h of list) {
      if (!h.code) continue;
      try {
        const res = await fetch(`/api/price?code=${encodeURIComponent(h.code)}&market=${h.market}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404 && json?.hint) {
            alert(json.hint);
          }
          continue;
        }
        if (json?.price != null && Number.isFinite(json.price)) {
          await updateHolding(h.id, { current_price: json.price });
        }
      } catch {}
    }
    await refetchHoldings();
    setRefreshLoading(false);
  }, [refetchHoldings]);

  const handleAddRow = useCallback(async () => {
    await insertHolding({
      code: "",
      name: "",
      market: "A",
      quantity: 0,
      cost_price: 0,
      current_price: 0,
      sort_order: holdings.length,
    });
    await refetchHoldings();
  }, [holdings.length, refetchHoldings]);

  const handleUpdate = useCallback(
    async (id: string, updates: Partial<Omit<Holding, "id" | "created_at" | "updated_at">>) => {
      await updateHolding(id, updates);
      await refetchHoldings();
    },
    [refetchHoldings]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteHolding(id);
      await refetchHoldings();
    },
    [refetchHoldings]
  );

  const handleOrderChange = useCallback(
    async (ids: string[]) => {
      await updateHoldingsOrder(ids);
      await refetchHoldings();
    },
    [refetchHoldings]
  );

  const handleOpenKline = useCallback((code: string, market: "A" | "HK" | "US", name: string) => {
    setKlineModal({ open: true, code, market, name });
  }, []);

  const exportJson = useCallback(() => {
    const payload = { holdings, rates, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `holdings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  }, [holdings, rates]);

  const exportCsv = useCallback(() => {
    const headers = ["code", "name", "market", "quantity", "cost_price", "current_price"];
    const rows = holdings.map((h) =>
      [h.code, h.name, h.market, h.quantity, h.cost_price, h.current_price].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `holdings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  }, [holdings]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const text = String(reader.result ?? "");
        let toInsert: Partial<Holding>[] = [];
        let ratesFromFile: Rates | null = null;
        const ext = (file.name || "").toLowerCase();
        if (ext.endsWith(".json")) {
          try {
            const json = JSON.parse(text) as { holdings?: Holding[]; rates?: Rates };
            if (json.rates) ratesFromFile = json.rates;
            toInsert = (json.holdings ?? []).map((h) => ({
              code: h.code ?? "",
              name: h.name ?? "",
              market: h.market ?? "A",
              quantity: Number(h.quantity) || 0,
              cost_price: Number(h.cost_price) || 0,
              current_price: Number(h.current_price) || 0,
              sort_order: Number(h.sort_order) ?? 0,
            }));
          } catch {
            alert("JSON 解析失败");
            return;
          }
        } else if (ext.endsWith(".csv")) {
          const lines = text.split(/\r?\n/).filter(Boolean);
          if (lines.length < 2) {
            alert("CSV 至少需要表头与一行数据");
            return;
          }
          const colNames = lines[0].split(",").map((c) => c.trim().toLowerCase());
          const codeIdx = colNames.indexOf("code");
          const nameIdx = colNames.indexOf("name");
          const marketIdx = colNames.indexOf("market");
          const qtyIdx = colNames.indexOf("quantity");
          const costIdx = colNames.indexOf("cost_price") >= 0 ? colNames.indexOf("cost_price") : colNames.indexOf("costprice");
          const currIdx = colNames.indexOf("current_price") >= 0 ? colNames.indexOf("current_price") : colNames.indexOf("currentprice");
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(",").map((p) => p.trim());
            const get = (idx: number) => (idx >= 0 && idx < parts.length ? parts[idx] : "");
            const code = get(codeIdx);
            const name = get(nameIdx);
            const market = (get(marketIdx) || "A") as "A" | "HK" | "US";
            const quantity = Number(get(qtyIdx)) || 0;
            const cost_price = Number(get(costIdx)) || 0;
            const current_price = Number(get(currIdx)) || 0;
            toInsert.push({ code, name, market: market === "HK" || market === "US" ? market : "A", quantity, cost_price, current_price, sort_order: i - 1 });
          }
        } else {
          alert("仅支持 .json 或 .csv 文件");
          return;
        }
        try {
          const existing = await fetchHoldings();
          for (const h of existing) await deleteHolding(h.id);
          for (let i = 0; i < toInsert.length; i++) {
            await insertHolding({ ...toInsert[i], sort_order: i });
          }
          if (ratesFromFile) {
            setRates(ratesFromFile);
            saveRatesToStorage(ratesFromFile);
          }
          await refetchHoldings();
        } catch (err) {
          console.error(err);
          alert("导入失败");
        }
        e.target.value = "";
      };
      reader.readAsText(file);
    },
    [refetchHoldings]
  );

  const totals = computeTotals(holdings, rates);
  const totalPnLColorClass = getProfitColorClass(totals.totalProfit);
  const totalPnLBorderClass =
    totals.totalProfit > 0.000001
      ? "border-red-500/40"
      : totals.totalProfit < -0.000001
        ? "border-emerald-500/40"
        : "border-slate-600";

  return (
    <div className="min-h-screen bg-[#020617] text-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-5">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start justify-between gap-4 w-full sm:w-auto">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-sky-400 md:text-3xl">
                多市场个人股票持仓看板
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                数据存储在 Supabase；所有市值统一折算为 CNY。
              </p>
            </div>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="shrink-0 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              登出
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 transition-opacity duration-300 sm:gap-4">
            <div className="rounded-xl border border-sky-500/40 bg-slate-900/90 px-4 py-3 shadow-lg shadow-sky-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300/90">总资产 (CNY)</p>
              <p className="mt-1 tabular-nums text-2xl font-bold text-slate-100 md:text-3xl">
                {formatMoney(totals.totalMv)}
              </p>
            </div>
            <div
              className={`rounded-xl border bg-slate-900/90 px-4 py-3 shadow-lg ${totalPnLBorderClass}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300/90">总盈亏 (按成本 VS 当前)</p>
              <p className={`mt-1 tabular-nums text-2xl font-bold md:text-3xl ${totalPnLColorClass}`}>
                {formatMoney(totals.totalProfit)}
              </p>
              <p className={`mt-0.5 tabular-nums text-sm ${totalPnLColorClass}`}>
                {formatPercent(totals.totalProfitPercent)}
              </p>
            </div>
          </div>
        </header>

        <section className="mb-4 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-4 shadow-lg">
          <h2 className="text-base font-semibold text-slate-300">汇率配置</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            默认 USD/CNY = 7.20, HKD/CNY = 0.92, 修改后将自动重算所有市值与盈亏。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              USD / CNY
              <input
                type="number"
                step={0.0001}
                value={rates.usdToCny}
                onChange={(e) => setRates((r) => ({ ...r, usdToCny: Number(e.target.value) || 0 }))}
                className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              HKD / CNY
              <input
                type="number"
                step={0.0001}
                value={rates.hkdToCny}
                onChange={(e) => setRates((r) => ({ ...r, hkdToCny: Number(e.target.value) || 0 }))}
                className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            汇率更新于：{ratesUpdatedAt != null ? new Date(ratesUpdatedAt).toLocaleTimeString("zh-CN") : "--"}
          </p>
        </section>

        <main className="space-y-4">
          <section className="w-full">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDetailColumns((v) => !v)}
                className="rounded border border-slate-600 px-2 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
              >
                {showDetailColumns ? "列: 详情" : "列: 简洁"}
              </button>
              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1.5">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded text-slate-500`}
                  title={autoRefreshEnabled ? "自动更新已开启，每 5 分钟同步一次最新股价。" : "自动刷新已关闭"}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </span>
                <button
                  type="button"
                  onClick={() => setAutoRefreshEnabled((v) => !v)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-700/80 hover:text-sky-400"
                  title="开启/关闭自动刷新"
                >
                  {autoRefreshEnabled ? (
                    <span className="text-sky-400">开</span>
                  ) : (
                    <span className="text-slate-500">关</span>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={handleRefreshPrices}
                disabled={refreshLoading}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-amber-500 disabled:opacity-50"
              >
                {refreshLoading ? "刷新中…" : "刷新股价"}
              </button>
              <button
                type="button"
                onClick={handleAddRow}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                添加行
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportMenuOpen((v) => !v);
                  }}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:border-sky-500"
                >
                  导出 ▼
                </button>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} aria-hidden />
                    <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded border border-slate-700 bg-slate-900 py-1 shadow-xl">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); exportJson(); }}
                        className="block w-full px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
                      >
                        导出 JSON
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); exportCsv(); }}
                        className="block w-full border-t border-slate-700 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
                      >
                        导出 CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={handleImport}
              />
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 hover:border-slate-500"
              >
                导入
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12 text-slate-400">加载中…</div>
            ) : (
              <>
                <HoldingsTable
                  holdings={holdings}
                  rates={rates}
                  showDetailColumns={showDetailColumns}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onOrderChange={handleOrderChange}
                  onOpenKline={handleOpenKline}
                />
                <p className="mt-2 text-xs text-slate-500">涨红跌绿 · 数据存储在 Supabase</p>
              </>
            )}
          </section>

          <ChartsSection holdings={holdings} rates={rates} />
        </main>
      </div>

      <KlineModal
        open={klineModal.open}
        code={klineModal.code}
        market={klineModal.market}
        name={klineModal.name}
        onClose={() => setKlineModal((k) => ({ ...k, open: false }))}
      />
    </div>
  );
}
