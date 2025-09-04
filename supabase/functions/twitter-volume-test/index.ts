import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TwitterSearchResponse {
  data?: Array<{
    id: string;
    text: string;
    created_at: string;
    public_metrics?: {
      retweet_count: number;
      like_count: number;
      reply_count: number;
    };
  }>;
  meta?: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Helpers
  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function sanitizeSymbols(input: string[]): string[] {
    const cleaned = input
      .map((s) => (s || '').toString().trim().toUpperCase())
      .map((s) => s.replace(/[^A-Z0-9]/g, ''))
      .filter((s) => s.length > 0);
    return Array.from(new Set(cleaned));
  }
  type RateLimitInfo = { limit?: number; remaining?: number; reset?: number; retry_after?: number };
  type RateLimitMap = Record<string, RateLimitInfo>;
  function parseRateLimitHeaders(resp: Response): RateLimitInfo {
    const limitRaw = resp.headers.get('x-rate-limit-limit');
    const remainingRaw = resp.headers.get('x-rate-limit-remaining');
    const resetRaw = resp.headers.get('x-rate-limit-reset');
    const retryAfterRaw = resp.headers.get('retry-after');
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const remaining = remainingRaw ? Number(remainingRaw) : undefined;
    const reset = resetRaw ? Number(resetRaw) : undefined;
    const retry_after = retryAfterRaw ? Number(retryAfterRaw) : undefined;
    return {
      limit: Number.isFinite(limit as number) ? (limit as number) : undefined,
      remaining: Number.isFinite(remaining as number) ? (remaining as number) : undefined,
      reset: Number.isFinite(reset as number) ? (reset as number) : undefined,
      retry_after: Number.isFinite(retry_after as number) ? (retry_after as number) : undefined,
    };
  }

  async function fetchWithRetry(url: string, headers: Record<string, string>, symbol: string, maxRetries = 1) {
    let attempt = 0;
    while (true) {
      const resp = await fetch(url, { headers });
      const rl = parseRateLimitHeaders(resp);
      if (resp.status === 429) {
        const nowSec = Math.floor(Date.now() / 1000);
        const resetSec = rl.reset && rl.reset > nowSec ? rl.reset - nowSec : undefined;
        const retrySec = rl.retry_after && rl.retry_after > 0 ? rl.retry_after : resetSec;
        console.warn(`Rate limited for ${symbol}. remaining=${rl.remaining ?? 'n/a'} resetIn=${retrySec ?? 'n/a'}s`);
        if (attempt < maxRetries && retrySec && retrySec <= 20) {
          console.log(`Backing off ${retrySec}s and retrying ${symbol} (attempt ${attempt + 1})...`);
          await sleep(retrySec * 1000);
          attempt++;
          continue;
        }
      }
      return { resp, rl };
    }
  }

  try {
    // Parse JSON body safely with defaults
    const body = await req.json().catch(() => ({}));
    const rawSymbols = Array.isArray(body?.symbols) ? body.symbols : ['TSLA', 'PLTR', 'AAPL'];
    const hours = typeof body?.hours === 'number' ? body.hours : 24;

    const symbols = sanitizeSymbols(rawSymbols);

    const twitterBearerToken = Deno.env.get('TWITTER_BEARER_TOKEN')
    
    if (!twitterBearerToken) {
      return Response.json(
        { error: 'Twitter Bearer Token not configured' },
        { status: 500, headers: corsHeaders }
      )
    }

    const results: any[] = []
    const rateLimitPerSymbol: RateLimitMap = {}
    let lastRateLimit: RateLimitInfo | undefined
    
    for (const symbol of symbols) {
      try {
        // Calculate time range (last 24 hours by default)
        // Set end time to be at least 30 seconds ago to avoid Twitter API timing issues
        const endTime = new Date(Date.now() - 30000) // 30 seconds ago
        const startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000))
        
        // Build Twitter search query - looking for cashtag and mentions
        const query = `$${symbol} OR ${symbol} -is:retweet lang:en`
        
        const params = new URLSearchParams({
          query,
          'tweet.fields': 'created_at,public_metrics',
          'max_results': '10',
          'start_time': startTime.toISOString(),
          'end_time': endTime.toISOString()
        })

        console.log(`🔍 Searching Twitter for ${symbol}: ${query}`)
        const url = `https://api.twitter.com/2/tweets/search/recent?${params}`
        const { resp, rl } = await fetchWithRetry(url, {
          'Authorization': `Bearer ${twitterBearerToken}`,
          'Content-Type': 'application/json',
        }, symbol, 1)

        // capture rate limit
        rateLimitPerSymbol[symbol] = rl
        lastRateLimit = rl

        if (!resp.ok) {
          console.error(`Twitter API error for ${symbol}:`, resp.status, resp.statusText)
          const errorText = await resp.text()
          console.error('Error details:', errorText)
          
          results.push({
            symbol,
            error: `Twitter API error: ${resp.status} - ${resp.statusText}`,
            volume: 0,
            timeframe_hours: hours,
            rate_limit: rl,
          })
          // If rate limited, avoid hammering remaining symbols in this run
          if (resp.status === 429) {
            console.warn('Hit 429 - stopping further symbol requests in this run to respect rate limits')
            break
          }
          continue
        }

        const data: TwitterSearchResponse = await resp.json()
        
        const volume = data.meta?.result_count || 0
        const tweets = data.data || []
        
        // Calculate engagement metrics
        const totalEngagement = tweets.reduce((sum, tweet) => {
          const metrics = tweet.public_metrics
          return sum + (metrics?.like_count || 0) + (metrics?.retweet_count || 0) + (metrics?.reply_count || 0)
        }, 0)
        
        const avgEngagement = tweets.length > 0 ? totalEngagement / tweets.length : 0
        
        // Sample of recent tweets
        const sampleTweets = tweets.slice(0, 3).map(tweet => ({
          id: tweet.id,
          text: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
          created_at: tweet.created_at,
          engagement: (tweet.public_metrics?.like_count || 0) + (tweet.public_metrics?.retweet_count || 0)
        }))

        results.push({
          symbol,
          volume,
          timeframe_hours: hours,
          avg_engagement: Math.round(avgEngagement),
          total_engagement: totalEngagement,
          sample_tweets: sampleTweets,
          volume_per_hour: Math.round(volume / hours * 10) / 10,
          estimated_daily_volume: Math.round(volume / hours * 24),
          rate_limit: rl,
        })

        console.log(`📊 ${symbol}: ${volume} tweets in ${hours} hours (${Math.round(volume/hours*24)} daily estimate)`)        
        // Add delay between requests to avoid rate limiting (wait ~2 seconds between each API call)
        if (symbols.indexOf(symbol) < symbols.length - 1) {
          console.log(`⏳ Waiting 2 seconds before next request...`)
          await sleep(2000)
        }
        
      } catch (error: any) {
        console.error(`Error processing ${symbol}:`, error)
        results.push({
          symbol,
          error: error.message,
          volume: 0,
          timeframe_hours: hours
        })
      }
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total_symbols_tested: symbols.length,
        timeframe_hours: hours,
        highest_volume: Math.max(...results.map((r: any) => r.volume || 0)),
        total_volume: results.reduce((sum: number, r: any) => sum + (r.volume || 0), 0),
      },
      rate_limit: {
        last: lastRateLimit,
        per_symbol: rateLimitPerSymbol,
      }
    }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('Error in twitter-volume-test:', error)
    return Response.json(
      { error: 'Internal server error', details: error.message },
      { status: 500, headers: corsHeaders }
    )
  }
})
