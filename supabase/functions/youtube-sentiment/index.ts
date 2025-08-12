import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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

  // Stock universe mapping (abbreviated for space)
  const stockCategories: Record<string, string> = {
    'GME': 'Meme & Retail', 'AMC': 'Meme & Retail', 'BB': 'Meme & Retail',
    'TSLA': 'Tech & Momentum', 'AAPL': 'Tech & Momentum', 'NVDA': 'Tech & Momentum',
    'COIN': 'Fintech & Crypto', 'RIOT': 'Fintech & Crypto', 'HOOD': 'Fintech & Crypto',
    'AI': 'AI & Data', 'PLTR': 'AI & Data', 'SNOW': 'AI & Data',
    'NIO': 'EV & Alt-Tech', 'RIVN': 'EV & Alt-Tech', 'SPCE': 'EV & Alt-Tech'
  };

  return symbols.sort((a, b) => {
    const categoryA = stockCategories[a] || 'Banking';
    const categoryB = stockCategories[b] || 'Banking';
    const priorityA = categoryPriority[categoryA] || 1;
    const priorityB = categoryPriority[categoryB] || 1;
    return priorityB - priorityA;
  });
}

// Unified ticker set and extraction regex (shared across platforms)
const CANONICAL_TICKERS = [ 'GME','AMC','BBBYQ','BB','NOK','KOSS','EXPR','WISH','CLOV','SNDL','TSLA','AAPL','MSFT','NVDA','AMD','PLTR','META','AMZN','SNAP','INTC','AI','BBAI','SOUN','UPST','SNOW','NET','DDOG','CRWD','PATH','COIN','RIOT','MARA','HOOD','SQ','PYPL','SOFI','LCID','RBLX','MSTR','NIO','XPEV','LI','RIVN','FSR','NKLA','ASTS','SPCE','QS','RUN','NVAX','SAVA','MRNA','BNTX','CYTO','MNMD','IOVA','VSTM','DIS','NFLX','WBD','TTD','ROKU','PARA','FUBO','PINS','BILI','CVNA','CHWY','ETSY','PTON','BYND','WMT','TGT','COST','BURL','NKE','FRCB','WAL','BANC','SCHW','GS','JPM','BAC','C','HBAN','USB','HYMC','MULN','MCOM','TTOO','MEGL','ILAG','ATER','CTRM' ] as const;
const SHORT_TICKERS = CANONICAL_TICKERS.filter(t => t.length <= 3);
const LONG_TICKERS = CANONICAL_TICKERS.filter(t => t.length > 3);
const SHORT_REGEX = new RegExp(`(^|\\W)(\\$(?:${SHORT_TICKERS.join('|')}))(\\W|$)`, 'gi');
const LONG_REGEX = new RegExp(`(^|\\W)(${LONG_TICKERS.join('|')})(\\W|$)`, 'gi');
function extractTickers(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = SHORT_REGEX.exec(text)) !== null) {
    const sym = m[2].replace('$','').toUpperCase();
    if ((CANONICAL_TICKERS as readonly string[]).includes(sym)) found.add(sym);
  }
  while ((m = LONG_REGEX.exec(text)) !== null) {
    const sym = (m[2] || '').toUpperCase();
    if ((CANONICAL_TICKERS as readonly string[]).includes(sym)) found.add(sym);
  }
  SHORT_REGEX.lastIndex = 0; LONG_REGEX.lastIndex = 0;
  return Array.from(found);
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

interface YouTubeComment {
  text: string
  likeCount: number
  publishedAt: string
  authorDisplayName: string
}

interface YouTubeSentiment {
  symbol: string
  sentiment: number
  commentCount: number
  avgLikes: number
  topComments: YouTubeComment[]
  timestamp: string
}

// Check database for recent YouTube sentiment data (last 30 minutes)
async function getRecentYouTubeSentiment(symbols: string[]) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('sentiment_history')
    .select('symbol, sentiment_score, confidence_score, metadata, collected_at')
    .in('symbol', symbols)
    .eq('source', 'youtube')
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { symbols, limit = 50 } = await req.json()
    console.log(`Checking database for recent YouTube sentiment for ${symbols?.length} symbols`)

    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Symbols array is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // First, check database for recent data
    const recentData = await getRecentYouTubeSentiment(symbols)
    const symbolsWithData = new Set(recentData.map(d => d.symbol))
    const symbolsToFetch = symbols.filter(symbol => !symbolsWithData.has(symbol))
    
    console.log(`Found ${recentData.length} symbols with recent YouTube data, need to fetch ${symbolsToFetch.length} symbols`)
    
    const youtubeSentiment: YouTubeSentiment[] = []
    const tickerCounts: Record<string, number> = {}
    
    // Convert database data to YouTubeSentiment format
    recentData.forEach(({ symbol, data }) => {
      if (data.metadata) {
        const topComments = data.metadata.topComments || []
        youtubeSentiment.push({
          symbol,
          sentiment: data.sentiment_score || 0,
          commentCount: data.metadata.commentCount || 0,
          avgLikes: data.metadata.avgLikes || 0,
          topComments,
          timestamp: data.collected_at
        })
        try {
          (topComments as any[]).forEach((c: any) => {
            const text = (c?.text ?? c?.textDisplay ?? '') as string
            const tickers = extractTickers(text)
            for (const t of tickers) tickerCounts[t] = (tickerCounts[t] || 0) + 1
          })
        } catch (_) {}
      }
    })

    const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY')
    if (!youtubeApiKey && symbolsToFetch.length > 0) {
      console.log('YouTube API key not found, returning cached data only')
      
      return new Response(
        JSON.stringify({
          success: true,
          youtube_sentiment: youtubeSentiment,
          total_processed: youtubeSentiment.length,
          source: 'youtube_cached',
          note: 'YouTube API key not configured - using cached data only'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only fetch missing symbols from API
    if (symbolsToFetch.length > 0 && youtubeApiKey) {
      console.log(`Fetching fresh YouTube data for ${symbolsToFetch.length} symbols`)
      
      for (const symbol of symbolsToFetch.slice(0, 3)) { // Reduced to 3 symbols
        try {
          // Search for recent videos about the stock (reduced maxResults to save quota)
          const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${symbol}+stock+analysis&type=video&order=date&maxResults=2&key=${youtubeApiKey}`
          
          const searchResponse = await fetch(searchUrl)
          if (!searchResponse.ok) {
            console.log(`YouTube search failed for ${symbol}: ${searchResponse.status}`)
            continue
          }

          const searchData = await searchResponse.json()
          const videos = searchData.items || []

          if (videos.length === 0) {
            console.log(`No videos found for ${symbol}`)
            continue
          }

          let allComments: YouTubeComment[] = []
          
          // Get comments from top videos (reduced to 1 video)
          for (const video of videos.slice(0, 1)) {
            try {
              const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${video.id.videoId}&maxResults=5&order=relevance&key=${youtubeApiKey}`
              
              const commentsResponse = await fetch(commentsUrl)
              if (!commentsResponse.ok) continue

              const commentsData = await commentsResponse.json()
              const comments = commentsData.items || []

              const videoComments = comments.map((item: any) => ({
                text: item.snippet.topLevelComment.snippet.textDisplay,
                likeCount: item.snippet.topLevelComment.snippet.likeCount,
                publishedAt: item.snippet.topLevelComment.snippet.publishedAt,
                authorDisplayName: item.snippet.topLevelComment.snippet.authorDisplayName
              }))

              allComments = [...allComments, ...videoComments]
            } catch (error) {
              console.error(`Error fetching comments for video ${video.id.videoId}:`, error)
            }
          }

          // Calculate sentiment based on comments
          let totalSentiment = 0
          let sentimentCount = 0

          allComments.forEach(comment => {
            const text = comment.text.toLowerCase()
            let sentiment = 0

            // Simple sentiment analysis
            const positiveWords = ['bullish', 'buy', 'moon', 'up', 'strong', 'good', 'great', 'profit', 'gain']
            const negativeWords = ['bearish', 'sell', 'down', 'weak', 'bad', 'loss', 'crash', 'dump']

            positiveWords.forEach(word => {
              if (text.includes(word)) sentiment += 0.1
            })

            negativeWords.forEach(word => {
              if (text.includes(word)) sentiment -= 0.1
            })

            totalSentiment += sentiment
            sentimentCount++
          })

          const avgSentiment = sentimentCount > 0 ? totalSentiment / sentimentCount : 0
          const avgLikes = allComments.length > 0 
            ? allComments.reduce((sum, c) => sum + c.likeCount, 0) / allComments.length 
            : 0

          const sentimentData = {
            symbol,
            sentiment: Math.max(-1, Math.min(1, avgSentiment)), // Clamp to -1 to 1
            commentCount: allComments.length,
            avgLikes,
            topComments: allComments
              .sort((a, b) => b.likeCount - a.likeCount)
              .slice(0, 3),
            timestamp: new Date().toISOString()
          }

          youtubeSentiment.push(sentimentData)

          // Store in database for future use
          await supabase
            .from('sentiment_history')
            .insert({
              symbol,
              source: 'youtube',
              sentiment_score: sentimentData.sentiment,
              confidence_score: allComments.length > 0 ? 0.6 : 0,
              metadata: {
                commentCount: sentimentData.commentCount,
                avgLikes: sentimentData.avgLikes,
                topComments: sentimentData.topComments
              },
              collected_at: new Date().toISOString(),
              data_timestamp: new Date().toISOString()
            })

          console.log(`YouTube sentiment for ${symbol}: ${avgSentiment.toFixed(3)} from ${allComments.length} comments`)

          // Rate limiting - increased delay to reduce API pressure
          await new Promise(resolve => setTimeout(resolve, 3000))

        } catch (error) {
          console.error(`Error processing YouTube data for ${symbol}:`, error)
        }
      }
    }

    console.log(`Returning ${youtubeSentiment.length} YouTube sentiment results (${recentData.length} from cache, ${symbolsToFetch.length} from API)`)

    return new Response(
      JSON.stringify({
        success: true,
        youtube_sentiment: youtubeSentiment,
        total_processed: youtubeSentiment.length,
        source: 'youtube',
        fromDatabase: recentData.length,
        fromAPI: symbolsToFetch.length,
        ticker_counts: tickerCounts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('YouTube sentiment function error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to fetch YouTube sentiment data',
        youtube_sentiment: []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})