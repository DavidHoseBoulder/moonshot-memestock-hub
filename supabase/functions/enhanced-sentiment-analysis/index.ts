
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SentimentVelocity {
  sentiment_1h: number
  sentiment_6h: number
  sentiment_24h: number
  velocity_1h: number
  velocity_24h: number
  mention_frequency: number
  social_volume_spike: boolean
}

interface EnhancedSentimentAnalysis {
  symbol: string
  current_sentiment: number
  sentiment_velocity: SentimentVelocity
  confidence: number
  key_themes: string[]
  social_signals: string[]
  timestamp: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!openAIApiKey) {
      console.error('Missing OpenAI API key')
      return new Response(
        JSON.stringify({ error: 'Missing OpenAI API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { posts, symbols } = await req.json()
    if (!posts || !Array.isArray(posts)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid posts array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Enhanced sentiment analysis for ${posts.length} posts, tracking ${symbols?.length || 0} symbols`)

    // Limit posts to avoid timeout - process most recent/relevant posts
    const limitedPosts = posts.slice(0, 50) // Process max 50 posts to avoid timeout
    console.log(`Processing ${limitedPosts.length} posts (limited from ${posts.length} to avoid timeout)`)

    // Get historical sentiment data for velocity calculation
    const { data: historicalData } = await supabase
      .from('sentiment_analysis')
      .select('*')
      .gte('post_created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('post_created_at', { ascending: false })

    const enhancedResults: EnhancedSentimentAnalysis[] = []
    
    // Process each symbol mentioned in posts
    const symbolMentions = new Map<string, any[]>()
    
    // Process posts in batches of 10 for parallel processing
    const batchSize = 10
    const batches = []
    for (let i = 0; i < limitedPosts.length; i += batchSize) {
      batches.push(limitedPosts.slice(i, i + batchSize))
    }

    console.log(`Processing ${batches.length} batches of ${batchSize} posts each`)

    // First pass: basic sentiment analysis and symbol extraction with batching
    for (const batch of batches) {
      const batchPromises = batch.map(async (post) => {
        try {
          const text = `${post.title}\n\n${post.selftext || ''}`.slice(0, 3000)
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini', // Use faster model to reduce timeout risk
              messages: [
                {
                  role: 'system',
                  content: `You are a financial sentiment expert. Extract stock symbols and analyze sentiment with social momentum indicators.

Return JSON in this format:
{
  "symbols_mentioned": ["TSLA", "NVDA"],
  "overall_sentiment": 0.7,
  "sentiment_label": "bullish",
  "confidence_score": 0.85,
  "key_themes": ["earnings", "growth"],
  "social_signals": ["momentum", "volume_spike", "breaking_news"],
  "urgency": 0.6
}

Social signals can be: "momentum", "volume_spike", "breaking_news", "technical_breakout", "reversal_signal", "institutional_interest"`
                },
                {
                  role: 'user',
                  content: `Analyze this Reddit post from r/${post.subreddit}:

Title: ${post.title}
Content: ${post.selftext || 'No additional content'}
Engagement: ${post.score} upvotes, ${post.num_comments} comments
Time: ${new Date(post.created_utc * 1000).toISOString()}`
                }
              ],
              temperature: 0.3
            }),
          })

          if (!response.ok) {
            console.error('OpenAI API error:', await response.text())
            return null
          }

          const data = await response.json()
          const analysisText = data.choices[0].message.content

          let analysis
          try {
            analysis = JSON.parse(analysisText)
          } catch (parseError) {
            console.error('Failed to parse OpenAI response:', analysisText)
            return null
          }

          return {
            post,
            analysis
          }

        } catch (error) {
          console.error('Error analyzing post:', error)
          return null
        }
      })

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises)
      
      // Process successful results
      for (const result of batchResults) {
        if (result && result.analysis) {
          // Group by symbols for velocity analysis
          for (const symbol of result.analysis.symbols_mentioned || []) {
            if (!symbolMentions.has(symbol)) {
              symbolMentions.set(symbol, [])
            }
            symbolMentions.get(symbol)?.push({
              ...result.analysis,
              post_data: result.post,
              timestamp: new Date(result.post.created_utc * 1000).toISOString()
            })
          }
        }
      }

      console.log(`Completed batch processing. Symbols found so far: ${symbolMentions.size}`)
    }

    // Second pass: calculate velocity and enhanced metrics for each symbol
    for (const [symbol, mentions] of symbolMentions.entries()) {
      try {
        // Calculate sentiment velocity
        const now = Date.now()
        const mentions1h = mentions.filter(m => new Date(m.timestamp).getTime() > now - 60 * 60 * 1000)
        const mentions6h = mentions.filter(m => new Date(m.timestamp).getTime() > now - 6 * 60 * 60 * 1000)
        const mentions24h = mentions.filter(m => new Date(m.timestamp).getTime() > now - 24 * 60 * 60 * 1000)

        const sentiment_1h = mentions1h.length > 0 ? 
          mentions1h.reduce((sum, m) => sum + m.overall_sentiment, 0) / mentions1h.length : 0
        const sentiment_6h = mentions6h.length > 0 ? 
          mentions6h.reduce((sum, m) => sum + m.overall_sentiment, 0) / mentions6h.length : 0
        const sentiment_24h = mentions24h.length > 0 ? 
          mentions24h.reduce((sum, m) => sum + m.overall_sentiment, 0) / mentions24h.length : 0

        // Calculate velocity (rate of change)
        const velocity_1h = mentions1h.length > 1 ? sentiment_1h - sentiment_6h : 0
        const velocity_24h = mentions24h.length > 1 ? sentiment_6h - sentiment_24h : 0

        // Social volume analysis
        const mention_frequency = mentions24h.length
        const social_volume_spike = mention_frequency > 5 && mentions1h.length > mentions6h.length * 0.5

        const current_sentiment = mentions.length > 0 ? 
          mentions.reduce((sum, m) => sum + m.overall_sentiment, 0) / mentions.length : 0

        const sentimentVelocity: SentimentVelocity = {
          sentiment_1h,
          sentiment_6h,
          sentiment_24h,
          velocity_1h,
          velocity_24h,
          mention_frequency,
          social_volume_spike
        }

        // Aggregate themes and social signals
        const allThemes = mentions.flatMap(m => m.key_themes || [])
        const allSocialSignals = mentions.flatMap(m => m.social_signals || [])
        
        const key_themes = [...new Set(allThemes)].slice(0, 5)
        const social_signals = [...new Set(allSocialSignals)].slice(0, 5)

        const confidence = mentions.reduce((sum, m) => sum + (m.confidence_score || 0.5), 0) / mentions.length

        enhancedResults.push({
          symbol,
          current_sentiment,
          sentiment_velocity: sentimentVelocity,
          confidence,
          key_themes,
          social_signals,
          timestamp: new Date().toISOString()
        })

        console.log(`Enhanced sentiment for ${symbol}: Current=${current_sentiment.toFixed(2)}, Velocity 1h=${velocity_1h.toFixed(2)}, Volume Spike=${social_volume_spike}`)

      } catch (error) {
        console.error(`Error calculating enhanced sentiment for ${symbol}:`, error)
        continue
      }
    }

    // Store enhanced sentiment data
    if (enhancedResults.length > 0) {
      const { error: dbError } = await supabase
        .from('enhanced_sentiment_data')
        .upsert(enhancedResults, { 
          onConflict: 'symbol,timestamp',
          ignoreDuplicates: false 
        })

      if (dbError) {
        console.error('Database error storing enhanced sentiment:', dbError)
      } else {
        console.log(`Successfully stored ${enhancedResults.length} enhanced sentiment records`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        enhanced_sentiment: enhancedResults,
        total_symbols_analyzed: enhancedResults.length,
        total_posts_processed: limitedPosts.length,
        total_posts_available: posts.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in enhanced sentiment analysis function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
