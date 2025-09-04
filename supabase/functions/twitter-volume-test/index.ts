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

  try {
    const { symbols = ['TSLA', 'PLTR', 'AAPL'], hours = 24 } = await req.json()
    
    const twitterBearerToken = Deno.env.get('TWITTER_BEARER_TOKEN')
    
    if (!twitterBearerToken) {
      return Response.json(
        { error: 'Twitter Bearer Token not configured' },
        { status: 500, headers: corsHeaders }
      )
    }

    const results = []
    
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
        
        const response = await fetch(
          `https://api.twitter.com/2/tweets/search/recent?${params}`,
          {
            headers: {
              'Authorization': `Bearer ${twitterBearerToken}`,
              'Content-Type': 'application/json',
            },
          }
        )

        if (!response.ok) {
          console.error(`Twitter API error for ${symbol}:`, response.status, response.statusText)
          const errorText = await response.text()
          console.error('Error details:', errorText)
          
          results.push({
            symbol,
            error: `Twitter API error: ${response.status} - ${response.statusText}`,
            volume: 0,
            timeframe_hours: hours
          })
          continue
        }

        const data: TwitterSearchResponse = await response.json()
        
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
          estimated_daily_volume: Math.round(volume / hours * 24)
        })

        console.log(`📊 ${symbol}: ${volume} tweets in ${hours} hours (${Math.round(volume/hours*24)} daily estimate)`)
        
        // Add delay between requests to avoid rate limiting (wait 2 seconds between each API call)
        if (symbols.indexOf(symbol) < symbols.length - 1) {
          console.log(`⏳ Waiting 2 seconds before next request...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
        
      } catch (error) {
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
        highest_volume: Math.max(...results.map(r => r.volume || 0)),
        total_volume: results.reduce((sum, r) => sum + (r.volume || 0), 0)
      }
    }, { headers: corsHeaders })

  } catch (error) {
    console.error('Error in twitter-volume-test:', error)
    return Response.json(
      { error: 'Internal server error', details: error.message },
      { status: 500, headers: corsHeaders }
    )
  }
})