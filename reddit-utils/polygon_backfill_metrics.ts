#!/usr/bin/env -S deno run --allow-env --allow-net

/**
 * Backfill Polygon-derived trading metrics into `ticker_universe`.
 *
 * Usage:
 *   START_DATE=2025-06-01 END_DATE=2025-09-30 \ 
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \ 
 *   POLYGON_API_KEY=... deno run --allow-env --allow-net polygon_backfill_metrics.ts
 *
 * Optional env vars:
 *   SYMBOLS="AAPL,MSFT"      // limit to specific tickers
 *   BATCH_SLEEP_MS=1500           // delay between Polygon requests
 *   MAX_SYMBOLS=0                // 0 = no cap
 */


// Backfill trading metrics for ticker_universe using Polygon daily bars + fundamentals.
// Usage:
//   START_DATE=2025-06-01 END_DATE=2025-09-30 polygon_backfill_metrics.ts
// Optional env:
//   SYMBOLS="AAPL,MSFT" (defaults to all active tickers)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (required)
//   POLYGON_API_KEY (required)
//   BATCH_SLEEP_MS=1500 (delay between polygon calls)
//   MAX_SYMBOLS=0 (0 = no cap)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const env = (k: string, d?: string) => Deno.env.get(k) ?? d;
const must = (k: string) => {
  const v = env(k);
  if (!v) throw new Error(`Missing required env var ${k}`);
  return v;
};

const SUPABASE_URL = must("SUPABASE_URL");
const SUPABASE_KEY = must("SUPABASE_SERVICE_ROLE_KEY");
const POLYGON_API_KEY = must("POLYGON_API_KEY");
const START_DATE = must("START_DATE"); // inclusive YYYY-MM-DD
const END_DATE = must("END_DATE");     // inclusive YYYY-MM-DD
const rawSymbols = env("SYMBOLS");
const SYMBOLS = rawSymbols && rawSymbols.trim().toUpperCase() === "NULL"
  ? undefined
  : rawSymbols;
const BATCH_SLEEP_MS = Number(env("BATCH_SLEEP_MS", "6000"));
const MAX_SYMBOLS = Number(env("MAX_SYMBOLS", "0"));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ISO_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

if (!ISO_DAY_REGEX.test(START_DATE) || !ISO_DAY_REGEX.test(END_DATE)) {
  throw new Error("START_DATE and END_DATE must be in YYYY-MM-DD format");
}

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PolygonBar {
  t: number; // unix ms
  c: number;
  h: number;
  l: number;
  o: number;
  v: number;
}

interface MetricBundle {
  avgDollarVolume30d: number | null;
  atr14: number | null;
  trueRangePct14: number | null;
  betaVsSpy: number | null;
  sharesFloat: number | null;
  shortInterestPctFloat: number | null;
  borrowCostBps: number | null;
  hardToBorrow: boolean | null;
}

interface EnhancedMarketDataRow {
  symbol: string;
  price_open: number | null;
  price_high: number | null;
  price_low: number | null;
  price_close: number | null;
  volume: number | null;
  timestamp: string;
  data_date: string;
  technical_indicators: Record<string, unknown>;
  price_change_1d: number | null;
  price_change_5d: number | null;
  updated_at: string;
}

async function listSymbols(): Promise<string[]> {
  if (SYMBOLS) {
    return SYMBOLS.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  }
  const { data, error } = await supabase
    .from("ticker_universe")
    .select("symbol")
    .eq("active", true)
    .order("priority", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const filtered = rows
    .map((row) => row.symbol)
    .filter((symbol): symbol is string => typeof symbol === "string" && symbol.trim().length > 0);

  if (filtered.length !== rows.length) {
    log("WARN ticker_universe has", rows.length - filtered.length, "rows with null/blank symbols; skipping those entries");
  }

  return filtered.map((symbol) => symbol.toUpperCase());
}

async function fetchBars(symbol: string, from: string, to: string): Promise<PolygonBar[]> {
  const url = new URL(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "5000");
  url.searchParams.set("apikey", POLYGON_API_KEY);

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Polygon bars failed ${symbol}: ${res.status} ${res.statusText} ${text}`);
  }
  const json = await res.json();
  return (json?.results ?? []) as PolygonBar[];
}

async function fetchFundamentals(symbol: string) {
  const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apikey=${POLYGON_API_KEY}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Polygon fundamentals failed ${symbol}: ${res.status} ${res.statusText} ${text}`);
  }
  const json = await res.json();
  return json?.results ?? {};
}

async function fetchShortInterest(symbol: string) {
  // Polygon short interest endpoint returns daily stats when available.
  const url = new URL(`https://api.polygon.io/v2/reference/short-interest/${symbol}`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("apiKey", POLYGON_API_KEY);

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) {
    if (res.status === 404) return null; // not available for many tickers
    const text = await res.text().catch(() => "");
    throw new Error(`Polygon short interest failed ${symbol}: ${res.status} ${res.statusText} ${text}`);
  }
  const json = await res.json();
  const values = json?.results ?? [];
  return Array.isArray(values) && values.length > 0 ? values[0] : null;
}

async function fetchBorrowRates(symbol: string) {
  const url = new URL(`https://api.polygon.io/v1/reference/stock_borrow/${symbol}`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", POLYGON_API_KEY);

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) {
    if (res.status === 404) return null;
    const text = await res.text().catch(() => "");
    throw new Error(`Polygon borrow rates failed ${symbol}: ${res.status} ${res.statusText} ${text}`);
  }
  const json = await res.json();
  const values = json?.results ?? [];
  return Array.isArray(values) && values.length > 0 ? values[0] : null;
}

async function fetchSpyBars(from: string, to: string): Promise<PolygonBar[]> {
  return fetchBars("SPY", from, to);
}

function computeMetrics(symbolBars: PolygonBar[], spyBars: PolygonBar[]): MetricBundle {
  if (symbolBars.length === 0) {
    return {
      avgDollarVolume30d: null,
      atr14: null,
      trueRangePct14: null,
      betaVsSpy: null,
      sharesFloat: null,
      shortInterestPctFloat: null,
      borrowCostBps: null,
      hardToBorrow: null,
    };
  }

  const tail30 = symbolBars.slice(-30);
  const avgDollarVolume30d = tail30.length > 0
    ? tail30.reduce((sum, bar) => sum + bar.c * bar.v, 0) / tail30.length
    : null;

  const atrWindow = symbolBars.slice(-15); // need previous close, so take 15 to compute ATR14
  let atr14: number | null = null;
  let trueRangePct14: number | null = null;
  if (atrWindow.length >= 2) {
    const trs: number[] = [];
    for (let i = 1; i < atrWindow.length; i++) {
      const curr = atrWindow[i];
      const prev = atrWindow[i - 1];
      const highLow = curr.h - curr.l;
      const highClose = Math.abs(curr.h - prev.c);
      const lowClose = Math.abs(curr.l - prev.c);
      const tr = Math.max(highLow, highClose, lowClose);
      trs.push(tr);
    }
    if (trs.length >= 1) {
      const atr = trs.reduce((sum, v) => sum + v, 0) / trs.length;
      atr14 = atr;
      const lastClose = atrWindow[atrWindow.length - 1].c;
      trueRangePct14 = lastClose > 0 ? (atr / lastClose) * 100 : null;
    }
  }

  const betaVsSpy = computeBeta(symbolBars, spyBars);

  return {
    avgDollarVolume30d,
    atr14,
    trueRangePct14,
    betaVsSpy,
    sharesFloat: null,
    shortInterestPctFloat: null,
    borrowCostBps: null,
    hardToBorrow: null,
  };
}

function computeBeta(symbolBars: PolygonBar[], spyBars: PolygonBar[]): number | null {
  if (symbolBars.length < 2 || spyBars.length < 2) return null;

  const symbolMap = new Map<number, PolygonBar>();
  for (const bar of symbolBars) symbolMap.set(bar.t, bar);

  const paired: Array<{ s: number; m: number }> = [];
  for (const bar of spyBars) {
    const other = symbolMap.get(bar.t);
    if (!other) continue;
    if (other.c <= 0 || bar.c <= 0) continue;
    const prevSymbol = symbolMap.get(previousTimestamp(symbolBars, other.t));
    const prevSpy = previousTimestamp(spyBars, bar.t)
      ? spyBars.find((b) => b.t === previousTimestamp(spyBars, bar.t))
      : undefined;
    if (!prevSymbol || !prevSpy || prevSymbol.c <= 0 || prevSpy.c <= 0) continue;
    const sRet = (other.c - prevSymbol.c) / prevSymbol.c;
    const mRet = (bar.c - prevSpy.c) / prevSpy.c;
    paired.push({ s: sRet, m: mRet });
  }

  if (paired.length < 2) return null;

  const meanS = paired.reduce((sum, p) => sum + p.s, 0) / paired.length;
  const meanM = paired.reduce((sum, p) => sum + p.m, 0) / paired.length;
  let cov = 0;
  let varM = 0;
  for (const p of paired) {
    cov += (p.s - meanS) * (p.m - meanM);
    varM += (p.m - meanM) ** 2;
  }
  cov /= paired.length - 1;
  varM /= paired.length - 1;
  if (varM === 0) return null;
  return cov / varM;
}

function previousTimestamp(bars: PolygonBar[], current: number): number | undefined {
  for (let i = bars.length - 1; i >= 1; i--) {
    if (bars[i].t === current) {
      return bars[i - 1].t;
    }
  }
  return undefined;
}

function toIsoDate(msSinceEpoch: number): { timestamp: string; date: string } {
  const iso = new Date(msSinceEpoch).toISOString();
  return { timestamp: iso, date: iso.split("T")[0] };
}

function toNullableNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function computePercentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function buildEnhancedRows(symbol: string, bars: PolygonBar[], updatedAt: string): EnhancedMarketDataRow[] {
  if (bars.length === 0) return [];

  const sorted = [...bars].sort((a, b) => a.t - b.t);

  return sorted.map((bar, idx) => {
    const prev1 = idx > 0 ? sorted[idx - 1] : undefined;
    const prev5 = idx > 4 ? sorted[idx - 5] : undefined;
    const close = toNullableNumber(bar.c);
    const prevClose1 = prev1 ? toNullableNumber(prev1.c) : null;
    const prevClose5 = prev5 ? toNullableNumber(prev5.c) : null;
    const { timestamp, date } = toIsoDate(bar.t);

    return {
      symbol,
      price_open: toNullableNumber(bar.o),
      price_high: toNullableNumber(bar.h),
      price_low: toNullableNumber(bar.l),
      price_close: close,
      volume: toNullableNumber(bar.v),
      timestamp,
      data_date: date,
      technical_indicators: {},
      price_change_1d: computePercentChange(close, prevClose1),
      price_change_5d: computePercentChange(close, prevClose5),
      updated_at: updatedAt,
    };
  });
}

async function enrichFundamentals(metrics: MetricBundle, symbol: string): Promise<MetricBundle> {
  try {
    const fundamentals = await fetchFundamentals(symbol);
    const sharesFloat = fundamentals?.share_class_shares_outstanding ?? fundamentals?.weighted_shares_outstanding ?? null;
    metrics.sharesFloat = sharesFloat ?? null;
  } catch (err) {
    log(`WARN fundamentals fetch failed for ${symbol}:`, err);
  }

  try {
    const short = await fetchShortInterest(symbol);
    if (short) {
      const floatShares = metrics.sharesFloat ?? short?.float_shares ?? null;
      const shortVolume = short?.short_interest ?? null;
      if (floatShares && shortVolume) {
        metrics.shortInterestPctFloat = (shortVolume / floatShares) * 100;
      }
    }
  } catch (err) {
    log(`WARN short interest fetch failed for ${symbol}:`, err);
  }

  try {
    const borrow = await fetchBorrowRates(symbol);
    if (borrow) {
      metrics.borrowCostBps = borrow?.fee ?? null;
      metrics.hardToBorrow = borrow?.is_hard_to_borrow ?? null;
    }
  } catch (err) {
    log(`WARN borrow rate fetch failed for ${symbol}:`, err);
  }

  return metrics;
}

async function fetchWithRetry(url: string | URL, attempts = 6): Promise<Response> {
  const target = typeof url === "string" ? url : url.toString();
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetch(target);
    if (res.ok) {
      return res;
    }

    lastRes = res;

    // If it is a hard client/server error (non 429, <500) bail immediately
    if (res.status !== 429 && res.status < 500) {
      return res;
    }

    let wait = Math.min(60000, (attempt + 1) * 1500 + Math.random() * 1000);

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) {
        const parsed = Number(retryAfter);
        if (!Number.isNaN(parsed) && parsed > 0) {
          wait = parsed * 1000;
        }
      }
    }

    log(`Retrying ${target} after ${wait}ms (status ${res.status})`);
    await sleep(wait);
  }

  // Final attempt or return last response if available
  if (lastRes) {
    return lastRes;
  }
  return fetch(target);
}

async function main() {
  log("Starting Polygon backfill", { START_DATE, END_DATE });
  const symbols = await listSymbols();
  const capped = MAX_SYMBOLS > 0 ? symbols.slice(0, MAX_SYMBOLS) : symbols;
  log(`Processing ${capped.length} symbols`);

  const spyBars = await fetchSpyBars(START_DATE, END_DATE);

  let processed = 0;
  for (const symbol of capped) {
    try {
      const bars = await fetchBars(symbol, START_DATE, END_DATE);
      const upsertedAt = new Date().toISOString();
      const enhancedRows = buildEnhancedRows(symbol, bars, upsertedAt);

      if (enhancedRows.length > 0) {
        const { error: enhancedError } = await supabase
          .from("enhanced_market_data")
          .upsert(enhancedRows, { onConflict: "symbol,data_date", ignoreDuplicates: false });

        if (enhancedError) throw enhancedError;
        log(`Upserted ${enhancedRows.length} enhanced rows for ${symbol}`);
      } else {
        log(`No Polygon bars returned for ${symbol}; skipping enhanced_market_data upsert`);
      }

      const metrics = computeMetrics(bars, spyBars);
      await enrichFundamentals(metrics, symbol);

      const { error } = await supabase
        .from("ticker_universe")
        .update({
          avg_daily_dollar_volume_30d: metrics.avgDollarVolume30d,
          atr_14d: metrics.atr14,
          true_range_pct: metrics.trueRangePct14,
          beta_vs_spy: metrics.betaVsSpy,
          shares_float: metrics.sharesFloat,
          short_interest_pct_float: metrics.shortInterestPctFloat,
          borrow_cost_bps: metrics.borrowCostBps,
          hard_to_borrow_flag: metrics.hardToBorrow,
          updated_at: new Date().toISOString(),
        })
        .eq("symbol", symbol);

      if (error) throw error;
      processed++;
      log(`Updated ${symbol} (${processed}/${capped.length})`);
    } catch (err) {
      log(`ERROR processing ${symbol}:`, err);
    }

    if (BATCH_SLEEP_MS > 0) await sleep(BATCH_SLEEP_MS);
  }

  log("Backfill complete", { processed, total: capped.length });
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error", err);
    Deno.exit(1);
  });
}
