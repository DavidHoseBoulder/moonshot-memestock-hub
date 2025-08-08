import "https://deno.land/x/xhr@0.1.0/mod.ts";

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

// Initialize Supabase client
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

// Check database for recent Twitter sentiment data (last 30 minutes)
async function getRecentTwitterSentiment(symbols: string[]) {
  
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('sentiment_history')
    .select('symbol, sentiment_score, confidence_score, metadata, collected_at')
    .in('symbol', symbols)
    .eq('source', 'twitter')
    .gte('collected_at', thirtyMinutesAgo)
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

    console.log(`Checking database for recent Twitter sentiment for ${symbols.length} symbols`)
    
    // First, check database for recent data
    const recentData = await getRecentTwitterSentiment(symbols)
    const symbolsWithData = new Set(recentData.map(d => d.symbol))
    const symbolsToFetch = symbols.filter(symbol => !symbolsWithData.has(symbol))
    
    console.log(`Found ${recentData.length} symbols with recent Twitter data, need to fetch ${symbolsToFetch.length} symbols`)
    
    const results: SentimentResult[] = []
    
    // Convert database data to SentimentResult format
    recentData.forEach(({ symbol, data }) => {
      if (data.metadata) {
        results.push({
          symbol,
          sentiment: data.sentiment_score || 0,
          confidence: data.confidence_score || 0,
          tweetCount: data.metadata.tweetCount || 0,
          totalEngagement: data.metadata.totalEngagement || 0,
          topTweets: data.metadata.topTweets || [],
          timestamp: data.collected_at
        })
      }
    })

    // Check if Twitter Bearer Token is available
    const bearerToken = Deno.env.get('TWITTER_BEARER_TOKEN');
    
    if (!bearerToken && symbolsToFetch.length > 0) {
      console.log('Twitter Bearer Token not available, returning cached data only');
      
      return new Response(
        JSON.stringify({
          success: true,
          sentiment_data: results, // Only cached data, no simulation
          total_processed: results.length,
          source: 'twitter_cached_only',
          fromDatabase: recentData.length,
          fromAPI: 0,
          note: 'Twitter API key not configured - cached data only'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only fetch missing symbols from API
    if (symbolsToFetch.length > 0 && bearerToken) {
      console.log(`Fetching fresh Twitter data for ${symbolsToFetch.length} symbols`)
      
      // Smart prioritization by category (social sentiment focus)
      const prioritizedSymbols = prioritizeSymbolsByCategory(symbolsToFetch)
      
      // Process symbols in batches to avoid rate limits (free tier: 75 requests/15min)
      for (const symbol of prioritizedSymbols.slice(0, 3)) { // Reduced to 3 for free tier
        try {
          // Search for tweets about the stock symbol
          const searchQuery = `$${symbol} OR ${symbol} stock -is:retweet lang:en`;
          const twitterUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(searchQuery)}&max_results=10&tweet.fields=created_at,public_metrics,author_id`;
          
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
              let validSentimentCount = 0;
              const topTweets: Array<{ text: string; engagement: number; created_at: string }> = [];

              data.data.forEach(tweet => {
                const analysis = analyzeSentiment(tweet.text);
                const engagement = tweet.public_metrics.like_count + 
                                 tweet.public_metrics.retweet_count + 
                                 tweet.public_metrics.reply_count;
                
                console.log(`Tweet: "${tweet.text.substring(0, 50)}..." - Sentiment: ${analysis.sentiment}, Confidence: ${analysis.confidence}`);
                
                // Only include tweets with meaningful sentiment
                if (analysis.confidence > 0) {
                  totalSentiment += analysis.sentiment * analysis.confidence;
                  totalConfidence += analysis.confidence;
                  validSentimentCount++;
                }
                totalEngagement += engagement;

                if (topTweets.length < 3 && tweet.text.length > 20) {
                  topTweets.push({
                    text: tweet.text.substring(0, 200),
                    engagement,
                    created_at: tweet.created_at
                  });
                }
              });

              const finalSentiment = validSentimentCount > 0 ? totalSentiment / totalConfidence : 0;
              const finalConfidence = validSentimentCount > 0 ? Math.min(totalConfidence / validSentimentCount, 1.0) : 0;
              
              console.log(`Symbol ${symbol}: ${validSentimentCount}/${data.data.length} tweets had sentiment, final sentiment: ${finalSentiment}, confidence: ${finalConfidence}`);

              const sentimentResult = {
                symbol,
                sentiment: finalSentiment,
                confidence: finalConfidence,
                tweetCount: data.data.length,
                totalEngagement,
                topTweets: topTweets.sort((a, b) => b.engagement - a.engagement),
                timestamp: new Date().toISOString()
              };

              results.push(sentimentResult);

              // Store in database for future use - using the same client initialized at top
              const { error: insertError } = await supabase
                .from('sentiment_history')
                .insert({
                  symbol,
                  source: 'twitter',
                  sentiment_score: sentimentResult.sentiment,
                  confidence_score: sentimentResult.confidence,
                  metadata: {
                    tweetCount: sentimentResult.tweetCount,
                    totalEngagement: sentimentResult.totalEngagement,
                    topTweets: sentimentResult.topTweets
                  },
                  collected_at: new Date().toISOString(),
                  data_timestamp: new Date().toISOString()
                })
              
              if (insertError) {
                console.warn(`Failed to store Twitter data for ${symbol}:`, insertError)
              } else {
                console.log(`Successfully stored Twitter sentiment for ${symbol}`)
              }
            } else {
              // No tweets found - don't add to results, just skip
              console.log(`No tweets found for ${symbol}`)
            }
          } else if (response.status === 429) {
            console.warn(`Twitter rate limited for symbol ${symbol}`);
            break; // Stop processing to preserve quota
          } else {
            console.warn(`Failed to fetch Twitter data for ${symbol}: ${response.status}`);
          }
          
          // Delay to respect rate limits (free tier: 75 requests per 15 minutes = ~12 seconds between requests)
          await new Promise(resolve => setTimeout(resolve, 15000)); // 15 second delay for free tier
          
        } catch (error) {
          console.warn(`Error fetching Twitter data for ${symbol}:`, error.message);
          continue;
        }
      }
    }

    const sentimentCount = results.filter(r => r.sentiment !== 0 || r.confidence > 0).length;
    console.log(`Returning ${results.length} Twitter sentiment results (${recentData.length} from cache, ${symbolsToFetch.length} from API), ${sentimentCount} with actual sentiment`)

    return new Response(
      JSON.stringify({
        success: true,
        sentiment_data: results,
        total_processed: results.length,
        sentimentCount: sentimentCount,
        source: 'twitter_api',
        fromDatabase: recentData.length,
        fromAPI: symbolsToFetch.length
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