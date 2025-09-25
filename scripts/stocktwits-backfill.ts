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
  sentiment_score: number;
  confidence_score: number;
  follower_sum: number;
}

const STOCKTWITS_API_BASE = 'https://api.stocktwits.com/api/2/streams/symbol';
const MAX_PER_REQUEST = 25;
const MAX_MESSAGES_PER_SYMBOL = 200;
const MAX_FOLLOWER_WEIGHT = 10_000;
const PAGINATION_DELAY_MS = Number(process.env.ST_BACKFILL_PAGE_DELAY_MS || 800);
const SYMBOL_DELAY_MS = Number(process.env.ST_BACKFILL_SYMBOL_DELAY_MS || 1200);

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

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
  const coverageComponent = Math.min(1, total / 30);
  const followerComponent = Math.min(1, followerSum / (2 * MAX_FOLLOWER_WEIGHT));
  const confidence_score = Number((coverageComponent * 0.7 + followerComponent * 0.3).toFixed(4));

  return {
    total_messages: total,
    bullish_messages: bullish,
    bearish_messages: bearish,
    neutral_messages: neutral,
    bullish_ratio,
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

async function fetchSymbols(): Promise<string[]> {
  const override = parseSymbolList(process.env.ST_BACKFILL_SYMBOLS);
  if (override.length > 0) return override;

  const { data, error } = await supabase
    .from('symbol_disambig')
    .select('symbol')
    .order('symbol', { ascending: true });

  if (error) {
    console.warn('Falling back to short symbol list because symbol_disambig query failed:', error.message);
    return ['AAPL', 'TSLA', 'NVDA'];
  }

  return data.map(({ symbol }) => String(symbol).toUpperCase());
}

async function fetchMessagesForDay(symbol: string, windowStart: number, windowEnd: number, perDayLimit: number): Promise<StockTwitsMessage[]> {
  const messages: StockTwitsMessage[] = [];
  let maxId: number | undefined;
  const maxMessages = Math.min(perDayLimit, MAX_MESSAGES_PER_SYMBOL);
  const maxRetries = Number(process.env.ST_BACKFILL_FETCH_RETRIES || 3);

  while (messages.length < maxMessages) {
    const batchSize = Math.min(MAX_PER_REQUEST, maxMessages - messages.length);
    const url = new URL(`${STOCKTWITS_API_BASE}/${symbol}.json`);
    url.searchParams.set('limit', String(batchSize));
    if (maxId) url.searchParams.set('max', String(maxId));

    let response: Response | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        response = await fetch(url.toString(), {
          headers: { 'User-Agent': 'MoonshotBackfill/1.0' },
        });
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
      }

      if (response && response.ok) break;
      const status = response?.status ?? 'network-error';
      if (attempt === maxRetries - 1) {
        console.warn(`StockTwits request failed for ${symbol} (${status})`);
        return messages;
      }
      const backoff = PAGINATION_DELAY_MS * (attempt + 1);
      await sleep(backoff);
    }

    if (!response) break;

    const payload = await response.json() as { messages?: StockTwitsMessage[] };
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

  return deduped;
}

async function upsertDay(symbol: string, windowStart: number, windowEnd: number, messages: StockTwitsMessage[]) {
  if (messages.length === 0) return;

  const stats = summarise(messages);
  const metadata = { messages, stats };
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
        confidence_score: stats.confidence_score,
        metadata,
        collected_at: collectedAt,
        data_timestamp: collectedAt,
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
      confidence_score: stats.confidence_score,
      metadata,
      collected_at: collectedAt,
      data_timestamp: collectedAt,
    });
  if (error) throw error;
}

async function processSymbolBatch(symbols: string[], params: {
  daysBack: number;
  perDayLimit: number;
}) {
  const { daysBack, perDayLimit } = params;
  const todayStart = startOfUTCDay(new Date());

  for (let dayOffset = 1; dayOffset <= daysBack; dayOffset += 1) {
    const windowEnd = todayStart.getTime() - (dayOffset - 1) * 24 * 60 * 60 * 1000;
    const windowStart = windowEnd - 24 * 60 * 60 * 1000;
    const windowLabel = new Date(windowStart).toISOString().slice(0, 10);

    console.log(`\n=== Processing ${windowLabel} (${symbols.length} symbols) ===`);

    for (const symbol of symbols) {
      try {
        const messages = await fetchMessagesForDay(symbol, windowStart, windowEnd, perDayLimit);
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

async function run() {
  const daysBack = Number(process.env.ST_BACKFILL_DAYS || 7);
  const perDayLimit = Number(process.env.ST_BACKFILL_PER_DAY || 150);
  const maxSymbols = Number(process.env.ST_BACKFILL_MAX_SYMBOLS || 0);
  const chunkSize = Number(process.env.ST_BACKFILL_CHUNK_SIZE || 0);
  const chunkDelayMs = Number(process.env.ST_BACKFILL_CHUNK_DELAY_MS || 60_000);
  const skipSymbols = new Set(parseSymbolList(process.env.ST_BACKFILL_SKIP_SYMBOLS));

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
    await processSymbolBatch(batch, { daysBack, perDayLimit });
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
