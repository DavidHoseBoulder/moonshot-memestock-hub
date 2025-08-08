
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCachedData(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCachedData(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
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

    // Create cache key for this request
    const cacheKey = `stocktwits_${symbols.join(',')}_${limit}`;
    const cached = getCachedData(cacheKey);
    
    if (cached) {
      console.log(`Returning cached StockTwits data for ${symbols.length} symbols`);
      return new Response(
        JSON.stringify(cached),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching StockTwits data for symbols: ${symbols.slice(0, 5).join(', ')}${symbols.length > 5 ? '...' : ''}`)

    const allMessages: StockTwitsMessage[] = []
    
    // Fetch data for each symbol (StockTwits API doesn't support bulk requests)
    // Prioritize high-volume symbols and limit to 8 to reduce API calls
    const prioritizedSymbols = symbols
      .slice(0, 8) // Reduced from 10 to 8
      .sort((a, b) => {
        // Prioritize major symbols
        const priority = ['TSLA', 'AAPL', 'NVDA', 'AMD', 'META', 'AMZN', 'MSFT', 'GME', 'AMC'];
        return priority.indexOf(a) - priority.indexOf(b);
      });
    
    for (const symbol of prioritizedSymbols) {
      try {
        const stocktwitsUrl = `https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json?limit=${Math.min(limit, 20)}`
        
        const response = await fetch(stocktwitsUrl, {
          headers: {
            'User-Agent': 'Financial-Pipeline/1.0'
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.messages && Array.isArray(data.messages)) {
            allMessages.push(...data.messages)
          }
        } else if (response.status === 429) {
          console.warn(`Rate limited for symbol ${symbol}`)
          await new Promise(resolve => setTimeout(resolve, 2000)) // Increased delay
          break; // Stop on rate limit
        } else {
          console.warn(`Failed to fetch ${symbol}: ${response.status}`)
        }
        
        // Increased delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200))
        
      } catch (error) {
        console.warn(`Error fetching ${symbol}:`, error.message)
        continue
      }
    }

    // If no data from API, return empty results
    if (allMessages.length === 0) {
      console.log('No StockTwits data available - API may be down or rate limited')
      
      return new Response(
        JSON.stringify({ 
          messages: [],
          totalResults: 0,
          error: 'StockTwits API unavailable',
          source: 'StockTwits API'
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Remove duplicates and sort by creation date
    const uniqueMessages = allMessages
      .filter((message, index, self) => 
        index === self.findIndex(m => m.id === message.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    console.log(`Successfully retrieved ${uniqueMessages.length} StockTwits messages`)

    const result = { 
      messages: uniqueMessages,
      totalResults: uniqueMessages.length,
      source: 'StockTwits API',
      cached: false
    };

    // Cache the result
    setCachedData(cacheKey, result);

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
