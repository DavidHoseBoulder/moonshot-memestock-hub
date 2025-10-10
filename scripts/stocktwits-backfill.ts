/**
 * StockTwits backfill helper
 *
 * Usage examples:
 *
 *   ST_BACKFILL_START_DATE=2025-09-10 \
 *   ST_BACKFILL_END_DATE=2025-09-17 \
 *   ST_BACKFILL_PER_DAY=200 \
 *   ST_BACKFILL_SKIP_SYMBOLS="A,AAPL,AI" \
 *   ST_BACKFILL_CHUNK_SIZE=40 \
 *   ST_BACKFILL_CHUNK_DELAY_MS=60000 \
 *   npx ts-node --esm scripts/stocktwits-backfill.ts
 *
 *   # CLI args override env vars (same names without ST_BACKFILL_ prefix and
 *   # in kebab-case, e.g. --start-date / --end-date / --per-day / --chunk-size).
 *   npx ts-node --esm scripts/stocktwits-backfill.ts \
 *     --start-date 2025-08-01 --end-date 2025-08-05 --per-day 100
 *
 * Supported env/CLI knobs:
 *   ST_BACKFILL_START_DATE / --start-date       (YYYY-MM-DD, required)
 *   ST_BACKFILL_END_DATE   / --end-date         (YYYY-MM-DD, inclusive, required)
 *   ST_BACKFILL_PER_DAY    / --per-day          (default 150)
 *   ST_BACKFILL_MAX_SYMBOLS/ --max-symbols      (cap processed symbols)
 *   ST_BACKFILL_SKIP_SYMBOLS / --skip-symbols   (comma list)
 *   ST_BACKFILL_CHUNK_SIZE / --chunk-size       (symbols per batch)
 *   ST_BACKFILL_CHUNK_DELAY_MS / --chunk-delay-ms (delay between batches)
 *   ST_BACKFILL_PAGE_DELAY_MS, ST_BACKFILL_SYMBOL_DELAY_MS, ST_BACKFILL_FETCH_RETRIES
 */

import { createClient } from '@supabase/supabase-js';

type SentimentLabel = 'Bullish' | 'Bearish' | null;

interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  user?: {
    followers?: number;
  };
  symbols?: Array<{ symbol?: string }>;
  sentiment?: {
    basic?: 'Bullish' | 'Bearish';
  };
  entities?: {
    sentiment?: {
      basic?: 'Bullish' | 'Bearish';
    };
  };
}

interface SentimentSummary {
  total_messages: number;
  bullish_messages: number;
  bearish_messages: number;
  neutral_messages: number;
  bullish_ratio: number;
  bearish_ratio: number;
  net_sentiment: number;
  sentiment_score: number;
  confidence_score: number;
  follower_sum: number;
}

const STOCKTWITS_API_BASE = 'https://api.stocktwits.com/api/2/streams/symbol';
const MAX_PER_REQUEST = 25;
const MAX_MESSAGES_PER_SYMBOL = 200;
const MAX_FOLLOWER_WEIGHT = 10_000;
const MAX_METADATA_MESSAGES = 50;
const PAGINATION_DELAY_MS = Number(process.env.ST_BACKFILL_PAGE_DELAY_MS || 800);
const SYMBOL_DELAY_MS = Number(process.env.ST_BACKFILL_SYMBOL_DELAY_MS || 1200);
const FETCH_TIMEOUT_MS = Number(process.env.ST_BACKFILL_FETCH_TIMEOUT_MS || 20_000);
const MAX_PAGES_PER_DAY = Number(process.env.ST_BACKFILL_MAX_PAGES_PER_DAY || 600);

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sentimentValue(label: SentimentLabel): number {
  if (label === 'Bullish') return 1;
  if (label === 'Bearish') return -1;
  return 0;
}

function getLabel(message: StockTwitsMessage): SentimentLabel {
  return message.entities?.sentiment?.basic || message.sentiment?.basic || null;
}

function summarise(messages: StockTwitsMessage[]): SentimentSummary {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  let weightedScore = 0;
  let weightTotal = 0;
  let followerSum = 0;

  for (const msg of messages) {
    const label = getLabel(msg);
    if (label === 'Bullish') bullish += 1;
    else if (label === 'Bearish') bearish += 1;
    else neutral += 1;

    const followers = Math.max(0, Number(msg.user?.followers) || 0);
    followerSum += followers;
    const weightBoost = Math.min(followers, MAX_FOLLOWER_WEIGHT) / MAX_FOLLOWER_WEIGHT;
    const baseWeight = 1 + weightBoost;
    weightedScore += sentimentValue(label) * baseWeight;
    weightTotal += baseWeight;
  }

  const total = messages.length;
  const sentiment_score = weightTotal === 0 ? 0 : Number((weightedScore / weightTotal).toFixed(4));
  const bullish_ratio = total === 0 ? 0 : Number((bullish / total).toFixed(4));
  const bearish_ratio = total === 0 ? 0 : Number((bearish / total).toFixed(4));
  const net_sentiment = total === 0 ? 0 : Number(((bullish - bearish) / total).toFixed(4));
  const coverageComponent = Math.min(1, total / 30);
  const followerComponent = Math.min(1, followerSum / (2 * MAX_FOLLOWER_WEIGHT));
  const confidence_score = Number((coverageComponent * 0.7 + followerComponent * 0.3).toFixed(4));

  return {
    total_messages: total,
    bullish_messages: bullish,
    bearish_messages: bearish,
    neutral_messages: neutral,
    bullish_ratio,
    bearish_ratio,
    net_sentiment,
    sentiment_score,
    confidence_score,
    follower_sum: followerSum,
  };
}

function withinWindow(timestamp: number, windowStart: number, windowEnd: number): boolean {
  return timestamp >= windowStart && timestamp < windowEnd;
}

function parseSymbolList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(v => v.trim().toUpperCase())
    .filter(Boolean);
}

function addDays(base: Date, delta: number): Date {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

async function fetchSymbols(): Promise<string[]> {
  const override = parseSymbolList(process.env.ST_BACKFILL_SYMBOLS);
  if (override.length > 0) return override;

  // Pull the curated ticker universe and respect the active flag so backfills skip disabled symbols.
  const { data, error } = await supabase
    .from('ticker_universe')
    .select('symbol')
    .eq('active', true)
    .order('symbol', { ascending: true });

  if (error) {
    console.warn('Falling back to short symbol list because ticker_universe query failed:', error.message);
    return ['AAPL', 'TSLA', 'NVDA'];
  }

  return (data ?? []).map(({ symbol }) => String(symbol).toUpperCase());
}

interface FetchResult {
  messages: StockTwitsMessage[];
  nextCursor?: number;
}

async function fetchMessagesForDay(
  symbol: string,
  windowStart: number,
  windowEnd: number,
  perDayLimit: number,
  startCursor?: number,
): Promise<FetchResult> {
  const messages: StockTwitsMessage[] = [];
  let maxId: number | undefined = startCursor;
  let pageCount = 0;
  const maxMessages = Math.min(perDayLimit, MAX_MESSAGES_PER_SYMBOL);
  const maxRetries = Number(process.env.ST_BACKFILL_FETCH_RETRIES || 3);

  while (messages.length < maxMessages) {
    if (pageCount >= MAX_PAGES_PER_DAY) {
      console.warn(`[${symbol}] hit per-day page cap (${MAX_PAGES_PER_DAY}); stopping with ${messages.length} messages collected.`);
      break;
    }
    pageCount += 1;

    const batchSize = Math.min(MAX_PER_REQUEST, maxMessages - messages.length);
    const url = new URL(`${STOCKTWITS_API_BASE}/${symbol}.json`);
    url.searchParams.set('limit', String(batchSize));
    if (maxId) url.searchParams.set('max', String(maxId));

    let response: Response | null = null;
    let payload: { messages?: StockTwitsMessage[] } | null = null;
    let lastStatus: number | string | null = null;
    let lastError: unknown = null;

    console.log(`[${symbol}] page ${pageCount} (collected ${messages.length}/${maxMessages}, cursor=${maxId ?? 'latest'})`);

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      if (attempt > 0) {
        console.log(`[${symbol}] fetch retry ${attempt + 1}/${maxRetries}`);
      }
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
      try {
        response = await fetch(url.toString(), {
          headers: { 'User-Agent': 'MoonshotBackfill/1.0' },
          signal: controller?.signal,
        });

        lastStatus = response.status;
        if (!response.ok) {
          const backoff = PAGINATION_DELAY_MS * (attempt + 1);
          console.warn(`StockTwits request for ${symbol} returned ${response.status} (attempt ${attempt + 1}/${maxRetries}); retrying in ${backoff}ms`);
          if (attempt === maxRetries - 1) {
            console.warn(`StockTwits request failed for ${symbol} (${response.status})`);
            return { messages, nextCursor: maxId };
          }
          await sleep(backoff);
          continue;
        }

        payload = await response.json() as { messages?: StockTwitsMessage[] };
        break;
      } catch (error) {
        lastError = error;
        const isAbortError = (error as Error)?.name === 'AbortError';
        const reason = isAbortError ? 'timeout' : (error as Error)?.message || error;
        if (attempt === maxRetries - 1) {
          console.warn(`StockTwits fetch error for ${symbol} after ${maxRetries} attempts: ${reason}`);
          return { messages, nextCursor: maxId };
        }
        const backoff = PAGINATION_DELAY_MS * (attempt + 1);
        console.warn(`StockTwits fetch error for ${symbol} (attempt ${attempt + 1}/${maxRetries}): ${reason}. Retrying in ${backoff}ms`);
        await sleep(backoff);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    if (!payload) {
      const statusLabel = lastStatus ?? (lastError instanceof Error ? lastError.message : 'unknown-error');
      console.warn(`Aborting ${symbol} pagination because no payload was retrieved (${statusLabel}).`);
      break;
    }
    const page: StockTwitsMessage[] = Array.isArray(payload?.messages) ? payload.messages : [];
    if (page.length === 0) break;

    for (const msg of page) {
      const ts = new Date(msg.created_at).getTime();
      if (!Number.isFinite(ts)) continue;
      if (withinWindow(ts, windowStart, windowEnd)) {
        messages.push(msg);
        if (messages.length >= maxMessages) break;
      }
    }

    const last = page[page.length - 1];
    maxId = last?.id ? last.id - 1 : undefined;
    const lastTimestamp = last ? new Date(last.created_at).getTime() : Number.NEGATIVE_INFINITY;
    if (!maxId || lastTimestamp < windowStart) break;

    await sleep(PAGINATION_DELAY_MS);
  }

  const seen = new Set<number>();
  const deduped: StockTwitsMessage[] = [];
  for (const msg of messages) {
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    deduped.push(msg);
  }

  return { messages: deduped, nextCursor: maxId };
}

async function upsertDay(symbol: string, windowStart: number, windowEnd: number, messages: StockTwitsMessage[]) {
  if (messages.length === 0) return;

  const stats = summarise(messages);
  const trimmedMessages = messages.slice(0, MAX_METADATA_MESSAGES).map(msg => ({
    id: msg.id,
    created_at: msg.created_at,
    body: msg.body,
    sentiment: getLabel(msg),
    followers: msg.user?.followers ?? null,
  }));
  const metadata = {
    stats,
    sampled_messages: trimmedMessages,
    messages: trimmedMessages,
    sample_size: trimmedMessages.length,
    total_messages: messages.length,
    follower_cap: MAX_FOLLOWER_WEIGHT,
    captured_message_ids: messages.map(msg => msg.id),
    messages_truncated: messages.length > trimmedMessages.length,
  };
  const collectedAt = new Date(windowEnd - 1).toISOString();
  const startISO = new Date(windowStart).toISOString();
  const endISO = new Date(windowEnd).toISOString();

  const { data: existing, error: selectError } = await supabase
    .from('sentiment_history')
    .select('id')
    .eq('source', 'stocktwits')
    .eq('symbol', symbol)
    .gte('collected_at', startISO)
    .lt('collected_at', endISO)
    .limit(1);

  if (selectError) throw selectError;

  if (existing && existing.length > 0) {
    const [{ id }] = existing;
    const { error } = await supabase
      .from('sentiment_history')
      .update({
        sentiment_score: stats.sentiment_score,
        raw_sentiment: stats.net_sentiment,
        confidence_score: stats.confidence_score,
        volume_indicator: stats.total_messages,
        engagement_score: stats.follower_sum,
        metadata,
        collected_at: collectedAt,
        data_timestamp: collectedAt,
        content_snippet: trimmedMessages
          .map(msg => msg.body?.slice(0, 140) || '')
          .filter(Boolean)
          .join(' | ')
          .slice(0, 600) || null,
      })
      .eq('id', id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('sentiment_history')
      .insert({
        symbol,
        source: 'stocktwits',
        sentiment_score: stats.sentiment_score,
        raw_sentiment: stats.net_sentiment,
        confidence_score: stats.confidence_score,
        volume_indicator: stats.total_messages,
        engagement_score: stats.follower_sum,
        metadata,
        collected_at: collectedAt,
        data_timestamp: collectedAt,
        content_snippet: trimmedMessages
          .map(msg => msg.body?.slice(0, 140) || '')
          .filter(Boolean)
          .join(' | ')
          .slice(0, 600) || null,
      });
  if (error) throw error;
}

async function processSymbolBatch(symbols: string[], params: {
  startDate: Date;
  endDate: Date;
  perDayLimit: number;
}) {
  const { startDate, endDate, perDayLimit } = params;

  const symbolCursors = new Map<string, number | undefined>();

  for (let d = new Date(endDate); d >= startDate; d = addDays(d, -1)) {
    const windowStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const windowEnd = windowStart + 24 * 60 * 60 * 1000;
    const windowLabel = new Date(windowStart).toISOString().slice(0, 10);

    console.log(`\n=== Processing ${windowLabel} (${symbols.length} symbols) ===`);

    for (const symbol of symbols) {
      try {
        const cursor = symbolCursors.get(symbol);
        const { messages, nextCursor } = await fetchMessagesForDay(symbol, windowStart, windowEnd, perDayLimit, cursor);
        if (typeof nextCursor === 'number') {
          symbolCursors.set(symbol, nextCursor);
        }
        if (messages.length === 0) {
          console.log(`[${symbol}] no messages`);
        } else {
          await upsertDay(symbol, windowStart, windowEnd, messages);
          console.log(`[${symbol}] stored ${messages.length} messages`);
        }
      } catch (error) {
        console.warn(`[${symbol}] failed:`, (error as Error).message || error);
      }
      await sleep(SYMBOL_DELAY_MS);
    }
  }
}

function chunkSymbols(symbols: string[], size: number): string[][] {
  if (size <= 0) return [symbols];
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += size) {
    chunks.push(symbols.slice(i, i + size));
  }
  return chunks;
}

interface ResolvedConfig {
  startDate: Date;
  endDate: Date;
  perDayLimit: number;
  maxSymbols: number;
  chunkSize: number;
  chunkDelayMs: number;
  skipSymbols: Set<string>;
}

function parseDate(raw: string | undefined, label: string): Date | null {
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }
  return parsed;
}

function parseArgsAndEnv(): ResolvedConfig {
  const args = process.argv.slice(2);
  const argMap = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const key = token.replace(/^--/, '');
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for argument ${token}`);
    }
    argMap.set(key, value);
    i += 1;
  }

  const startDate = parseDate(argMap.get('start-date') || process.env.ST_BACKFILL_START_DATE, 'start-date');
  const endDateInclusive = parseDate(argMap.get('end-date') || process.env.ST_BACKFILL_END_DATE, 'end-date');
  if (!startDate || !endDateInclusive) {
    throw new Error('Must provide start/end dates via --start-date/--end-date or ST_BACKFILL_START_DATE/ST_BACKFILL_END_DATE');
  }
  if (endDateInclusive < startDate) {
    throw new Error(`End date must be on/after start date (start=${startDate.toISOString().slice(0,10)}, end=${endDateInclusive.toISOString().slice(0,10)})`);
  }

  const perDayLimit = Number(argMap.get('per-day') || process.env.ST_BACKFILL_PER_DAY || 150);
  const maxSymbols = Number(argMap.get('max-symbols') || process.env.ST_BACKFILL_MAX_SYMBOLS || 0);
  const chunkSize = Number(argMap.get('chunk-size') || process.env.ST_BACKFILL_CHUNK_SIZE || 0);
  const chunkDelayMs = Number(argMap.get('chunk-delay-ms') || process.env.ST_BACKFILL_CHUNK_DELAY_MS || 60_000);
  const skipSymbols = new Set(parseSymbolList(argMap.get('skip-symbols') || process.env.ST_BACKFILL_SKIP_SYMBOLS));

  return {
    startDate,
    endDate: endDateInclusive,
    perDayLimit,
    maxSymbols,
    chunkSize,
    chunkDelayMs,
    skipSymbols,
  };
}

async function run() {
  const { startDate, endDate, perDayLimit, maxSymbols, chunkSize, chunkDelayMs, skipSymbols } = parseArgsAndEnv();

  let symbols = await fetchSymbols();
  if (skipSymbols.size > 0) {
    symbols = symbols.filter(symbol => !skipSymbols.has(symbol));
  }
  if (maxSymbols > 0) {
    symbols = symbols.slice(0, maxSymbols);
  }

  if (symbols.length === 0) {
    console.warn('No symbols to process.');
    return;
  }

  const batches = chunkSymbols(symbols, chunkSize > 0 ? chunkSize : symbols.length);

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    console.log(`\n>>> Batch ${i + 1}/${batches.length}: ${batch.join(', ')}`);
    await processSymbolBatch(batch, { startDate, endDate, perDayLimit });
    if (i < batches.length - 1 && chunkDelayMs > 0) {
      console.log(`\nPausing ${chunkDelayMs}ms before next batch...`);
      await sleep(chunkDelayMs);
    }
  }
}

run()
  .then(() => {
    console.log('\nBackfill complete.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
