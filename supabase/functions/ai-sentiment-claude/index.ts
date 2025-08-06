import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Anthropic API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { posts } = await req.json()
    console.log(`Analyzing sentiment for ${posts.length} posts with Claude`)

    const analyzedPosts = []

    for (const post of posts) {
      try {
        const text = `${post.title}\n\n${post.selftext || ''}`.slice(0, 3000)
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicApiKey,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1000,
            messages: [
              {
                role: 'user',
                content: `Analyze this Reddit post for financial sentiment. Return JSON only:

{
  "symbols_mentioned": ["SYMBOL1"],
  "overall_sentiment": 0.7,
  "sentiment_label": "bullish",
  "confidence_score": 0.85,
  "key_themes": ["earnings"],
  "investment_signals": ["buy_signal"]
}

Post from r/${post.subreddit}:
Title: ${post.title}
Content: ${post.selftext || 'No content'}
Engagement: ${post.score} upvotes, ${post.num_comments} comments

Rules:
- overall_sentiment: -1 to 1
- Extract stock tickers (AAPL, TSLA, etc.)
- sentiment_label: very_bearish/bearish/neutral/bullish/very_bullish`
              }
            ]
          }),
        })

        if (!response.ok) {
          console.error('Claude API error:', await response.text())
          continue
        }

        const data = await response.json()
        const analysisText = data.content[0].text

        let analysis
        try {
          analysis = JSON.parse(analysisText)
        } catch {
          console.error('Failed to parse Claude response')
          continue
        }

        // Store in database
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

        await supabase.from('sentiment_analysis').upsert(sentimentRecord, { 
          onConflict: 'post_id,subreddit',
          ignoreDuplicates: false 
        })

        analyzedPosts.push({ ...post, sentiment_analysis: analysis })
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error('Error analyzing post:', error)
        continue
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        analyzed_posts: analyzedPosts,
        total_analyzed: analyzedPosts.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in Claude sentiment analysis:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})