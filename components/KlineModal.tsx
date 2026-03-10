"use client";

import { useEffect, useRef, useState } from "react";

export type KlineModalProps = {
  open: boolean;
  code: string;
  market: string;
  name: string;
  onClose: () => void;
};

type KlineData = {
  dates: string[];
  klineData: [number, number, number, number][];
  volumeData: number[];
};

export default function KlineModal({
  open,
  code,
  market,
  name,
  onClose,
}: KlineModalProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<{ dispose: () => void } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KlineData | null>(null);

  useEffect(() => {
    if (!open || !code) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ code, market: market || "A" });
    fetch(`/api/kline?${params}`)
      .then((res) => {
        if (!res.ok) return res.json().then((j) => Promise.reject(new Error(j?.error ?? res.statusText)));
        return res.json();
      })
      .then((json: KlineData) => {
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载失败");
        setLoading(false);
      });
  }, [open, code, market]);

  useEffect(() => {
    if (!open) {
      if (instanceRef.current) {
        instanceRef.current.dispose();
        instanceRef.current = null;
      }
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !data || !chartRef.current) return;
    import("echarts").then((echarts) => {
      if (instanceRef.current) {
        instanceRef.current.dispose();
        instanceRef.current = null;
      }
      const chart = echarts.init(chartRef.current!, "dark");
      const dates = data.dates;
      const kline = data.klineData;
      const volume = data.volumeData;
      const seriesData = dates.map((d, i) => [d, kline[i][0], kline[i][1], kline[i][2], kline[i][3], volume[i]]);
      chart.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "axis" },
        grid: [
          { left: "10%", right: "8%", top: "12%", height: "55%" },
          { left: "10%", right: "8%", top: "75%", height: "15%" },
        ],
        xAxis: [
          { type: "category", data: dates, gridIndex: 0, axisLine: { lineStyle: { color: "#475569" } } },
          { type: "category", data: dates, gridIndex: 1, axisLine: { lineStyle: { color: "#475569" } } },
        ],
        yAxis: [
          { type: "value", scale: true, gridIndex: 0, splitLine: { lineStyle: { color: "#334155" } } },
          { type: "value", gridIndex: 1, splitLine: { lineStyle: { color: "#334155" } } },
        ],
        series: [
          {
            type: "candlestick",
            data: seriesData.map((s) => [s[1], s[2], s[3], s[4]]),
            xAxisIndex: 0,
            yAxisIndex: 0,
            itemStyle: { color: "#ef4444", color0: "#22c55e", borderColor: "#ef4444", borderColor0: "#22c55e" },
          },
          {
            type: "bar",
            data: seriesData.map((s, i) => ({
              value: s[5],
              itemStyle: { color: (kline[i][1] >= kline[i][0] ? "#ef4444" : "#22c55e") as string },
            })),
            xAxisIndex: 1,
            yAxisIndex: 1,
          },
        ],
      });
      instanceRef.current = chart;
    });
    return () => {
      if (instanceRef.current) {
        instanceRef.current.dispose();
        instanceRef.current = null;
      }
    };
  }, [open, data]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-4xl rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-lg font-medium text-slate-200">
            K线 {name || code} ({market})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          {loading && (
            <div className="flex h-80 items-center justify-center text-slate-400">
              加载中…
            </div>
          )}
          {error && (
            <div className="flex h-80 items-center justify-center text-red-400">
              {error}
            </div>
          )}
          {!loading && !error && data && (
            <div ref={chartRef} className="h-80 w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
