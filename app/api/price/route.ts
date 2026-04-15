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

function getEastMoneySecid(code: string, market: string): string | null {
  const c = String(code || "").trim().replace(/^(sh|sz|hk)/i, "");
  if (market === "A") {
    const isShanghai = /^6/.test(c) || /^5/.test(c);
    const code6 = c.padStart(6, "0").slice(-6);
    return (isShanghai ? "1." : "0.") + code6;
  }
  if (market === "HK") {
    const raw = c.replace(/\D/g, "") || "0";
    const five = raw.length >= 5 ? raw.slice(0, 5) : raw.padStart(5, "0");
    return "116." + five;
  }
  return null;
}

function pickEastMoneyPriceByLastClose(
  rawF43: number,
  secid: string,
  lastClose: number | null,
  originalCode?: string,
  market?: "A" | "HK" | "US"
): number | null {
  if (!Number.isFinite(rawF43)) return null;
  // 港股（116.*）在实践中稳定按 /1000
  if (String(secid || "").startsWith("116.")) return rawF43 / 1000;

  const p1000 = rawF43 / 1000;
  const p100 = rawF43 / 100;

  // 没有昨收时：A 股按代码类型判别缩放，避免普通股票被误缩小 10 倍
  if (lastClose == null || !Number.isFinite(lastClose) || lastClose <= 0) {
    if (market === "A") {
      const digits = String(originalCode ?? "")
        .replace(/\D/g, "")
        .padStart(6, "0")
        .slice(-6);
      // 常见普通股票代码段：主板/中小板/创业板/科创板
      const isLikelyCommonStock = /^(000|001|002|003|300|301|600|601|603|605|688|689)/.test(digits);
      if (isLikelyCommonStock) return p100;
      // ETF/场内基金常见代码段优先按 /1000
      const isLikelyEtfOrFund = /^(15|16|50|51|52|56|58)/.test(digits);
      if (isLikelyEtfOrFund) return p1000;
      // 未命中时对 A 股更保守地按 /100，避免把个股缩小 10 倍
      return p100;
    }
    return p1000;
  }

  const relDiff = (p: number) => Math.abs(p - lastClose) / lastClose;
  const d1000 = relDiff(p1000);
  const d100 = relDiff(p100);

  // 优先选择更接近昨收的那个；若差异过大（例如 >50%），仍选择更小偏差者
  return d1000 <= d100 ? p1000 : p100;
}

async function getEastMoneyF43Raw(secid: string): Promise<number | null> {
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=f43&invt=2`;
  const res = await fetchWithTimeout(url, { cache: "no-store" }, 6000);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const v = data?.data?.f43;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function getEastMoneyLastClose(secid: string): Promise<number | null> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&klt=101&fqt=1&lmt=1&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56`;
  const res = await fetchWithTimeout(url, { cache: "no-store" }, 8000);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const klines = data?.data?.klines;
  if (!Array.isArray(klines) || klines.length === 0) return null;
  const last = klines[klines.length - 1];
  const parts = last.split(",");
  const close = parseFloat(parts[2]);
  return Number.isFinite(close) ? close : null;
}

const SINA_REFERER = "https://finance.sina.com.cn/";

async function getSinaPrice(symbol: string): Promise<number | null> {
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
  if (parts.length < 4) return null;
  const price = parseFloat(parts[3]);
  return Number.isFinite(price) ? price : null;
}

async function getSinaUSPrice(symbol: string): Promise<number | null> {
  const code = symbol.replace(/\s/g, "").toLowerCase();
  if (!code) return null;
  const url = `https://hq.sinajs.cn/list=gb_${code}`;
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
  if (parts.length < 2) return null;
  const price = parseFloat(parts[1]);
  return Number.isFinite(price) ? price : null;
}

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
} as const;

async function getYahooPrice(symbol: string): Promise<number | null> {
  const chartUrl1d = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const tryUrl = async (url: string, parse: (data: unknown) => number | null): Promise<number | null> => {
    const res = await fetchWithTimeout(url, { cache: "no-store", headers: YAHOO_HEADERS }, 7000);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return parse(data);
  };
  type ChartData = {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; indicators?: { quote?: Array<{ close?: number[] }> } }> };
  };
  type QuoteData = {
    quoteResponse?: { result?: Array<{ regularMarketPrice?: number; regularMarketPreviousClose?: number }> };
  };
  const parseChart = (data: unknown): number | null => {
    const result = (data as ChartData)?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice ?? result?.indicators?.quote?.[0]?.close?.slice(-1)?.[0];
    return price != null && Number.isFinite(price) ? price : null;
  };
  const parseQuote = (data: unknown): number | null => {
    const q = (data as QuoteData)?.quoteResponse?.result?.[0];
    const p = q?.regularMarketPrice ?? q?.regularMarketPreviousClose;
    return p != null && Number.isFinite(p) ? p : null;
  };
  let p = await tryUrl(chartUrl1d, parseChart);
  if (p != null) return p;
  p = await tryUrl(quoteUrl, parseQuote);
  if (p != null) return p;
  const chartUrl5d = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  p = await tryUrl(chartUrl5d, parseChart);
  if (p != null) return p;
  const quoteUrl2 = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  return tryUrl(quoteUrl2, parseQuote);
}

async function getFundPriceFromEastMoneyApi(code: string): Promise<number | null> {
  const url = `https://push2.eastmoney.com/api/qt/fund/nav/get?v=1.0&format=json&fundCode=${code}`;
  const res = await fetchWithTimeout(url, { 
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://fund.eastmoney.com/"
    }
  }, 8000);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.data) return null;
  const price = parseFloat(data.data.dwjz);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function getFundPriceFromPage(code: string): Promise<number | null> {
  const url = `https://fund.eastmoney.com/${code}.html`;
  const res = await fetchWithTimeout(url, { 
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://fund.eastmoney.com/"
    }
  }, 8000);
  if (!res.ok) return null;
  const text = await res.text();
  const match = text.match(/<span class="ui-font-large ui-color-red ui-num">([\d.]+)<\/span>/);
  if (match) {
    const price = parseFloat(match[1]);
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  return null;
}

async function getFundPrice(code: string): Promise<number | null> {
  const url = `https://fundgz.1234567.com.cn/js/${code}.js`;
  const res = await fetchWithTimeout(url, { 
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*"
    }
  }, 8000);
  
  if (res.ok) {
    const text = await res.text();
    const match = text.match(/jsonpgz\((.*?)\);/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const today = new Date().toISOString().split('T')[0];
        const hasTodayFormalNav = data.jzrq === today && data.dwjz;
        const price = parseFloat(hasTodayFormalNav ? data.dwjz : (data.gsz || data.dwjz));
        if (Number.isFinite(price) && price > 0) return price;
      } catch {}
    }
  }
  
  const backupPrice = await getFundPriceFromEastMoneyApi(code);
  if (backupPrice != null) return backupPrice;
  
  const pagePrice = await getFundPriceFromPage(code);
  if (pagePrice != null) return pagePrice;
  
  return null;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const market = (request.nextUrl.searchParams.get("market") ?? "A") as "A" | "HK" | "US" | "FUND";
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  try {
    if (market === "FUND") {
      const p = await getFundPrice(code);
      if (p != null) return NextResponse.json({ price: p });
      return NextResponse.json(
        { error: "Price not found", hint: "请检查基金代码是否正确或稍后重试" },
        { status: 404 }
      );
    }
    if (market === "A") {
      const secid = getEastMoneySecid(code, "A");
      let p: number | null = null;
      if (secid) {
        const raw = await getEastMoneyF43Raw(secid);
        if (raw != null) {
          // raw >= 10000 时 /100 与 /1000 都可能；取昨收辅助判别，避免 ETF 被 10 倍放大
          const needLastClose = raw >= 10000 && raw < 1_000_000 && !String(secid).startsWith("116.");
          const lastClose = needLastClose ? await getEastMoneyLastClose(secid) : null;
          p = pickEastMoneyPriceByLastClose(raw, secid, lastClose, code, "A");
        }
        if (p == null) p = await getEastMoneyLastClose(secid);
      }
      if (p != null) return NextResponse.json({ price: p });
      const prefix = /^6/.test(code) || /^5/.test(code) ? "sh" : "sz";
      const symbol = prefix + code.replace(/^(sh|sz)/i, "");
      const sinaP = await getSinaPrice(symbol);
      if (sinaP != null) return NextResponse.json({ price: sinaP });
    } else if (market === "HK") {
      const secid = getEastMoneySecid(code, "HK");
      let p: number | null = null;
      if (secid) {
        const raw = await getEastMoneyF43Raw(secid);
        if (raw != null) {
          // 港股按 /1000；这里仍保留昨收兜底
          p = pickEastMoneyPriceByLastClose(raw, secid, null, code, "HK");
        }
        if (p == null) p = await getEastMoneyLastClose(secid);
      }
      if (p != null) return NextResponse.json({ price: p });
      const raw = code.replace(/^hk/i, "").replace(/\D/g, "") || "0";
      const symbol = "hk" + (raw.length >= 5 ? raw : raw.padStart(5, "0"));
      const sinaP = await getSinaPrice(symbol);
      if (sinaP != null) return NextResponse.json({ price: sinaP });
    } else if (market === "US") {
      const symbol = code.replace(/\s/g, "").toUpperCase();
      let p = await getSinaUSPrice(symbol);
      if (p == null) p = await getYahooPrice(symbol);
      if (p != null) return NextResponse.json({ price: p });
      return NextResponse.json(
        { error: "Price not found", hint: "请检查美股代码是否正确或稍后重试" },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: "Price not found" }, { status: 404 });
  } catch (e) {
    console.error("[price]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch price" },
      { status: 500 }
    );
  }
}
