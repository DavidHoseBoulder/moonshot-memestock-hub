
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// Fetch messages for a symbol within the last N days, with pagination and per-day cap
async function fetchSymbolMessagesForWindow(symbol: string, perDay: number, days: number): Promise<StockTwitsMessage[]> {
  const cutoffTs = Date.now() - days * 24 * 60 * 60 * 1000;
  const maxTotal = Math.min(perDay * days, 200); // hard cap per symbol to be safe
  const batchSize = Math.min(perDay, 25);
  let results: StockTwitsMessage[] = [];
  let nextMaxId: number | undefined;

  while (results.length < maxTotal) {
    const url = `https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json?limit=${batchSize}` + (nextMaxId ? `&max=${nextMaxId}` : '');
    const response = await fetchWithBackoff(url, {
      headers: { 'User-Agent': 'Financial-Pipeline/1.0' }
    }, 3, 1000);

    if (!response.ok) {
      if (response.status === 429) console.warn(`Rate limited while paginating ${symbol}`);
      else console.warn(`Failed page for ${symbol}: ${response.status}`);
      break;
    }

    const data = await response.json();
    const page: StockTwitsMessage[] = Array.isArray(data?.messages) ? data.messages : [];
    if (page.length === 0) break;

    // Keep only messages within the window
    for (const m of page) {
      const t = new Date(m.created_at).getTime();
      if (!Number.isFinite(t)) continue;
      if (t >= cutoffTs) results.push(m);
    }

    const oldest = page[page.length - 1];
    nextMaxId = oldest?.id ? oldest.id - 1 : undefined;
    const oldestTs = oldest ? new Date(oldest.created_at).getTime() : 0;
    if (!nextMaxId || oldestTs < cutoffTs) break;

    // short pause between pages
    await new Promise(r => setTimeout(r, 800));
  }

  // Dedupe by id
  const seen = new Set<number>();
  const deduped: StockTwitsMessage[] = [];
  for (const m of results) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    deduped.push(m);
  }

  return deduped;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

// Check database for recent data within a window (last N days)
async function getRecentSentimentData(symbols: string[], days: number): Promise<{ symbol: string; data: any }[]> {
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('sentiment_history')
    .select('id, symbol, sentiment_score, confidence_score, metadata, collected_at')
    .in('symbol', symbols)
    .eq('source', 'stocktwits')
    .gte('collected_at', windowStart)
    .order('collected_at', { ascending: false })
  
  if (error) {
    console.warn('Database query error:', error)
    return []
  }
  
  // Group by symbol, taking most recent for each
  const symbolMap = new Map()
  data?.forEach(row => {
    if (!symbolMap.has(row.symbol)) {
      symbolMap.set(row.symbol, row)
    }
  })
  
  return Array.from(symbolMap.entries()).map(([symbol, data]) => ({ symbol, data }))
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

const MAX_FOLLOWER_WEIGHT = 10000; // cap so whales do not dominate

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
    const baseWeight = 1 + weightBoost; // keep every message contributing, boost influential authors slightly
    const sentimentScore = sentimentValue(label);
    weightedScore += sentimentScore * baseWeight;
    weightTotal += baseWeight;
  }

  const total = messages.length;
  const sentiment_score = weightTotal === 0 ? 0 : Number((weightedScore / weightTotal).toFixed(4));
  const bullish_ratio = total === 0 ? 0 : Number((bullish / total).toFixed(4));
  const coverageComponent = Math.min(1, total / 30); // saturate after ~30 msgs
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

function mergeStatsIntoMetadata(metadata: any, stats: SentimentSummary) {
  if (!metadata || typeof metadata !== 'object') return { stats };
  return { ...metadata, stats };
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
const { limitPerDay = 25, days = 7 } = body as { limitPerDay?: number; days?: number };

// Load symbols from symbol_disambig table for broader coverage
const symbols = await loadSymbolsFromDatabase()
console.log(`Loaded ${symbols.length} symbols from symbol_disambig table; window=${days}d, perDay=${limitPerDay}`)

    console.log(`Checking database for recent StockTwits data for ${symbols.length} symbols`)
    
    // First, check database for recent data
    const recentData = await getRecentSentimentData(symbols, days)

    // Only consider symbols "covered" if the DB row actually contains cached messages
    const symbolsWithMessages = new Set(
      recentData
        .filter(({ data }) => Array.isArray(data?.metadata?.messages) && data.metadata.messages.length > 0)
        .map(d => d.symbol)
    )

    const symbolsToFetch = symbols.filter(symbol => !symbolsWithMessages.has(symbol))
    
    console.log(`Found ${recentData.length} symbols with recent rows; ${symbolsWithMessages.size} with messages, need to fetch ${symbolsToFetch.length} symbols`)
    
    let allMessages: StockTwitsMessage[] = []
    const backfillPromises: Promise<any>[] = []
    
    // Convert database data to StockTwits message format (only if messages present)
    for (const { symbol, data } of recentData) {
      const messages = Array.isArray(data?.metadata?.messages) ? data.metadata.messages as StockTwitsMessage[] : null
      if (messages && messages.length > 0) {
        allMessages.push(...messages)

        const metadataStats = data?.metadata?.stats
        const storedScore = typeof data?.sentiment_score === 'number' ? data.sentiment_score : null
        const needsBackfill = !metadataStats || typeof metadataStats.sentiment_score !== 'number' || storedScore === 0

        if (needsBackfill) {
          const stats = summarizeMessages(messages)
          const metadata = mergeStatsIntoMetadata(data.metadata, stats)
          backfillPromises.push(
            supabase
              .from('sentiment_history')
              .update({
                sentiment_score: stats.sentiment_score,
                confidence_score: stats.confidence_score,
                metadata
              })
              .eq('id', data.id)
          )
        }
      }
    }
    
    if (backfillPromises.length > 0) {
      await Promise.allSettled(backfillPromises)
    }
    
    // Only fetch missing symbols from API - take first 10 for broader coverage
    if (symbolsToFetch.length > 0) {
      console.log(`Fetching fresh StockTwits data for ${Math.min(symbolsToFetch.length, 15)} symbols`)
      
      for (const symbol of symbolsToFetch.slice(0, 15)) { // paginate within each symbol for last N days
        try {
          const messages = await fetchSymbolMessagesForWindow(symbol, limitPerDay, days)
          if (messages.length > 0) {
            allMessages.push(...messages)

            const stats = summarizeMessages(messages)
            const timestamp = new Date().toISOString()

            // Store in database for future use
            await supabase
              .from('sentiment_history')
              .insert({
                symbol,
                source: 'stocktwits',
                sentiment_score: stats.sentiment_score,
                confidence_score: stats.confidence_score,
                metadata: mergeStatsIntoMetadata({ messages }, stats),
                collected_at: timestamp,
                data_timestamp: timestamp
              })
          }
        } catch (error: any) {
          console.warn(`Error fetching ${symbol}:`, error?.message || error)
          continue
        }
        
        await new Promise(resolve => setTimeout(resolve, 1200)) // Pacing between symbols
      }
    }

    // If no data from API, return empty results (but successful response)
    if (allMessages.length === 0) {
      console.log('No StockTwits data available - returning empty results')
      
      const result = { 
        messages: [],
        totalResults: 0,
        source: 'StockTwits API',
        fromDatabase: recentData.length,
        fromAPI: symbolsToFetch.length,
        ticker_counts: {}
      };
      
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Remove duplicates and sort by creation date
    const uniqueMessages = allMessages
      .filter((message, index, self) => 
        index === self.findIndex(m => m.id === message.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    console.log(`Returning ${uniqueMessages.length} StockTwits messages (${recentData.length} from cache, ${symbolsToFetch.length} fetched)`)

    // Per-ticker mention counts (case-insensitive, $ required for short tickers)
    const tickerCounts: Record<string, number> = {};
    const symbolMessagesMap = new Map<string, StockTwitsMessage[]>();
    for (const msg of uniqueMessages) {
      const symbolSet = new Set<string>();
      if (Array.isArray(msg.symbols)) {
        msg.symbols.forEach(ref => {
          if (ref?.symbol) symbolSet.add(ref.symbol.toUpperCase());
        });
      }
      extractTickers(`${msg.body || ''}`).forEach(sym => symbolSet.add(sym));

      if (symbolSet.size === 0) continue;

      for (const symbol of symbolSet) {
        tickerCounts[symbol] = (tickerCounts[symbol] || 0) + 1;
        const existing = symbolMessagesMap.get(symbol);
        if (existing) existing.push(msg);
        else symbolMessagesMap.set(symbol, [msg]);
      }
    }

    const symbolStats: Record<string, SentimentSummary> = {};
    for (const [symbol, messages] of symbolMessagesMap.entries()) {
      symbolStats[symbol] = summarizeMessages(messages);
    }

    const result = { 
      messages: uniqueMessages,
      totalResults: uniqueMessages.length,
      source: 'StockTwits API',
      fromDatabase: recentData.length,
      fromAPI: symbolsToFetch.length,
      ticker_counts: tickerCounts,
      symbol_stats: symbolStats
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in StockTwits function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
