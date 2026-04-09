"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import StrategyModal from "@/components/StrategyModal";
import SettingsModal from "@/components/SettingsModal";

const RATES_STORAGE_KEY = "stock-dashboard-rates";
const TOTAL_INVESTABLE_STORAGE_KEY = "stock-dashboard-total-investable-cny";
const AVAILABLE_CASH_STORAGE_KEY = "stock-dashboard-available-cash-cny";
const INVESTMENT_STRATEGY_STORAGE_KEY = "stock-dashboard-investment-strategy";
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

function loadTotalInvestableFromStorage(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(TOTAL_INVESTABLE_STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(JSON.parse(raw));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function saveTotalInvestableToStorage(value: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOTAL_INVESTABLE_STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

function loadAvailableCashFromStorage(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(AVAILABLE_CASH_STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(JSON.parse(raw));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function saveAvailableCashToStorage(value: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AVAILABLE_CASH_STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

function loadInvestmentStrategyFromStorage(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(INVESTMENT_STRATEGY_STORAGE_KEY);
    return raw ?? "";
  } catch {
    return "";
  }
}

function saveInvestmentStrategyToStorage(value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INVESTMENT_STRATEGY_STORAGE_KEY, value ?? "");
  } catch {}
}

/** 导出文件名用：2025-03-04-153045（本地时间，易辨认） */
function exportFileDateStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 将输入框字符串解析为用于计算的金额（空或未写完视为 0） */
function investableInputToNumber(s: string): number {
  const t = s.trim();
  if (t === "" || t === "." || t === "-") return 0;
  const n = parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** 可用现金可输入负数（缺口）；空视为 0 */
function cashInputToNumber(s: string): number {
  const t = s.trim();
  if (t === "" || t === "." || t === "-" || t === "-.") return 0;
  const n = parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** CSV 导出：包含逗号/双引号/换行时进行引号转义 */
function csvEscapeValue(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV 导入：解析一行 CSV，支持引号字段内的逗号 */
function parseCsvLine(line: string): string[] {
  const res: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      res.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  res.push(cur);
  return res;
}

function sleepMs(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; json: T | null }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const json = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  } finally {
    clearTimeout(t);
  }
}

async function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  const pool = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).finally(() => pool.delete(p));
    pool.add(p);
    if (pool.size >= concurrency) await Promise.race(pool);
  }
  await Promise.allSettled(Array.from(pool));
}

/**
 * 将导入文件里的 market 值归一化为我们的内部约定：
 * - A/HK/US（代码）
 * - A股/港股/美股（中文）
 * - A/H/美（图表/标签里用的缩写）
 */
function normalizeMarket(market: unknown): "A" | "HK" | "US" {
  const raw = String(market ?? "").trim();
  if (!raw) return "A";
  const s = raw.replace(/\s+/g, "");
  const up = s.toUpperCase();

  if (s === "A" || s === "A股" || up === "A") return "A";
  if (s === "H" || s === "HK" || s === "港股" || s.includes("港") || up === "HK") return "HK";
  if (s === "美" || s === "US" || s === "美股" || s.includes("美") || up === "US") return "US";

  // 兜底：如果是更模糊的输入，尽量做宽松判断
  if (up.includes("港") || s.includes("港")) return "HK";
  if (up.includes("美") || s.includes("美")) return "US";
  return "A";
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
  const [totalInvestableInput, setTotalInvestableInput] = useState<string>(() => {
    const n = loadTotalInvestableFromStorage();
    return n === 0 ? "" : String(n);
  });
  const totalInvestableCny = useMemo(
    () => investableInputToNumber(totalInvestableInput),
    [totalInvestableInput]
  );
  const [availableCashInput, setAvailableCashInput] = useState<string>(() => {
    const n = loadAvailableCashFromStorage();
    return n === 0 ? "" : String(n);
  });

  const [investmentStrategyText, setInvestmentStrategyText] = useState<string>(() =>
    loadInvestmentStrategyFromStorage()
  );

  const availableCashCny = useMemo(
    () => cashInputToNumber(availableCashInput),
    [availableCashInput]
  );
  const [loading, setLoading] = useState(true);
  const [showDetailColumns, setShowDetailColumns] = useState(true);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshDebug, setRefreshDebug] = useState<{
    runId: number;
    startedAt: number;
    total: number;
    done: number;
    phase: "idle" | "fetch_price" | "write_db" | "refetch" | "done" | "timeout";
    current?: string;
    lastError?: string;
  } | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<number | null>(null);
  const [klineModal, setKlineModal] = useState<KlineModalState>({
    open: false,
    code: "",
    market: "A",
    name: "",
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyTargetId, setStrategyTargetId] = useState<string>("");
  const [strategyModalTitle, setStrategyModalTitle] = useState<string>("");
  const [strategyModalText, setStrategyModalText] = useState<string>("");
  const [savingGlobalStrategy, setSavingGlobalStrategy] = useState(false);
  const [globalStrategyMsg, setGlobalStrategyMsg] = useState<string>("");
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
        setRates((prev) => {
          const next = {
            usdToCny: Number(json.usdToCny) ?? prev.usdToCny,
            hkdToCny: Number(json.hkdToCny) ?? prev.hkdToCny,
          };
          saveRatesToStorage(next);
          setRatesUpdatedAt(Date.now());
          return next;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    saveRatesToStorage(rates);
  }, [rates]);

  useEffect(() => {
    saveTotalInvestableToStorage(totalInvestableCny);
  }, [totalInvestableCny]);

  useEffect(() => {
    saveAvailableCashToStorage(availableCashCny);
  }, [availableCashCny]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const localText = loadInvestmentStrategyFromStorage();
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("investment_strategy")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) return;
        const cloudText = String(data?.investment_strategy ?? "");
        if (cloudText.trim() !== "") {
          // 云端有值时，以云端为准并同步本地
          setInvestmentStrategyText(cloudText);
          saveInvestmentStrategyToStorage(cloudText);
          return;
        }
        // 云端为空：保留本地文本，避免覆盖导致“刷新后被清空”
        if (localText.trim() !== "") {
          setInvestmentStrategyText(localText);
          const { error: upsertErr } = await supabase.from("profiles").upsert(
            {
              user_id: userData.user.id,
              investment_strategy: localText,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
          if (!upsertErr) setGlobalStrategyMsg("已从本地恢复并同步到云端");
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveGlobalInvestmentStrategy = useCallback(async () => {
    const text = investmentStrategyText ?? "";
    saveInvestmentStrategyToStorage(text);
    setSavingGlobalStrategy(true);
    setGlobalStrategyMsg("");
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) throw new Error("未登录，无法保存到云端");
      const payload = {
        user_id: user.id,
        investment_strategy: text,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      setGlobalStrategyMsg("已保存到云端");
    } catch (e) {
      setGlobalStrategyMsg(e instanceof Error ? `云端保存失败：${e.message}` : "云端保存失败");
    } finally {
      setSavingGlobalStrategy(false);
    }
  }, [investmentStrategyText]);

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
    const runId = Date.now();
    setRefreshDebug({
      runId,
      startedAt: Date.now(),
      total: 0,
      done: 0,
      phase: "fetch_price",
      current: "",
    });
    // 极端兜底：避免由于某些浏览器/网络导致 Promise 永不返回而一直“刷新中”
    let watchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      setRefreshLoading(false);
      setRefreshDebug((d) => (d && d.runId === runId ? { ...d, phase: "timeout" } : d));
      watchdog = null;
    }, 25000);
    try {
      const list = holdingsRef.current;
      const priceTimeoutMs = 8000;
      const writeTimeoutMs = 8000;
      const finalRefetchTimeoutMs = 10000;
      const concurrency = 4;
      const targets = list.filter((h) => Boolean(h.code));
      setRefreshDebug((d) =>
        d && d.runId === runId ? { ...d, total: targets.length, done: 0, phase: "fetch_price" } : d
      );

      let shownHint = false;
      await runWithConcurrency(targets, concurrency, async (h) => {
        const label = `${h.code}(${h.market})`;
        setRefreshDebug((d) => (d && d.runId === runId ? { ...d, phase: "fetch_price", current: label } : d));
        const url = `/api/price?code=${encodeURIComponent(h.code)}&market=${h.market}`;
        const { ok, status, json } = await fetchJsonWithTimeout<{ price?: number; hint?: string }>(
          url,
          priceTimeoutMs
        );
        if (!ok) return;
        if (status === 404 && json?.hint && !shownHint) {
          shownHint = true;
          alert(json.hint);
          return;
        }
        const p = json?.price;
        if (p != null && Number.isFinite(p)) {
          try {
            setRefreshDebug((d) => (d && d.runId === runId ? { ...d, phase: "write_db", current: label } : d));
            await withTimeout(updateHolding(h.id, { current_price: p }), writeTimeoutMs);
            await sleepMs(10);
          } catch {}
        }
        setRefreshDebug((d) =>
          d && d.runId === runId ? { ...d, done: Math.min(d.done + 1, d.total) } : d
        );
      });

      try {
        setRefreshDebug((d) => (d && d.runId === runId ? { ...d, phase: "refetch", current: "" } : d));
        await withTimeout(refetchHoldings(), finalRefetchTimeoutMs);
      } catch {
        // 兜底：即使最终刷新列表超时，也不要让按钮一直处于 loading
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
      setRefreshLoading(false);
      setRefreshDebug((d) => (d && d.runId === runId ? { ...d, phase: "done", current: "" } : d));
    }
  }, [refetchHoldings]);

  const handleAddRow = useCallback(async () => {
    await insertHolding({
      code: "",
      name: "",
      market: "A",
      quantity: 0,
      cost_price: 0,
      current_price: 0,
      strategy: "",
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

  const handleOpenStrategy = useCallback(
    (h: Holding) => {
      const suffix = h.market === "HK" ? "H" : h.market === "US" ? "美" : "A";
      setStrategyTargetId(h.id);
      setStrategyModalTitle(`投资策略：${h.name || h.code || "—"}(${suffix})`);
      setStrategyModalText(h.strategy ?? "");
      setStrategyModalOpen(true);
    },
    []
  );

  const handleSaveStrategy = useCallback(
    async (text: string) => {
      if (!strategyTargetId) return;
      await updateHolding(strategyTargetId, { strategy: text });
      await refetchHoldings();
    },
    [refetchHoldings, strategyTargetId]
  );

  const exportJson = useCallback(() => {
    const payload = {
      holdings,
      rates,
      totalInvestableCny,
      availableCashCny,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `holdings-${exportFileDateStamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  }, [holdings, rates, totalInvestableCny, availableCashCny]);

  const exportCsv = useCallback(() => {
    const headers = ["code", "name", "market", "quantity", "cost_price", "current_price", "strategy"];
    const rows = holdings.map((h) =>
      [
        h.code,
        h.name,
        h.market,
        h.quantity,
        h.cost_price,
        h.current_price,
        h.strategy ?? "",
      ]
        .map(csvEscapeValue)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `holdings-${exportFileDateStamp()}.csv`;
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
            const json = JSON.parse(text) as {
              holdings?: Holding[];
              rates?: Rates;
              totalInvestableCny?: number;
              availableCashCny?: number;
            };
            if (json.rates) ratesFromFile = json.rates;
            if (json.totalInvestableCny != null && Number.isFinite(Number(json.totalInvestableCny))) {
              const v = Math.max(0, Number(json.totalInvestableCny));
              setTotalInvestableInput(v === 0 ? "" : String(v));
              saveTotalInvestableToStorage(v);
            }
            if (json.availableCashCny != null && Number.isFinite(Number(json.availableCashCny))) {
              const c = Number(json.availableCashCny);
              setAvailableCashInput(c === 0 ? "" : String(c));
              saveAvailableCashToStorage(c);
            }
            toInsert = (json.holdings ?? []).map((h) => ({
              code: h.code ?? "",
              name: h.name ?? "",
              market: normalizeMarket(h.market),
              quantity: Number(h.quantity) || 0,
              cost_price: Number(h.cost_price) || 0,
              current_price: Number(h.current_price) || 0,
              strategy: h.strategy ?? "",
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
          const colNames = parseCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
          const codeIdx = colNames.indexOf("code");
          const nameIdx = colNames.indexOf("name");
          const marketIdx = colNames.indexOf("market");
          const qtyIdx = colNames.indexOf("quantity");
          const costIdx = colNames.indexOf("cost_price") >= 0 ? colNames.indexOf("cost_price") : colNames.indexOf("costprice");
          const currIdx = colNames.indexOf("current_price") >= 0 ? colNames.indexOf("current_price") : colNames.indexOf("currentprice");
          const strategyIdx = colNames.indexOf("strategy");
          for (let i = 1; i < lines.length; i++) {
            const parts = parseCsvLine(lines[i]).map((p) => p.trim());
            const get = (idx: number) => (idx >= 0 && idx < parts.length ? parts[idx] : "");
            const code = get(codeIdx);
            const name = get(nameIdx);
            const market = normalizeMarket(get(marketIdx));
            const quantity = Number(get(qtyIdx)) || 0;
            const cost_price = Number(get(costIdx)) || 0;
            const current_price = Number(get(currIdx)) || 0;
            const strategy = strategyIdx >= 0 ? get(strategyIdx) : "";
            toInsert.push({
              code,
              name,
              market,
              quantity,
              cost_price,
              current_price,
              strategy,
              sort_order: i - 1,
            });
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
  const derivedAvailableCashCny = totalInvestableCny - totals.totalMv;
  const stockPositionPct = totalInvestableCny > 0.000001 ? (totals.totalMv / totalInvestableCny) * 100 : 0;
  const stockPositionPctText = `${stockPositionPct.toFixed(1)}%`;
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="shrink-0 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                设置
              </button>
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="shrink-0 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                登出
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 transition-opacity duration-300 sm:gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-sky-500/40 bg-slate-900/90 px-4 py-3 shadow-lg shadow-sky-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300/90">
                总资产 (可投资 · CNY)
              </p>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={totalInvestableInput}
                onChange={(e) => setTotalInvestableInput(e.target.value)}
                onBlur={() => {
                  const n = investableInputToNumber(totalInvestableInput);
                  setTotalInvestableInput(n === 0 ? "" : String(n));
                }}
                className="mt-1 w-full min-w-0 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 tabular-nums text-xl font-bold text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 md:text-2xl"
                placeholder="请输入金额"
              />
            </div>
            <div className="rounded-xl border border-sky-500/40 bg-slate-900/90 px-4 py-3 shadow-lg shadow-sky-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300/90">总持仓 (CNY)</p>
              <p className="mt-1 tabular-nums text-2xl font-bold text-slate-100 md:text-3xl">
                {formatMoney(totals.totalMv)}
              </p>
            </div>
            <div className="rounded-xl border border-sky-500/40 bg-slate-900/90 px-4 py-3 shadow-lg shadow-sky-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300/90">股票仓位</p>
              <p className="mt-1 tabular-nums text-2xl font-bold text-slate-100 md:text-3xl">
                {stockPositionPctText}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {totalInvestableCny > 0.000001
                  ? "= 总持仓 ÷ 总资产（可投资）"
                  : "请先填写顶部「总资产（可投资）」"}
              </p>
            </div>
            <div
              className={`rounded-xl border bg-slate-900/90 px-4 py-3 shadow-lg ${totalPnLBorderClass}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300/90">持仓盈亏 (按成本 VS 当前)</p>
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
          <h2 className="text-base font-semibold text-slate-300">投资策略</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            这里记录你的整体投资策略/复盘备注。
          </p>
          <textarea
            value={investmentStrategyText}
            onChange={(e) => setInvestmentStrategyText(e.target.value)}
            onBlur={() => {
              void saveGlobalInvestmentStrategy();
            }}
            rows={5}
            placeholder="例如：长期看好行业……；仓位控制规则……"
            className="mt-3 w-full resize-none rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{globalStrategyMsg || "失焦后自动保存（云端+本地兜底）"}</span>
            <button
              type="button"
              onClick={() => {
                void saveGlobalInvestmentStrategy();
              }}
              disabled={savingGlobalStrategy}
              className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
            >
              {savingGlobalStrategy ? "保存中…" : "保存"}
            </button>
          </div>
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
              {refreshDebug && refreshLoading && (
                <div className="ml-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="tabular-nums">
                    {Math.max(0, Math.round((Date.now() - refreshDebug.startedAt) / 100) / 10).toFixed(1)}s
                  </span>
                  <span className="tabular-nums">
                    {refreshDebug.done}/{refreshDebug.total}
                  </span>
                  <span className="truncate">
                    {refreshDebug.phase === "fetch_price"
                      ? "拉取价格"
                      : refreshDebug.phase === "write_db"
                        ? "写入"
                        : refreshDebug.phase === "refetch"
                          ? "刷新列表"
                          : refreshDebug.phase}
                    {refreshDebug.current ? `：${refreshDebug.current}` : ""}
                  </span>
                </div>
              )}
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
                  onOpenStrategy={handleOpenStrategy}
                />
                <p className="mt-2 text-xs text-slate-500">涨红跌绿 · 数据存储在 Supabase</p>
              </>
            )}
          </section>

          <ChartsSection
            holdings={holdings}
            rates={rates}
            totalInvestableCny={totalInvestableCny}
            availableCashCny={derivedAvailableCashCny}
          />
        </main>
      </div>

      <KlineModal
        open={klineModal.open}
        code={klineModal.code}
        market={klineModal.market}
        name={klineModal.name}
        onClose={() => setKlineModal((k) => ({ ...k, open: false }))}
      />

      <StrategyModal
        open={strategyModalOpen}
        title={strategyModalTitle}
        initialText={strategyModalText}
        onClose={() => setStrategyModalOpen(false)}
        onSave={handleSaveStrategy}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        rates={rates}
        setRates={setRates}
        ratesUpdatedAt={ratesUpdatedAt}
        setRatesUpdatedAt={(ts) => setRatesUpdatedAt(ts)}
      />
    </div>
  );
}
