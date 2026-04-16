import { NextRequest, NextResponse } from "next/server";

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init ?? {}), signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

const SINA_REFERER = "https://finance.sina.com.cn/";

async function getSinaStockName(symbol: string): Promise<string | null> {
  const url = `https://hq.sinajs.cn/list=${symbol}`;
  const res = await fetchWithTimeout(
    url,
    { cache: "no-store", headers: { Referer: SINA_REFERER } },
    6000
  );
  if (!res.ok) return null;
  const text = await res.text();
  const m = text.match(/="([^"]*)"/);
  if (!m || !m[1]) return null;
  const parts = m[1].split(",");
  if (parts.length < 1) return null;
  let name = parts[0] || null;
  if (name) {
    name = name.trim();
    if (!/[\u4e00-\u9fa5a-zA-Z]/.test(name)) {
      return null;
    }
  }
  return name;
}

async function getEastMoneyStockName(code: string, market: string): Promise<string | null> {
  const secid = market === "A" 
    ? (/^6/.test(code) || /^5/.test(code) ? "1." : "0.") + String(code).replace(/^(sh|sz)/i, "").padStart(6, "0").slice(-6)
    : market === "HK" 
      ? "116." + String(code).replace(/^hk/i, "").replace(/\D/g, "").padStart(5, "0").slice(-5)
      : null;
  
  if (!secid) return null;
  
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=f57,f58`;
  const res = await fetchWithTimeout(url, { cache: "no-store" }, 6000);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const name = data?.data?.f58;
  return name || null;
}

async function getFundName(code: string): Promise<string | null> {
  const url = `https://push2.eastmoney.com/api/qt/fund/nav/get?v=1.0&format=json&fundCode=${code}`;
  const res = await fetchWithTimeout(url, { cache: "no-store" }, 6000);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const name = data?.data?.fundName;
  return name || null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim() || "";
    const market = (searchParams.get("market") || "A") as "A" | "HK" | "US" | "FUND";

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    let name: string | null = null;

    if (market === "FUND") {
      name = await getFundName(code);
    } else if (market === "A") {
      const prefix = /^6/.test(code) || /^5/.test(code) ? "sh" : "sz";
      const symbol = prefix + code.replace(/^(sh|sz)/i, "");
      name = await getSinaStockName(symbol);
      if (!name) {
        name = await getEastMoneyStockName(code, "A");
      }
    } else if (market === "HK") {
      const raw = code.replace(/^hk/i, "").replace(/\D/g, "") || "0";
      const symbol = "hk" + (raw.length >= 5 ? raw : raw.padStart(5, "0"));
      name = await getSinaStockName(symbol);
      if (!name) {
        name = await getEastMoneyStockName(code, "HK");
      }
    } else if (market === "US") {
      const symbol = code.replace(/\s/g, "").toUpperCase();
      name = await getSinaStockName("gb_" + symbol.toLowerCase());
    }

    if (name) {
      return NextResponse.json({ name });
    }

    return NextResponse.json({ error: "Name not found" }, { status: 404 });
  } catch (e) {
    console.error("[stock-name]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch name" },
      { status: 500 }
    );
  }
}
