
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BatchConfig {
  limitPerDay: number;
  days: number;
  chunkSize: number;
  chunkDelayMs: number;
  symbolDelayMs: number;
  fetchRetries: number;
  symbols?: string[];
  skipSymbols?: string[];
}

interface ProcessingReport {
  totalSymbols: number;
  processedSymbols: number;
  rowsInserted: number;
  rowsUpdated: number;
  failures: Array<{ symbol: string; error: string }>;
  chunksProcessed: number;
  processingTimeMs: number;
}

type SentimentLabel = 'Bullish' | 'Bearish' | null;

interface StockTwitsSymbolRef {
  symbol: string;
}

interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  user?: {
    username?: string;
    followers?: number;
    like_count?: number;
  };
  symbols?: StockTwitsSymbolRef[];
  sentiment?: {
    basic: 'Bullish' | 'Bearish';
  };
  entities?: {
    sentiment?: {
      basic: 'Bullish' | 'Bearish';
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

const MAX_FOLLOWER_WEIGHT = 10000;

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load symbols from symbol_disambig for broader coverage
async function loadSymbolsFromDatabase(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('symbol_disambig')
      .select('symbol')
      .order('symbol')
    
    if (error) {
      console.warn('Failed to load symbols from symbol_disambig:', error)
      return ['AAPL', 'TSLA', 'NVDA'] // fallback
    }
    
    return data.map(row => row.symbol)
  } catch (e) {
    console.warn('Error loading symbols:', e)
    return ['AAPL', 'TSLA', 'NVDA'] // fallback
  }
}

// Canonical tickers derived from Supabase ticker_universe (cold start)
const SUPA_URL_T = Deno.env.get('SUPABASE_URL')!
const SUPA_KEY_T = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supaTickers = createClient(SUPA_URL_T, SUPA_KEY_T)
let CANONICAL_TICKERS: string[] = []
try {
  const { data, error } = await supaTickers
    .from('ticker_universe')
    .select('symbol')
    .eq('active', true)
    .order('priority', { ascending: true })
    .order('symbol', { ascending: true })
  if (!error && data) CANONICAL_TICKERS = (data as any[]).map(r => String(r.symbol).toUpperCase())
} catch (e: any) {
  console.warn('stocktwits-data: failed to load ticker_universe', e?.message || e)
}
const SHORT_TICKERS = CANONICAL_TICKERS.filter(t => t.length <= 3)
const LONG_TICKERS = CANONICAL_TICKERS.filter(t => t.length > 3)
const SHORT_REGEX = CANONICAL_TICKERS.length ? new RegExp(`(^|\\W)(\\$(?:${SHORT_TICKERS.join('|')}))(\\W|$)`, 'gi') : /a^/i
const LONG_REGEX = CANONICAL_TICKERS.length ? new RegExp(`(^|\\W)(${LONG_TICKERS.join('|')})(\\W|$)`, 'gi') : /a^/i
function extractTickers(text: string): string[] {
  if (!text) return []
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = SHORT_REGEX.exec(text)) !== null) {
    const sym = m[2].replace('$','').toUpperCase()
    if (CANONICAL_TICKERS.includes(sym)) found.add(sym)
  }
  while ((m = LONG_REGEX.exec(text)) !== null) {
    const sym = (m[2] || '').toUpperCase()
    if (CANONICAL_TICKERS.includes(sym)) found.add(sym)
  }
  SHORT_REGEX.lastIndex = 0; LONG_REGEX.lastIndex = 0
  return Array.from(found)
}

// Backoff-aware fetch helper
async function fetchWithBackoff(url: string, init: RequestInit = {}, maxRetries = 3, baseDelayMs = 1000): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.ok || attempt >= maxRetries || (res.status < 500 && res.status !== 429)) return res;
    const retryAfter = Number(res.headers.get('retry-after'));
    const jitter = Math.floor(Math.random() * 250);
    const delay = retryAfter ? retryAfter * 1000 : baseDelayMs * Math.pow(2, attempt) + jitter;
    console.warn(`Backoff for ${delay}ms (status ${res.status}) -> ${url}`);
    await new Promise(r => setTimeout(r, delay));
    attempt++;
  }
}

function getSentimentLabel(message: StockTwitsMessage): SentimentLabel {
  return message.entities?.sentiment?.basic || message.sentiment?.basic || null;
}

function sentimentValue(label: SentimentLabel): number {
  if (label === 'Bullish') return 1;
  if (label === 'Bearish') return -1;
  return 0;
}

function summarizeMessages(messages: StockTwitsMessage[]): SentimentSummary {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  let weightedScore = 0;
  let weightTotal = 0;
  let followerSum = 0;

  for (const message of messages) {
    const label = getSentimentLabel(message);
    if (label === 'Bullish') bullish += 1;
    else if (label === 'Bearish') bearish += 1;
    else neutral += 1;

    const followers = Math.max(0, Number(message.user?.followers) || 0);
    followerSum += followers;
    const weightBoost = Math.min(followers, MAX_FOLLOWER_WEIGHT) / MAX_FOLLOWER_WEIGHT;
    const baseWeight = 1 + weightBoost;
    const sentimentScore = sentimentValue(label);
    weightedScore += sentimentScore * baseWeight;
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

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function withinWindow(timestamp: number, windowStart: number, windowEnd: number): boolean {
  return timestamp >= windowStart && timestamp < windowEnd;
}

// Fetch messages for a symbol for a specific day window
async function fetchMessagesForDay(symbol: string, windowStart: number, windowEnd: number, perDayLimit: number, maxRetries: number): Promise<StockTwitsMessage[]> {
  const messages: StockTwitsMessage[] = [];
  let maxId: number | undefined;
  const maxMessages = Math.min(perDayLimit, 200);
  const batchSize = Math.min(25, maxMessages);

  while (messages.length < maxMessages) {
    const url = new URL(`https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`);
    url.searchParams.set('limit', String(Math.min(batchSize, maxMessages - messages.length)));
    if (maxId) url.searchParams.set('max', String(maxId));

    let response: Response | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await fetch(url.toString(), {
          headers: { 'User-Agent': 'Financial-Pipeline/1.0' },
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
      const backoff = 800 * (attempt + 1);
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

    await sleep(800); // Pagination delay
  }

  // Dedupe by id
  const seen = new Set<number>();
  const deduped: StockTwitsMessage[] = [];
  for (const msg of messages) {
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    deduped.push(msg);
  }

  return deduped;
}


// Upsert sentiment data for a specific day
async function upsertDay(symbol: string, windowStart: number, windowEnd: number, messages: StockTwitsMessage[]): Promise<boolean> {
  if (messages.length === 0) return false;

  const stats = summarizeMessages(messages);
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
    return false; // updated
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
  return true; // inserted
}

// Process a single symbol for all days in the window
async function processSymbol(symbol: string, config: BatchConfig): Promise<{ inserted: number; updated: number; error?: string }> {
  const todayStart = startOfUTCDay(new Date());
  let inserted = 0;
  let updated = 0;

  try {
    for (let dayOffset = 1; dayOffset <= config.days; dayOffset++) {
      const windowEnd = todayStart.getTime() - (dayOffset - 1) * 24 * 60 * 60 * 1000;
      const windowStart = windowEnd - 24 * 60 * 60 * 1000;
      
      const messages = await fetchMessagesForDay(symbol, windowStart, windowEnd, config.limitPerDay, config.fetchRetries);
      const wasInserted = await upsertDay(symbol, windowStart, windowEnd, messages);
      
      if (wasInserted) inserted++;
      else updated++;
    }
    
    return { inserted, updated };
  } catch (error: any) {
    return { inserted, updated, error: error.message || error };
  }
}

// Process symbols in chunks
async function processSymbolBatch(symbols: string[], config: BatchConfig): Promise<ProcessingReport> {
  const startTime = Date.now();
  const report: ProcessingReport = {
    totalSymbols: symbols.length,
    processedSymbols: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    failures: [],
    chunksProcessed: 0,
    processingTimeMs: 0
  };

  // Create chunks
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += config.chunkSize) {
    chunks.push(symbols.slice(i, i + config.chunkSize));
  }

  console.log(`Processing ${symbols.length} symbols in ${chunks.length} chunks of size ${config.chunkSize}`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Processing chunk ${i + 1}/${chunks.length}: ${chunk.join(', ')}`);

    for (const symbol of chunk) {
      const result = await processSymbol(symbol, config);
      
      if (result.error) {
        report.failures.push({ symbol, error: result.error });
        console.warn(`[${symbol}] failed: ${result.error}`);
      } else {
        report.processedSymbols++;
        report.rowsInserted += result.inserted;
        report.rowsUpdated += result.updated;
        console.log(`[${symbol}] processed: ${result.inserted} inserted, ${result.updated} updated`);
      }
      
      await sleep(config.symbolDelayMs);
    }

    report.chunksProcessed++;
    
    // Delay between chunks (except for the last one)
    if (i < chunks.length - 1) {
      console.log(`Chunk delay: ${config.chunkDelayMs}ms`);
      await sleep(config.chunkDelayMs);
    }
  }

  report.processingTimeMs = Date.now() - startTime;
  return report;
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    // Parse configuration with defaults
    const config: BatchConfig = {
      limitPerDay: Math.min(body.limitPerDay || 150, 200),
      days: Math.max(1, body.days || 1),
      chunkSize: Math.max(1, body.chunkSize || 15),
      chunkDelayMs: Math.max(0, body.chunkDelayMs || 90_000),
      symbolDelayMs: Math.max(0, body.symbolDelayMs || 1_800),
      fetchRetries: Math.max(1, body.fetchRetries || 3),
      symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
      skipSymbols: Array.isArray(body.skipSymbols) ? body.skipSymbols : undefined
    };

    console.log(`StockTwits batch processing config:`, config);

    // Get symbol list
    let symbols: string[];
    if (config.symbols) {
      symbols = config.symbols.map(s => String(s).toUpperCase());
    } else {
      symbols = await loadSymbolsFromDatabase();
    }

    // Apply skip list
    if (config.skipSymbols && config.skipSymbols.length > 0) {
      const skipSet = new Set(config.skipSymbols.map(s => String(s).toUpperCase()));
      symbols = symbols.filter(symbol => !skipSet.has(symbol));
    }

    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No symbols to process' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${symbols.length} symbols over ${config.days} day(s), ${config.limitPerDay} messages/day`);

    // Process all symbols in batches
    const report = await processSymbolBatch(symbols, config);

    console.log(`Batch processing complete:`, report);

    return new Response(
      JSON.stringify(report),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error in StockTwits batch function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error),
        totalSymbols: 0,
        processedSymbols: 0,
        rowsInserted: 0,
        rowsUpdated: 0,
        failures: [],
        chunksProcessed: 0,
        processingTimeMs: 0
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
