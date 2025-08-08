import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TwitterSearchResponse {
  data?: Array<{
    id: string;
    text: string;
    created_at: string;
    public_metrics: {
      retweet_count: number;
      like_count: number;
      reply_count: number;
      quote_count: number;
    };
    author_id: string;
  }>;
  meta: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
  };
}

interface SentimentResult {
  symbol: string;
  sentiment: number;
  confidence: number;
  tweetCount: number;
  totalEngagement: number;
  topTweets: Array<{
    text: string;
    engagement: number;
    created_at: string;
  }>;
  timestamp: string;
}

// Simple sentiment analysis using keyword scoring
function analyzeSentiment(text: string): { sentiment: number; confidence: number } {
  const bullishKeywords = [
    'buy', 'bull', 'bullish', 'up', 'rise', 'pump', 'moon', 'rocket', 'gains',
    'profit', 'breakout', 'rally', 'surge', 'strong', 'positive', 'good news',
    'beating expectations', 'upgrade', 'outperform', 'long', 'calls'
  ];
  
  const bearishKeywords = [
    'sell', 'bear', 'bearish', 'down', 'fall', 'dump', 'crash', 'loss',
    'short', 'puts', 'decline', 'weak', 'negative', 'bad news', 'missing',
    'downgrade', 'underperform', 'correction', 'bubble', 'overvalued'
  ];

  const textLower = text.toLowerCase();
  let bullishCount = 0;
  let bearishCount = 0;

  bullishKeywords.forEach(keyword => {
    if (textLower.includes(keyword)) bullishCount++;
  });

  bearishKeywords.forEach(keyword => {
    if (textLower.includes(keyword)) bearishCount++;
  });

  const totalKeywords = bullishCount + bearishCount;
  if (totalKeywords === 0) {
    return { sentiment: 0, confidence: 0 };
  }

  const sentiment = (bullishCount - bearishCount) / totalKeywords;
  const confidence = Math.min(totalKeywords * 0.2, 1.0); // Max confidence of 1.0

  return { sentiment, confidence };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { symbols, days = 1 } = await req.json()
    
    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid symbols array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if Twitter Bearer Token is available
    const bearerToken = Deno.env.get('TWITTER_BEARER_TOKEN');
    
    if (!bearerToken) {
      console.log('Twitter Bearer Token not available, generating simulated sentiment data');
      
      // Generate realistic simulated data based on market conditions
      const results: SentimentResult[] = symbols.slice(0, 15).map(symbol => {
        const baseVolatility = Math.random() * 0.4 - 0.2; // -0.2 to 0.2
        const marketBoost = new Date().getHours() >= 9 && new Date().getHours() <= 16 ? 0.1 : 0;
        
        return {
          symbol,
          sentiment: Math.max(-1, Math.min(1, baseVolatility + marketBoost)),
          confidence: 0.3 + Math.random() * 0.4, // 0.3 to 0.7
          tweetCount: Math.floor(Math.random() * 50) + 10,
          totalEngagement: Math.floor(Math.random() * 1000) + 100,
          topTweets: [
            {
              text: `$${symbol} showing strong momentum in today's session`,
              engagement: Math.floor(Math.random() * 100) + 20,
              created_at: new Date().toISOString()
            }
          ],
          timestamp: new Date().toISOString()
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          sentiment_data: results,
          total_processed: results.length,
          source: 'simulated_twitter',
          note: 'Simulated data - Twitter API key not configured'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching Twitter sentiment for symbols: ${symbols.slice(0, 5).join(', ')}${symbols.length > 5 ? '...' : ''}`)

    const results: SentimentResult[] = [];
    
    // Process symbols in batches to avoid rate limits
    for (const symbol of symbols.slice(0, 10)) {
      try {
        // Search for tweets about the stock symbol
        const searchQuery = `$${symbol} OR ${symbol} stock -is:retweet lang:en`;
        const twitterUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(searchQuery)}&max_results=50&tweet.fields=created_at,public_metrics,author_id`;
        
        const response = await fetch(twitterUrl, {
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'User-Agent': 'Financial-Sentiment-Bot/1.0'
          }
        });

        if (response.ok) {
          const data: TwitterSearchResponse = await response.json();
          
          if (data.data && data.data.length > 0) {
            let totalSentiment = 0;
            let totalConfidence = 0;
            let totalEngagement = 0;
            const topTweets: Array<{ text: string; engagement: number; created_at: string }> = [];

            data.data.forEach(tweet => {
              const analysis = analyzeSentiment(tweet.text);
              const engagement = tweet.public_metrics.like_count + 
                               tweet.public_metrics.retweet_count + 
                               tweet.public_metrics.reply_count;
              
              totalSentiment += analysis.sentiment * analysis.confidence;
              totalConfidence += analysis.confidence;
              totalEngagement += engagement;

              if (topTweets.length < 3 && tweet.text.length > 20) {
                topTweets.push({
                  text: tweet.text.substring(0, 200),
                  engagement,
                  created_at: tweet.created_at
                });
              }
            });

            results.push({
              symbol,
              sentiment: totalConfidence > 0 ? totalSentiment / totalConfidence : 0,
              confidence: Math.min(totalConfidence / data.data.length, 1.0),
              tweetCount: data.data.length,
              totalEngagement,
              topTweets: topTweets.sort((a, b) => b.engagement - a.engagement),
              timestamp: new Date().toISOString()
            });
          } else {
            // No tweets found
            results.push({
              symbol,
              sentiment: 0,
              confidence: 0,
              tweetCount: 0,
              totalEngagement: 0,
              topTweets: [],
              timestamp: new Date().toISOString()
            });
          }
        } else if (response.status === 429) {
          console.warn(`Twitter rate limited for symbol ${symbol}`);
          break; // Stop processing on rate limit
        } else {
          console.warn(`Failed to fetch Twitter data for ${symbol}: ${response.status}`);
        }
        
        // Delay to respect rate limits (450 requests per 15 minutes)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.warn(`Error fetching Twitter data for ${symbol}:`, error.message);
        continue;
      }
    }

    console.log(`Successfully processed ${results.length} symbols for Twitter sentiment`);

    return new Response(
      JSON.stringify({
        success: true,
        sentiment_data: results,
        total_processed: results.length,
        source: 'twitter_api'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in Twitter sentiment function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});