import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const finnhubToken = Deno.env.get("FINNHUB_API_KEY") || Deno.env.get("FINNHUB_TOKEN") || "";
const logHttp = (Deno.env.get("ENABLE_HTTP_LOGGING") || "false").toLowerCase() === "true";

const supabase = createClient(supabaseUrl, supabaseKey);

interface FinnhubCalendarEntry {
    symbol?: string;
    date?: string;
    hour?: string;
    epsEstimate?: number;
    epsActual?: number;
    epsSurprise?: number;
    epsSurprisePercent?: number;
    revenueEstimate?: number;
    revenueActual?: number;
    revenueSurprise?: number;
    revenueSurprisePercent?: number;
    currency?: string;
    year?: number;
    quarter?: number;
    updated?: string;
    [key: string]: unknown;
}

interface FinnhubNewsEntry {
    id?: number | string;
    datetime?: number;
    headline?: string;
    summary?: string;
    url?: string;
    source?: string;
    category?: string;
    related?: string;
    image?: string;
    [key: string]: unknown;
}

type LiquidityTier = "high" | "medium" | "low" | "all";

interface IngestResults {
    fetched: number;
    processed: number;
    insertedOrUpdated: number;
    skippedInvalid: number;
    skippedPastEvents: number;
    upsertErrors: number;
    stagingErrors: number;
    apiCalls: number;
    newsFetched: number;
    newsProcessed: number;
    newsInsertedOrUpdated: number;
    newsErrors: number;
    newsApiCalls: number;
    tickerUniverseCount: number;
    newsTier: LiquidityTier;
    newsSymbolCount: number;
    newsErrorSamples: string[];
}

function toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function normalizeDate(dateValue?: string): string | null {
    if (!dateValue) return null;

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toISOString().slice(0, 10);
}

function isFutureOrToday(dateValue: string): boolean {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const eventDate = new Date(dateValue);
    eventDate.setUTCHours(0, 0, 0, 0);

    return eventDate >= today;
}

async function fetchFinnhubCalendar(startDate: string, endDate: string): Promise<FinnhubCalendarEntry[]> {
    if (!finnhubToken) {
        throw new Error("Missing Finnhub API token; set FINNHUB_API_KEY or FINNHUB_TOKEN.");
    }

    const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
    url.searchParams.set("from", startDate);
    url.searchParams.set("to", endDate);
    url.searchParams.set("token", finnhubToken);

    const response = await fetch(url.toString(), {
        headers: {
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Finnhub calendar request failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as { earningsCalendar?: FinnhubCalendarEntry[] };
    return payload.earningsCalendar ?? [];
}

async function stageCalendarEntries(entries: FinnhubCalendarEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const stagingRows = entries
        .map((entry) => {
            const symbol = entry.symbol?.toUpperCase();
            const reportDate = normalizeDate(entry.date);
            if (!symbol || !reportDate) return null;

            return {
                ticker: symbol,
                reportdate: reportDate,
                fiscalyear: entry.year ?? null,
                fiscalquarter: entry.quarter ?? null,
                epsactual: entry.epsActual ?? null,
                epsestimate: entry.epsEstimate ?? null,
                epssurprisepct: entry.epsSurprisePercent ?? null,
                announcetime: entry.hour ?? null,
                updatedat: entry.updated ?? new Date().toISOString(),
                raw: entry as Record<string, unknown>,
            };
        })
        .filter((row): row is Record<string, unknown> => row !== null);

    if (stagingRows.length === 0) return;

    const { error } = await supabase
        .from("finnhub_earnings_current")
        .upsert(stagingRows, { onConflict: "ticker,reportdate" });

    if (error) {
        console.warn("Unable to stage Finnhub earnings snapshot:", error);
    }
}

async function upsertCatalystEvents(entries: FinnhubCalendarEntry[], results: IngestResults) {
    for (const entry of entries) {
        results.processed += 1;

        const symbol = entry.symbol?.toUpperCase();
        const reportDate = normalizeDate(entry.date);

        if (!symbol || !reportDate) {
            results.skippedInvalid += 1;
            continue;
        }

        if (!isFutureOrToday(reportDate)) {
            results.skippedPastEvents += 1;
            continue;
        }

        const upsertPayload = {
            symbol,
            event_date: reportDate,
            event_type: "EARNINGS",
            source: "FINNHUB",
            headline_id: "EARNINGS",
            report_time: entry.hour ?? null,
            fiscal_year: entry.year ?? null,
            fiscal_quarter: entry.quarter ?? null,
            eps_actual: entry.epsActual ?? null,
            eps_estimate: entry.epsEstimate ?? null,
            eps_surprise_pct: entry.epsSurprisePercent ?? entry.epsSurprise ?? null,
            raw_payload: entry as Record<string, unknown>,
            updated_at: entry.updated ?? new Date().toISOString(),
        };

        const { error } = await supabase.from("catalyst_events").upsert(upsertPayload, {
            onConflict: "symbol,event_date,event_type,source,headline_id",
        });

        if (error) {
            results.upsertErrors += 1;
            console.error(`Failed to upsert catalyst event for ${symbol} (${reportDate}):`, error);
        } else {
            results.insertedOrUpdated += 1;
        }
    }
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyLiquidityTier(advDollarVolume?: number | null): LiquidityTier {
    if (advDollarVolume === null || advDollarVolume === undefined) {
        return "low";
    }
    if (advDollarVolume >= 100_000_000) return "high";
    if (advDollarVolume >= 20_000_000) return "medium";
    return "low";
}

async function fetchActiveSymbols(tier: LiquidityTier, limit?: number): Promise<string[]> {
    const { data, error } = await supabase
        .from<{ symbol: string; avg_daily_dollar_volume_30d: number | null }>("ticker_universe_active")
        .select("symbol, avg_daily_dollar_volume_30d")
        .order("avg_daily_dollar_volume_30d", { ascending: false });

    if (error) {
        console.warn("Failed to load active symbols:", error);
        return [];
    }

    const filtered: string[] = [];
    for (const row of data ?? []) {
        const symbol = row.symbol?.toUpperCase();
        if (!symbol) continue;

        const liquidityTier = classifyLiquidityTier(row.avg_daily_dollar_volume_30d);
        if (tier !== "all" && liquidityTier !== tier) {
            continue;
        }

        filtered.push(symbol);
        if (limit && filtered.length >= limit) break;
    }

    return filtered;
}

async function fetchFinnhubCompanyNews(
    symbol: string,
    from: string,
    to: string,
    retryAttempt = 0,
): Promise<FinnhubNewsEntry[]> {
    if (!finnhubToken) {
        throw new Error("Missing Finnhub API token; set FINNHUB_API_KEY or FINNHUB_TOKEN.");
    }

    const url = new URL("https://finnhub.io/api/v1/company-news");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("token", finnhubToken);

    const response = await fetch(url.toString(), {
        headers: {
            Accept: "application/json",
        },
    });

    if (logHttp) {
        console.log("Finnhub news request", {
            symbol,
            from,
            to,
            status: response.status,
            tier: retryAttempt,
            url: url.toString(),
        });
    }

    if (response.status === 429 && retryAttempt < 3) {
        const backoffMs = 500 * (retryAttempt + 1);
        console.warn(`Finnhub news rate limit hit for ${symbol}; retrying in ${backoffMs}ms`);
        await delay(backoffMs);
        return fetchFinnhubCompanyNews(symbol, from, to, retryAttempt + 1);
    }

    if (!response.ok) {
        const text = await response.text();
        console.warn(`Finnhub news request failed for ${symbol} (${response.status}): ${text}`);
        return [];
    }

    const payload = (await response.json()) as FinnhubNewsEntry[];
    return payload ?? [];
}

async function upsertNewsEvents(symbol: string, entries: FinnhubNewsEntry[], results: IngestResults): Promise<void> {
    for (const entry of entries) {
        results.newsProcessed += 1;

        const headlineId = entry.id !== undefined && entry.id !== null ? String(entry.id) : undefined;
        const publishedAt = typeof entry.datetime === "number" ? new Date(entry.datetime * 1000) : undefined;
        const eventDate = publishedAt ? toDateString(publishedAt) : undefined;

        if (!headlineId || !publishedAt || !eventDate) {
            continue;
        }

        const upsertPayload = {
            symbol,
            event_date: eventDate,
            event_type: "NEWS",
            source: "FINNHUB",
            headline_id: headlineId,
            headline: entry.headline ?? null,
            summary: entry.summary ?? null,
            url: entry.url ?? null,
            publisher: entry.source ?? null,
            published_at: publishedAt.toISOString(),
            raw_payload: entry as Record<string, unknown>,
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
            .from("catalyst_events")
            .upsert(upsertPayload, {
                onConflict: "symbol,event_date,event_type,source,headline_id",
                ignoreDuplicates: true,
            });

        if (error) {
            results.newsErrors += 1;
            console.error(`Failed to upsert news event for ${symbol} (headline ${headlineId}):`, error);
            if (results.newsErrorSamples.length < 5) {
                results.newsErrorSamples.push(
                    JSON.stringify({
                        symbol,
                        headlineId,
                        message: error.message ?? "unknown error",
                        details: (error as { details?: unknown }).details ?? null,
                        hint: (error as { hint?: unknown }).hint ?? null,
                    }),
                );
            }
        } else {
            results.newsInsertedOrUpdated += 1;
        }
    }
}

Deno.serve(async (req) => {
    if (!supabaseUrl || !supabaseKey) {
        const message = "Missing Supabase credentials; ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.";
        console.error(message);
        return new Response(JSON.stringify({ error: message }), { status: 500 });
    }

    try {
        const url = new URL(req.url);
        const tierParam = (url.searchParams.get("tier") || "high").toLowerCase();
        const limitParam = url.searchParams.get("limit");
        const modeParam = (url.searchParams.get("mode") || "full").toLowerCase();
        const horizonParam = url.searchParams.get("horizon_days");
        const liquidityTier: LiquidityTier =
            tierParam === "medium" || tierParam === "low" || tierParam === "all" ? (tierParam as LiquidityTier) : "high";
        const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
        const newsLimit = parsedLimit && !Number.isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
        const parsedHorizon = horizonParam ? Number.parseInt(horizonParam, 10) : undefined;
        const horizonDays = parsedHorizon && !Number.isNaN(parsedHorizon) && parsedHorizon > 0 ? parsedHorizon : 21;
        const newsOnly = modeParam === "news";

        console.log("Finnhub catalyst ingest invoked", {
            tier: liquidityTier,
            limit: newsLimit,
            mode: newsOnly ? "news-only" : "full",
            horizonDays,
            url: req.url,
        });

        const today = new Date();
        const horizon = new Date(today);
        horizon.setDate(horizon.getDate() + horizonDays);

        const results: IngestResults = {
            fetched: 0,
            processed: 0,
            insertedOrUpdated: 0,
            skippedInvalid: 0,
            skippedPastEvents: 0,
            upsertErrors: 0,
            stagingErrors: 0,
            apiCalls: 0,
            newsFetched: 0,
            newsProcessed: 0,
            newsInsertedOrUpdated: 0,
            newsErrors: 0,
            newsApiCalls: 0,
            tickerUniverseCount: 0,
            newsTier: liquidityTier,
            newsSymbolCount: 0,
            newsErrorSamples: [],
        };

    console.time("earnings-fetch");
    const CHUNK_DAYS = 7;
    const entriesMap = new Map<string, FinnhubCalendarEntry>();
    const cursor = new Date(today);
        const windowStart = toDateString(today);
        const windowEnd = toDateString(horizon);

        if (!newsOnly) {
            while (cursor <= horizon) {
                const chunkStart = new Date(cursor);
                const chunkEnd = new Date(cursor);
                chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS - 1);
                if (chunkEnd > horizon) {
                    chunkEnd.setTime(horizon.getTime());
                }

                const chunkFrom = toDateString(chunkStart);
                const chunkTo = toDateString(chunkEnd);

                const chunkEntries = await fetchFinnhubCalendar(chunkFrom, chunkTo);
                results.apiCalls += 1;
                results.fetched += chunkEntries.length;

                for (const entry of chunkEntries) {
                    const symbol = entry.symbol?.toUpperCase();
                    const reportDate = normalizeDate(entry.date);
                    if (!symbol || !reportDate) continue;
                    const key = `${symbol}|${reportDate}`;
                    entriesMap.set(key, entry);
                }

                cursor.setDate(cursor.getDate() + CHUNK_DAYS);
            }
        }

        const dedupedEntries = Array.from(entriesMap.values());
        if (!newsOnly) {
            console.log(
                `Fetched ${results.fetched} earnings events across ${results.apiCalls} call(s) for window ${windowStart} → ${windowEnd}; ${dedupedEntries.length} unique upcoming events retained.`,
            );
            console.timeEnd("earnings-fetch");

            await stageCalendarEntries(dedupedEntries).catch((error) => {
                results.stagingErrors += 1;
                console.warn("Staging snapshot failed:", error);
            });

            console.time("earnings-upsert");
            await upsertCatalystEvents(dedupedEntries, results);
            console.timeEnd("earnings-upsert");
        } else {
            console.timeEnd("earnings-fetch");
            console.log("Skipping earnings ingestion (news-only mode)");
        }

    const NEWS_LOOKBACK_DAYS = 7;
    const newsFromDateObj = new Date(today);
    newsFromDateObj.setDate(newsFromDateObj.getDate() - NEWS_LOOKBACK_DAYS);
    const newsFromDate = toDateString(newsFromDateObj);
    const newsToDate = toDateString(today);

    const activeSymbols = await fetchActiveSymbols(liquidityTier, newsLimit);
    console.log("Active symbols fetched for news", {
        count: activeSymbols.length,
        tier: liquidityTier,
    });
    results.tickerUniverseCount = activeSymbols.length;
    results.newsSymbolCount = activeSymbols.length;

    console.time("news-fetch");
    for (let index = 0; index < activeSymbols.length; index += 1) {
        const symbol = activeSymbols[index];
        const newsEntries = await fetchFinnhubCompanyNews(symbol, newsFromDate, newsToDate);
        results.newsApiCalls += 1;
        results.newsFetched += newsEntries.length;

        await upsertNewsEvents(symbol, newsEntries, results);

        if ((index + 1) % 45 === 0) {
            await delay(1500);
        }
    }
    console.timeEnd("news-fetch");

        console.log("Finnhub catalyst ingest run complete", results);

        return new Response(JSON.stringify(results), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Finnhub earnings ingest failed:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), { status: 500 });
    }
});
