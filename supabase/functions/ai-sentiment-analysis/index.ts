import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RedditPost {
  title: string
  selftext: string
  score: number
  num_comments: number
  created_utc: number
  permalink: string
  subreddit: string
  author: string
}

interface SentimentAnalysis {
  symbols_mentioned: string[]
  overall_sentiment: number
  sentiment_label: string
  confidence_score: number
  key_themes: string[]
  investment_signals: string[]
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')
    console.log('OpenAI API Key check:', openAIApiKey ? 'Key found' : 'Key missing')
    
    if (!openAIApiKey) {
      console.error('Missing OpenAI API key')
      return new Response(
        JSON.stringify({ error: 'Missing OpenAI API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { posts } = await req.json()
    if (!posts || !Array.isArray(posts)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid posts array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Analyzing sentiment for ${posts.length} posts`)

    const analyzedPosts = []

    for (const post of posts) {
      try {
        // Prepare text for analysis
        const text = `${post.title}\n\n${post.selftext || ''}`.slice(0, 3000)
        
        // Call OpenAI for sentiment analysis
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4.1-2025-04-14',
            messages: [
              {
                role: 'system',
                content: `You are a financial sentiment analysis expert. Analyze Reddit posts for investment sentiment and extract financial signals.

Return your analysis as JSON in this exact format:
{
  "symbols_mentioned": ["SYMBOL1", "SYMBOL2"],
  "overall_sentiment": 0.7,
  "sentiment_label": "bullish",
  "confidence_score": 0.85,
  "key_themes": ["earnings", "growth"],
  "investment_signals": ["buy_signal", "momentum"]
}

Guidelines:
- overall_sentiment: -1 (very bearish) to 1 (very bullish)
- sentiment_label: "very_bearish", "bearish", "neutral", "bullish", "very_bullish"
- confidence_score: 0 to 1 (how confident you are in the analysis)
- symbols_mentioned: extract stock tickers mentioned (e.g. AAPL, TSLA, BTC, ETH)
- key_themes: main topics discussed (e.g. "earnings", "technical_analysis", "regulatory")
- investment_signals: actionable signals (e.g. "buy_signal", "sell_signal", "hold", "momentum", "reversal")`
              },
              {
                role: 'user',
                content: `Analyze this Reddit post from r/${post.subreddit}:

Title: ${post.title}

Content: ${post.selftext || 'No additional content'}

Engagement: ${post.score} upvotes, ${post.num_comments} comments`
              }
            ],
            temperature: 0.3
          }),
        })

        if (!response.ok) {
          console.error('OpenAI API error:', await response.text())
          continue
        }

        const data = await response.json()
        const analysisText = data.choices[0].message.content

        let analysis: SentimentAnalysis
        try {
          analysis = JSON.parse(analysisText)
        } catch (parseError) {
          console.error('Failed to parse OpenAI response:', analysisText)
          continue
        }

        // Store sentiment analysis in database
        const postId = `${post.subreddit}_${post.permalink.split('/').slice(-2)[0]}`
        const sentimentRecord = {
          post_id: postId,
          subreddit: post.subreddit,
          title: post.title,
          content: post.selftext,
          author: post.author,
          score: post.score,
          num_comments: post.num_comments,
          post_created_at: new Date(post.created_utc * 1000).toISOString(),
          symbols_mentioned: analysis.symbols_mentioned,
          overall_sentiment: analysis.overall_sentiment,
          sentiment_label: analysis.sentiment_label,
          confidence_score: analysis.confidence_score,
          key_themes: analysis.key_themes,
          investment_signals: analysis.investment_signals
        }

        const { error: dbError } = await supabase
          .from('sentiment_analysis')
          .upsert(sentimentRecord, { 
            onConflict: 'post_id,subreddit',
            ignoreDuplicates: false 
          })

        if (dbError) {
          console.error('Database error:', dbError)
        } else {
          console.log(`Stored sentiment analysis for post: ${postId}`)
        }

        // Also store in sentiment_history for each symbol mentioned
        if (analysis.symbols_mentioned && analysis.symbols_mentioned.length > 0) {
          for (const symbol of analysis.symbols_mentioned) {
            const historyRecord = {
              symbol: symbol,
              source: 'reddit',
              sentiment_score: analysis.overall_sentiment,
              confidence_score: analysis.confidence_score,
              data_timestamp: new Date(post.created_utc * 1000).toISOString(),
              source_id: postId,
              content_snippet: post.title.substring(0, 200),
              metadata: {
                subreddit: post.subreddit,
                score: post.score,
                num_comments: post.num_comments,
                themes: analysis.key_themes,
                signals: analysis.investment_signals
              }
            }

            const { error: historyError } = await supabase
              .from('sentiment_history')
              .insert(historyRecord)

            if (historyError) {
              console.error('Error storing sentiment history:', historyError)
            }
          }
        }

        analyzedPosts.push({
          ...post,
          sentiment_analysis: analysis
        })

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error('Error analyzing post:', error)
        continue
      }
    }

    console.log(`Successfully analyzed ${analyzedPosts.length} posts`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        analyzed_posts: analyzedPosts,
        total_analyzed: analyzedPosts.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in AI sentiment analysis function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})