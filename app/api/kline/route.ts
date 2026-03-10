import { NextRequest, NextResponse } from "next/server";

function getSinaKLineSymbol(code: string, market: string): string | null {
  const c = String(code || "").trim();
  if (!c) return null;
  if (market === "A") {
    if (/^6/.test(c)) return "sh" + c;
    if (/^0|^3/.test(c)) return "sz" + c;
    return "sh" + c;
  }
  if (market === "HK") {
    const padded = c.replace(/^0+/, "").padStart(5, "0");
    return "hk" + padded;
  }
  if (market === "US") return "us" + c.toUpperCase();
  return "sh" + c;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const market = request.nextUrl.searchParams.get("market") ?? "A";
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  if (market === "US") {
    return NextResponse.json({ error: "暂不支持美股 K 线" }, { status: 400 });
  }

  const symbol = getSinaKLineSymbol(code, market);
  if (!symbol) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const sinaKlineUrl = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${encodeURIComponent(symbol)}&scale=240&ma=no&datalen=60`;

  try {
    const res = await fetch(sinaKlineUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    const trimmed = text.trim();
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new Error("Invalid JSON");
    }
    if (!Array.isArray(raw)) throw new Error("Not array");
    if (raw.length === 0) throw new Error("No data");

    const dates: string[] = [];
    const klineData: [number, number, number, number][] = [];
    const volumeData: number[] = [];

    for (const item of raw as Array<{ day?: string; date?: string; open?: number; close?: number; low?: number; high?: number; volume?: number }>) {
      const day = item.day || item.date || "";
      const open = parseFloat(String(item.open));
      const close = parseFloat(String(item.close));
      const low = parseFloat(String(item.low));
      const high = parseFloat(String(item.high));
      const vol = parseFloat(String(item.volume)) || 0;
      if (!Number.isFinite(open) || !Number.isFinite(close) || !Number.isFinite(low) || !Number.isFinite(high))
        continue;
      dates.push(day.length >= 10 ? day.slice(5, 10).replace("-", "/") : day);
      klineData.push([open, close, low, high]);
      volumeData.push(vol);
    }

    if (dates.length === 0) throw new Error("No valid data");

    return NextResponse.json({ dates, klineData, volumeData });
  } catch (e) {
    console.error("[kline]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "数据加载失败，请稍后重试" },
      { status: 500 }
    );
  }
}
