export function formatMoney(num: number | null | undefined): string {
  if (num == null || !Number.isFinite(num)) return "—";
  return num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPercent(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const sign = p >= 0 ? "+" : "";
  return sign + p.toFixed(2) + "%";
}

/** 亏绿盈红：盈亏为正显示红色，为负显示绿色 */
export function getProfitColorClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-slate-400";
  if (v > 0) return "text-red-400";
  if (v < 0) return "text-emerald-400";
  return "text-slate-400";
}
