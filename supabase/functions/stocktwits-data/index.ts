
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Category-based prioritization for social sentiment
function prioritizeSymbolsByCategory(symbols: string[]): string[] {
  const categoryPriority = {
    'Meme & Retail': 5,        // Highest social sentiment
    'Tech & Momentum': 4,
    'Fintech & Crypto': 4,
    'AI & Data': 3,
    'EV & Alt-Tech': 3,
    'Consumer Buzz': 3,
    'Media & Internet': 2,
    'Biotech & Pharma': 2,
    'Banking': 1,
    'SPAC & Penny': 1          // Lower priority
  };

  const stockCategories: Record<string, string> = {
    'GME': 'Meme & Retail', 'AMC': 'Meme & Retail', 'BB': 'Meme & Retail',
    'TSLA': 'Tech & Momentum', 'AAPL': 'Tech & Momentum', 'NVDA': 'Tech & Momentum',
    'COIN': 'Fintech & Crypto', 'RIOT': 'Fintech & Crypto', 'HOOD': 'Fintech & Crypto'
  };

  return symbols.sort((a, b) => {
    const categoryA = stockCategories[a] || 'Banking';
    const categoryB = stockCategories[b] || 'Banking';
    const priorityA = categoryPriority[categoryA] || 1;
    const priorityB = categoryPriority[categoryB] || 1;
    return priorityB - priorityA;
  });
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

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

// Check database for recent data (last 24 hours)
async function getRecentSentimentData(symbols: string[]): Promise<{ symbol: string; data: any }[]> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('sentiment_history')
    .select('symbol, sentiment_score, confidence_score, metadata, collected_at')
    .in('symbol', symbols)
    .eq('source', 'stocktwits')
    .gte('collected_at', twentyFourHoursAgo)
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

interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  user: {
    username: string;
    followers: number;
  };
  symbols: Array<{
    symbol: string;
  }>;
  sentiment?: {
    basic: 'Bullish' | 'Bearish';
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { symbols, limit = 30 } = await req.json()
    
    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid symbols array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Checking database for recent StockTwits data for ${symbols.length} symbols`)
    
    // First, check database for recent data
    const recentData = await getRecentSentimentData(symbols)
    const symbolsWithData = new Set(recentData.map(d => d.symbol))
    const symbolsToFetch = symbols.filter(symbol => !symbolsWithData.has(symbol))
    
    console.log(`Found ${recentData.length} symbols with recent data, need to fetch ${symbolsToFetch.length} symbols`)
    
    let allMessages: StockTwitsMessage[] = []
    
    // Convert database data to StockTwits message format
    recentData.forEach(({ symbol, data }) => {
      if (data.metadata?.messages) {
        allMessages.push(...data.metadata.messages)
      }
    })
    
    // Only fetch missing symbols from API
    if (symbolsToFetch.length > 0) {
      console.log(`Fetching fresh StockTwits data for ${symbolsToFetch.length} symbols`)
      
      // Smart prioritization by category (social sentiment focus)
      const prioritizedSymbols = prioritizeSymbolsByCategory(symbolsToFetch)
      
      for (const symbol of prioritizedSymbols.slice(0, 5)) { // Reduced to 5 to minimize API calls
        try {
          const stocktwitsUrl = `https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json?limit=${Math.min(limit, 20)}`
          
          const response = await fetchWithBackoff(stocktwitsUrl, {
            headers: {
              'User-Agent': 'Financial-Pipeline/1.0'
            }
          }, 3, 1000)

          if (response.ok) {
            const data = await response.json()
            if (data.messages && Array.isArray(data.messages)) {
              allMessages.push(...data.messages)
              
              // Store in database for future use
              await supabase
                .from('sentiment_history')
                .insert({
                  symbol,
                  source: 'stocktwits',
                  sentiment_score: 0, // We'll calculate this from messages
                  confidence_score: data.messages.length > 0 ? 0.7 : 0,
                  metadata: { messages: data.messages },
                  collected_at: new Date().toISOString(),
                  data_timestamp: new Date().toISOString()
                })
            }
          } else if (response.status === 429) {
            console.warn(`Rate limited for symbol ${symbol}`)
            break // Stop processing to preserve quota
          } else {
            console.warn(`Failed to fetch ${symbol}: ${response.status}`)
          }
          
          await new Promise(resolve => setTimeout(resolve, 1200)) // Pacing between requests
          
        } catch (error) {
          console.warn(`Error fetching ${symbol}:`, error.message)
          continue
        }
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
    for (const msg of uniqueMessages) {
      const tickers = extractTickers(`${msg.body || ''}`);
      for (const t of tickers) tickerCounts[t] = (tickerCounts[t] || 0) + 1;
    }

    const result = { 
      messages: uniqueMessages,
      totalResults: uniqueMessages.length,
      source: 'StockTwits API',
      fromDatabase: recentData.length,
      fromAPI: symbolsToFetch.length,
      ticker_counts: tickerCounts
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
