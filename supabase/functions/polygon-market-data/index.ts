import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TechnicalIndicators {
  rsi: number;
  sma_20: number;
  sma_50: number;
  volume_ratio: number;
  momentum: number;
  volatility: number;
}

interface PolygonMarketData {
  symbol: string;
  price: number;
  price_open: number;
  price_high: number;
  price_low: number;
  volume: number;
  timestamp: string;
  technical_indicators: TechnicalIndicators;
  price_change_1d: number;
  price_change_5d: number;
  polygon_available?: boolean;
  data_points?: number;
}

interface PolygonAggBar {
  t: number;
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
}

// Enhanced backoff-aware fetch helper with better 429 handling
async function fetchWithBackoff(
  url: string,
  init: RequestInit = {},
  maxRetries = 5,
  baseDelayMs = 5000,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (
      res.ok || attempt >= maxRetries ||
      (res.status < 500 && res.status !== 429)
    ) return res;

    attempt++;
    let delay = baseDelayMs;

    if (res.status === 429) {
      // Handle rate limit with Retry-After header or aggressive backoff
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) {
        delay = parseInt(retryAfter) * 1000; // Convert seconds to ms
      } else {
        delay = Math.min(60000, baseDelayMs * Math.pow(2, attempt)); // Cap at 60s
      }
    } else {
      // Exponential backoff for other errors
      delay = baseDelayMs * Math.pow(2, attempt);
    }

    const jitter = Math.floor(Math.random() * 1000); // Add jitter
    delay += jitter;

    console.warn(
      `Attempt ${attempt}/${maxRetries} failed with status ${res.status}, retrying in ${delay}ms`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID().substring(0, 8);

  try {
    console.log(
      `[${requestId}] ========== POLYGON MARKET DATA STARTED ==========`,
    );
    console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`);
    console.log(`[${requestId}] Request ID: ${requestId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");

    if (!polygonApiKey) {
      console.error(
        `[${requestId}] ❌ Missing Polygon API key - returning fallback response`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Polygon API key - configure in Supabase secrets",
          enhanced_data: [],
          fallback_available: true,
          requestId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { symbols, days = 30 } = await req.json();

    console.log(
      `[${requestId}] Request params: ${
        JSON.stringify({ symbolCount: symbols?.length, days })
      }`,
    );

    if (!symbols || !Array.isArray(symbols)) {
      console.error(`[${requestId}] ERROR: Missing or invalid symbols array`);
      return new Response(
        JSON.stringify({
          error: "Missing or invalid symbols array",
          requestId,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[${requestId}] Fetching Polygon market data for ${symbols.length} symbols over ${days} days`,
    );

    const enhancedData: PolygonMarketData[] = [];
    const failedSymbols: string[] = [];
    const BATCH_SIZE = 1; // Process one symbol at a time for rate limits
    const maxSymbolsEnv = Deno.env.get("POLYGON_MAX_SYMBOLS");
    const parsedMax = maxSymbolsEnv ? Number(maxSymbolsEnv) : Number.POSITIVE_INFINITY;
    const shouldLimit = Number.isFinite(parsedMax) && parsedMax > 0 && parsedMax < symbols.length;
    const limitedSymbols = shouldLimit
      ? symbols.slice(0, Math.max(0, Math.trunc(parsedMax)))
      : symbols;

    if (shouldLimit) {
      console.log(
        `[${requestId}] Limited symbols from ${symbols.length} to ${limitedSymbols.length} via POLYGON_MAX_SYMBOLS=${parsedMax}`,
      );
    } else {
      console.log(
        `[${requestId}] Processing full symbol list (${symbols.length})`,
      );
    }

    let spyBarsCache: PolygonAggBar[] | null = null;
    let spyCacheKey: string | null = null;

    // Process symbols in batches
    for (let i = 0; i < limitedSymbols.length; i += BATCH_SIZE) {
      const batch = limitedSymbols.slice(i, i + BATCH_SIZE);
      console.log(
        `[${requestId}] Processing Polygon batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(limitedSymbols.length / BATCH_SIZE)}`,
      );

      const batchPromises = batch.map(async (symbol) => {
        try {
          const now = new Date();
          const toDate = now.toISOString().split("T")[0];
          const fromDate =
            new Date(Date.now() - (days * 2 * 24 * 60 * 60 * 1000))
              .toISOString().split("T")[0];

          // Check if it's a trading day (Mon-Fri) and market hours (9:30 AM - 4 PM ET)
          const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
          const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
          const etHour = now.getUTCHours() - 5; // Convert UTC to approximate ET (ignoring DST for simplicity)
          const isMarketHours = etHour >= 9.5 && etHour <= 16;

          let barsUrl: string;
          let attemptedMinuteRange = false;

          if (isWeekday && isMarketHours) {
            // During market hours, try to get current day's minute data aggregated
            console.log(`Market is open for ${symbol}, fetching intraday data`);
            barsUrl =
              `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${toDate}/${toDate}?adjusted=true&sort=desc&limit=1&apikey=${polygonApiKey}`;
            attemptedMinuteRange = true;
          } else {
            // Market closed, get daily bars including today (if available)
            console.log(`Market is closed for ${symbol}, fetching daily bars`);
            barsUrl =
              `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=desc&limit=5000&apikey=${polygonApiKey}`;
          }

          console.log(
            `[${requestId}] Fetching Polygon data for ${symbol} from ${fromDate} to ${toDate}`,
          );

          let response = await fetchWithBackoff(barsUrl);
          let isDailyRange = barsUrl.includes("/1/day/");

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.error(
              `[${requestId}] ❌ Failed to fetch Polygon data for ${symbol}: ${response.status} ${response.statusText}`,
            );
            if (
              attemptedMinuteRange && response.status === 403 &&
              errorText?.toLowerCase().includes("plan doesn't include this data timeframe")
            ) {
              console.warn(
                `[${requestId}] ⚠️ Polygon plan restriction for ${symbol} intraday data; retrying with daily aggregates`,
              );
              const fallbackUrl =
                `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=desc&limit=5000&apikey=${polygonApiKey}`;
              response = await fetchWithBackoff(fallbackUrl);
              isDailyRange = true;

              if (!response.ok) {
                const fallbackText = await response.text().catch(() => "");
                console.error(
                  `[${requestId}] ❌ Fallback daily fetch failed for ${symbol}: ${response.status} ${response.statusText}`,
                );
                console.error(
                  `[${requestId}] Polygon API error response:`,
                  fallbackText,
                );
                failedSymbols.push(symbol);
                return null;
              }
            } else {
              console.error(
                `[${requestId}] Polygon API error response:`,
                errorText,
              );
              failedSymbols.push(symbol);
              return null;
            }
          }

          const data = await response.json();
          console.log(
            `[${requestId}] Polygon response for ${symbol}:`,
            JSON.stringify(data).substring(0, 200),
          );

          if (!data.results || data.results.length === 0) {
            console.log(
              `[${requestId}] No Polygon data results for ${symbol}:`,
              data,
            );
            failedSymbols.push(symbol);
            return null;
          }

          if (data.results.length < 1) {
            console.log(
              `[${requestId}] No Polygon data for ${symbol}: ${data.results.length} bars`,
            );
            failedSymbols.push(symbol);
            return null;
          }

          const results = data.results;
          let metricsBars = sanitizeBars(results);

          if (!isDailyRange) {
            const dailyUrl =
              `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=desc&limit=5000&apikey=${polygonApiKey}`;
            const dailyResponse = await fetchWithBackoff(dailyUrl);
            if (dailyResponse.ok) {
              const dailyJson = await dailyResponse.json();
              metricsBars = sanitizeBars(dailyJson?.results ?? []);
            } else {
              console.warn(
                `[${requestId}] ⚠️ Unable to fetch daily bars for metrics on ${symbol}: ${dailyResponse.status} ${dailyResponse.statusText}`,
              );
            }
          }

          if (metricsBars.length >= 2) {
            const cacheKey = `${fromDate}-${toDate}`;
            if (!spyBarsCache || spyCacheKey !== cacheKey) {
              spyBarsCache = await fetchSpyBars(
                fromDate,
                toDate,
                polygonApiKey,
                requestId,
              );
              spyCacheKey = cacheKey;
            }

            if (spyBarsCache.length >= 2) {
              const metrics = computeMetricsFromBars(metricsBars, spyBarsCache);
              await upsertTickerMetrics(
                supabase,
                symbol.toUpperCase(),
                metrics,
                requestId,
              );
            } else {
              console.warn(
                `[${requestId}] ⚠️ Skipping metrics update for ${symbol}: missing SPY reference bars`,
              );
            }
          } else {
            console.warn(
              `[${requestId}] ⚠️ Insufficient bars to compute metrics for ${symbol} (${metricsBars.length} bars)`,
            );
          }

          const prices = results.map((bar: any) => bar.c); // closing prices
          const openPrices = results.map((bar: any) => bar.o); // open prices
          const highPrices = results.map((bar: any) => bar.h); // high prices
          const lowPrices = results.map((bar: any) => bar.l); // low prices
          const volumes = results.map((bar: any) => bar.v); // volumes
          const timestamps = results.map((bar: any) => bar.t); // timestamps

          // Calculate technical indicators
          const validPrices = prices.filter((p: number) => p > 0);
          const validVolumes = volumes.filter((v: number) => v > 0);

          if (validPrices.length < 1) {
            console.log(
              `[${requestId}] No valid price data for ${symbol}: only ${validPrices.length} valid prices`,
            );
            failedSymbols.push(symbol);
            return null;
          }

          const price_change_1d =
            validPrices.length >= 2 && validPrices[validPrices.length - 2] !== 0
              ? ((validPrices[validPrices.length - 1] -
                validPrices[validPrices.length - 2]) /
                validPrices[validPrices.length - 2]) * 100
              : 0;

          const price_change_5d =
            validPrices.length >= 5 && validPrices[validPrices.length - 5] !== 0
              ? ((validPrices[validPrices.length - 1] -
                validPrices[validPrices.length - 5]) /
                validPrices[validPrices.length - 5]) * 100
              : 0;

          const rsi = validPrices.length >= 14
            ? calculateRSI(validPrices.slice(-14))
            : calculateRSI(validPrices);

          const sma_20 = validPrices.length >= 20
            ? validPrices.slice(-20).reduce((sum, price) => sum + price, 0) / 20
            : validPrices.reduce((sum, price) => sum + price, 0) /
              validPrices.length;

          const sma_50 = validPrices.length >= 50
            ? validPrices.slice(-50).reduce((sum, price) => sum + price, 0) / 50
            : sma_20;

          const avgVolume = validVolumes.length > 0
            ? validVolumes.reduce((sum, vol) => sum + vol, 0) /
              validVolumes.length
            : 0;
          const currentVolume = validVolumes.length > 0
            ? validVolumes[validVolumes.length - 1]
            : 0;
          const volume_ratio = avgVolume > 0 ? currentVolume / avgVolume : 1;

          const currentPrice = prices[prices.length - 1];
          const currentOpen = openPrices[openPrices.length - 1] ?? currentPrice;
          const currentHigh = highPrices[highPrices.length - 1] ?? currentPrice;
          const currentLow = lowPrices[lowPrices.length - 1] ?? currentPrice;

          const momentum = validPrices.length >= 2
            ? currentPrice - validPrices[validPrices.length - 2]
            : 0;
          const volatility = calculateVolatility(validPrices);

          console.log(
            `[${requestId}] ✅ Polygon data calculated for ${symbol}: Price=$${
              currentPrice.toFixed(2)
            }, RSI=${rsi.toFixed(1)}, Volume Ratio=${
              volume_ratio.toFixed(2)
            }x, Data Points=${validPrices.length}`,
          );

          return {
            symbol: symbol.toUpperCase(),
            price: Math.round(currentPrice * 100) / 100,
            price_open: Math.round(currentOpen * 100) / 100,
            price_high: Math.round(currentHigh * 100) / 100,
            price_low: Math.round(currentLow * 100) / 100,
            volume: Math.round(currentVolume),
            timestamp: new Date(timestamps[timestamps.length - 1])
              .toISOString(),
            technical_indicators: {
              rsi: Math.max(0, Math.min(100, rsi)),
              sma_20,
              sma_50,
              volume_ratio: Math.max(0.1, volume_ratio),
              momentum,
              volatility,
            },
            price_change_1d: Math.round(price_change_1d * 100) / 100,
            price_change_5d: Math.round(price_change_5d * 100) / 100,
            polygon_available: true,
            data_points: validPrices.length,
          };
        } catch (error) {
          console.error(
            `[${requestId}] ❌ Error processing Polygon data for ${symbol}:`,
            error,
          );
          failedSymbols.push(symbol);
          return null;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      // Add successful results
      batchResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          enhancedData.push(result.value);
        }
      });

      // Aggressive rate limit delay between batches (30 seconds for free tier)
      if (i + BATCH_SIZE < limitedSymbols.length) {
        console.log(
          `[${requestId}] Waiting 30 seconds before next batch to respect rate limits...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    }

    // Store the enhanced data in the database
    if (enhancedData.length > 0) {
      console.log(
        `[${requestId}] Storing ${enhancedData.length} Polygon records to enhanced_market_data table`,
      );

      const dbRecords = enhancedData.map((item) => ({
        symbol: item.symbol,
        price_close: item.price,
        price_open: item.price_open,
        price_high: item.price_high,
        price_low: item.price_low,
        volume: item.volume,
        timestamp: item.timestamp,
        technical_indicators: item.technical_indicators,
        price_change_1d: item.price_change_1d,
        price_change_5d: item.price_change_5d,
        data_date: new Date(item.timestamp).toISOString().split("T")[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from("enhanced_market_data")
        .upsert(dbRecords, {
          onConflict: "symbol,data_date",
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error(
          `[${requestId}] ❌ Error storing Polygon data to database:`,
          insertError,
        );
      } else {
        console.log(
          `[${requestId}] ✅ Successfully stored ${dbRecords.length} Polygon records to database`,
        );
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `[${requestId}] ========== POLYGON MARKET DATA COMPLETED ==========`,
    );
    console.log(`[${requestId}] Duration: ${duration}s`);
    console.log(
      `[${requestId}] Processed: ${enhancedData.length}/${limitedSymbols.length} symbols`,
    );
    if (failedSymbols.length === 0) {
      console.log(`[${requestId}] Failed symbols: none`);
    } else {
      console.log(
        `[${requestId}] Failed symbols (${failedSymbols.length}): ${JSON.stringify(failedSymbols)}`,
      );
    }
    console.log(
      `[${requestId}] ==================================================`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        enhanced_data: enhancedData,
        total_processed: enhancedData.length,
        symbols_requested: symbols.length,
        failed_symbols: failedSymbols,
        source: "polygon",
        stored_to_db: enhancedData.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(
      `[${requestId}] ========== POLYGON MARKET DATA ERROR ==========`,
    );
    console.error(`[${requestId}] Duration: ${duration}s`);
    console.error(`[${requestId}] Error:`, error);
    console.error(
      `[${requestId}] Stack:`,
      error instanceof Error ? error.stack : "N/A",
    );
    console.error(
      `[${requestId}] ==================================================`,
    );
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
        enhanced_data: [],
        requestId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function sanitizeBar(bar: any): PolygonAggBar | null {
  if (!bar) return null;
  const t = typeof bar.t === "number" ? bar.t : Number(bar.t);
  const c = Number(bar.c);
  const h = Number(bar.h);
  const l = Number(bar.l);
  const o = Number(bar.o);
  const v = Number(bar.v);

  if (
    !Number.isFinite(t) || !Number.isFinite(c) || !Number.isFinite(h) ||
    !Number.isFinite(l) || !Number.isFinite(o) || !Number.isFinite(v)
  ) {
    return null;
  }

  return { t, c, h, l, o, v };
}

function sanitizeBars(bars: any[]): PolygonAggBar[] {
  return (bars ?? [])
    .map(sanitizeBar)
    .filter((bar): bar is PolygonAggBar => bar !== null)
    .sort((a, b) => a.t - b.t);
}

function toISODate(ts: number): string {
  return new Date(ts).toISOString().split("T")[0];
}

function computeMetricsFromBars(
  symbolBars: PolygonAggBar[],
  spyBars: PolygonAggBar[],
): MetricBundle {
  const orderedSymbol = [...symbolBars].sort((a, b) => a.t - b.t);
  const orderedSpy = [...spyBars].sort((a, b) => a.t - b.t);

  const tail30 = orderedSymbol.slice(-30);
  const avgDollarVolume30d = tail30.length > 0
    ? tail30.reduce((sum, bar) => sum + bar.c * bar.v, 0) / tail30.length
    : null;

  let atr14: number | null = null;
  let trueRangePct14: number | null = null;
  if (orderedSymbol.length >= 2) {
    const atrWindow = orderedSymbol.slice(-15);
    if (atrWindow.length >= 2) {
      const trs: number[] = [];
      for (let i = 1; i < atrWindow.length; i++) {
        const curr = atrWindow[i];
        const prev = atrWindow[i - 1];
        const highLow = curr.h - curr.l;
        const highClose = Math.abs(curr.h - prev.c);
        const lowClose = Math.abs(curr.l - prev.c);
        trs.push(Math.max(highLow, highClose, lowClose));
      }
      if (trs.length > 0) {
        const avgTr = trs.reduce((sum, tr) => sum + tr, 0) / trs.length;
        atr14 = avgTr;
        const latestClose = atrWindow[atrWindow.length - 1].c;
        trueRangePct14 = latestClose > 0 ? (avgTr / latestClose) * 100 : null;
      }
    }
  }

  const betaVsSpy = computeBeta(orderedSymbol, orderedSpy);

  return {
    avgDollarVolume30d,
    atr14,
    trueRangePct14,
    betaVsSpy,
  };
}

function computeBeta(
  symbolBars: PolygonAggBar[],
  spyBars: PolygonAggBar[],
): number | null {
  if (symbolBars.length < 2 || spyBars.length < 2) return null;

  const spyReturns = new Map<string, number>();
  for (let i = 1; i < spyBars.length; i++) {
    const prev = spyBars[i - 1];
    const curr = spyBars[i];
    if (prev.c <= 0 || curr.c <= 0) continue;
    const ret = (curr.c - prev.c) / prev.c;
    spyReturns.set(toISODate(curr.t), ret);
  }

  const paired: Array<{ s: number; m: number }> = [];
  for (let i = 1; i < symbolBars.length; i++) {
    const prev = symbolBars[i - 1];
    const curr = symbolBars[i];
    if (prev.c <= 0 || curr.c <= 0) continue;
    const marketRet = spyReturns.get(toISODate(curr.t));
    if (marketRet === undefined) continue;
    const symbolRet = (curr.c - prev.c) / prev.c;
    paired.push({ s: symbolRet, m: marketRet });
  }

  if (paired.length < 2) return null;

  const meanS = paired.reduce((sum, p) => sum + p.s, 0) / paired.length;
  const meanM = paired.reduce((sum, p) => sum + p.m, 0) / paired.length;

  let covariance = 0;
  let varianceM = 0;
  for (const p of paired) {
    covariance += (p.s - meanS) * (p.m - meanM);
    varianceM += (p.m - meanM) ** 2;
  }

  covariance /= paired.length - 1;
  varianceM /= paired.length - 1;

  if (varianceM <= 0) return null;
  return covariance / varianceM;
}

async function fetchSpyBars(
  fromDate: string,
  toDate: string,
  polygonApiKey: string,
  requestId: string,
): Promise<PolygonAggBar[]> {
  const url =
    `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=desc&limit=5000&apikey=${polygonApiKey}`;
  const response = await fetchWithBackoff(url);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.warn(
      `[${requestId}] ⚠️ Failed to fetch SPY reference bars: ${response.status} ${response.statusText} ${errorText}`,
    );
    return [];
  }

  const data = await response.json();
  return sanitizeBars(data?.results ?? []);
}

async function upsertTickerMetrics(
  supabase: any,
  symbol: string,
  metrics: MetricBundle,
  requestId: string,
) {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (metrics.avgDollarVolume30d !== null) {
    updates.avg_daily_dollar_volume_30d = metrics.avgDollarVolume30d;
  }
  if (metrics.atr14 !== null) updates.atr_14d = metrics.atr14;
  if (metrics.trueRangePct14 !== null) {
    updates.true_range_pct = metrics.trueRangePct14;
  }
  if (metrics.betaVsSpy !== null) updates.beta_vs_spy = metrics.betaVsSpy;

  if (Object.keys(updates).length <= 1) {
    console.log(
      `[${requestId}] Skipping ticker_universe update for ${symbol}: no metric deltas`,
    );
    return;
  }

  const { error } = await supabase
    .from("ticker_universe")
    .update(updates)
    .eq("symbol", symbol);

  if (error) {
    console.error(
      `[${requestId}] ❌ Failed to update ticker_universe for ${symbol}:`,
      error,
    );
  } else {
    console.log(
      `[${requestId}] 🔄 Updated ticker_universe metrics for ${symbol}`,
    );
  }
}

// Technical indicator calculation functions
function calculateRSI(prices: number[]): number {
  if (prices.length < 2) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / (prices.length - 1);
  const avgLoss = losses / (prices.length - 1);

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    returns.length;

  return Math.sqrt(variance) * 100; // Convert to percentage
}
