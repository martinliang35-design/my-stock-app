import { NextResponse } from "next/server";

const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=CNY&to=USD,HKD";

export async function GET() {
  try {
    const res = await fetch(FRANKFURTER_URL, { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error(res.statusText);
    const data = (await res.json()) as { rates?: { USD?: number; HKD?: number } };
    if (!data?.rates || data.rates.USD == null || data.rates.HKD == null)
      throw new Error("Invalid rates");
    const oneCnyToUsd = Number(data.rates.USD);
    const oneCnyToHkd = Number(data.rates.HKD);
    if (oneCnyToUsd <= 0 || oneCnyToHkd <= 0) throw new Error("Invalid rate values");
    const usdToCny = 1 / oneCnyToUsd;
    const hkdToCny = 1 / oneCnyToHkd;
    return NextResponse.json({ usdToCny, hkdToCny });
  } catch (e) {
    console.error("[rates]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch rates" },
      { status: 500 }
    );
  }
}
