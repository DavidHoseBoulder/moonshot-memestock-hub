import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { symbols, limit = 50 } = await req.json()
    console.log(`Fetching YouTube sentiment for symbols: ${symbols?.join(', ')}`)

    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Symbols array is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY')
    if (!youtubeApiKey) {
      console.log('YouTube API key not found, returning mock data')
      
      // Return mock data when API key is missing
      const mockData = symbols.slice(0, 10).map((symbol: string) => ({
        symbol,
        sentiment: Math.random() * 0.8 - 0.4, // -0.4 to 0.4
        commentCount: Math.floor(Math.random() * 100) + 20,
        avgLikes: Math.floor(Math.random() * 10) + 2,
        topComments: [
          {
            text: `${symbol} looking bullish today!`,
            likeCount: 5,
            publishedAt: new Date().toISOString(),
            authorDisplayName: 'MockUser1'
          }
        ],
        timestamp: new Date().toISOString()
      }))

      return new Response(
        JSON.stringify({
          success: true,
          youtube_sentiment: mockData,
          total_processed: mockData.length,
          source: 'youtube_mock'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const youtubeSentiment: YouTubeSentiment[] = []

    for (const symbol of symbols.slice(0, 10)) { // Limit to 10 symbols
      try {
        // Search for recent videos about the stock
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${symbol}+stock+analysis&type=video&order=date&maxResults=5&key=${youtubeApiKey}`
        
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
        
        // Get comments from top videos
        for (const video of videos.slice(0, 3)) {
          try {
            const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${video.id.videoId}&maxResults=20&order=relevance&key=${youtubeApiKey}`
            
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

        youtubeSentiment.push({
          symbol,
          sentiment: Math.max(-1, Math.min(1, avgSentiment)), // Clamp to -1 to 1
          commentCount: allComments.length,
          avgLikes,
          topComments: allComments
            .sort((a, b) => b.likeCount - a.likeCount)
            .slice(0, 3),
          timestamp: new Date().toISOString()
        })

        console.log(`YouTube sentiment for ${symbol}: ${avgSentiment.toFixed(3)} from ${allComments.length} comments`)

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.error(`Error processing YouTube data for ${symbol}:`, error)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        youtube_sentiment: youtubeSentiment,
        total_processed: youtubeSentiment.length,
        source: 'youtube'
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