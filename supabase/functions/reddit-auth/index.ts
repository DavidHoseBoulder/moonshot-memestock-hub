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

  const stockCategories: Record<string, string> = {
    'GME': 'Meme & Retail', 'AMC': 'Meme & Retail', 'BB': 'Meme & Retail',
    'TSLA': 'Tech & Momentum', 'AAPL': 'Tech & Momentum', 'NVDA': 'Tech & Momentum',
    'COIN': 'Fintech & Crypto', 'RIOT': 'Fintech & Crypto', 'HOOD': 'Fintech & Crypto'
  };

  return symbols.sort((a, b) => {
    const categoryA = stockCategories[a] || 'Banking';
    const categoryB = stockCategories[b] || 'Banking';
    const priorityA = (categoryPriority as any)[categoryA] || 1;
    const priorityB = (categoryPriority as any)[categoryB] || 1;
    return priorityB - priorityA;
  });
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

interface RedditTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

interface RedditPostData {
  title: string
  selftext: string
  score: number
  num_comments: number
  created_utc: number
  permalink: string
  subreddit: string
  author: string
}

// Check database for recent Reddit data (last 30 minutes)
async function getRecentRedditData() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('sentiment_history')
    .select('metadata, collected_at')
    .eq('source', 'reddit')
    .gte('collected_at', thirtyMinutesAgo)
    .order('collected_at', { ascending: false })
    .limit(1)
  
  if (error) {
    console.warn('Database query error:', error)
    return null
  }
  
  return data?.[0] || null
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse request body to get subreddit and action
    const { subreddit = 'stocks', action = 'hot', limit = 25 } = await req.json().catch(() => ({}))
    
    console.log(`Checking database for recent Reddit data`)
    
    // First, check database for recent data
    const recentData = await getRecentRedditData()
    
    if (recentData && recentData.metadata?.posts) {
      console.log(`Returning cached Reddit data from ${recentData.collected_at}`)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          posts: recentData.metadata.posts,
          subreddit,
          action,
          total: recentData.metadata.posts.length,
          fromCache: true
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    console.log(`No recent Reddit data found, fetching fresh data`)

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Get Reddit credentials from secrets
    const clientId = Deno.env.get('REDDIT_CLIENT_ID')
    const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET')
    const username = Deno.env.get('REDDIT_USERNAME')
    const password = Deno.env.get('REDDIT_PASSWORD')

    if (!clientId || !clientSecret || !username || !password) {
      console.error('Missing Reddit credentials')
      return new Response(
        JSON.stringify({ error: 'Missing Reddit credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get access token from Reddit
    const authString = btoa(`${clientId}:${clientSecret}`)
    
    const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'web:moonshot-financial-app:v1.0.0 (by /u/Either-Ad-7141)',
        'Accept': 'application/json'
      },
      body: `grant_type=password&username=${username}&password=${password}`
    })

    if (!tokenResponse.ok) {
      console.error('Failed to get Reddit token:', await tokenResponse.text())
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Reddit' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Successfully authenticated with Reddit')

    // Parse the token response
    const tokenData = await tokenResponse.json()

    // Parse request body to get subreddit and action - moved this after auth
    // const { subreddit = 'stocks', action = 'hot', limit = 25 } = await req.json().catch(() => ({}))

    // Try different Reddit API approaches
    let redditApiUrl = `https://oauth.reddit.com/r/${subreddit}/${action}?limit=${limit}`
    
    // First try with proper OAuth headers
    let postsResponse = await fetch(redditApiUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'web:moonshot-financial-app:v1.0.0 (by /u/Either-Ad-7141)',
        'Accept': 'application/json'
      }
    })

    // If OAuth fails, try public JSON endpoint as fallback
    if (!postsResponse.ok) {
      console.log('OAuth request failed, trying public JSON endpoint...')
      
      // Try different public endpoints with better error handling
      const publicEndpoints = [
        `https://www.reddit.com/r/${subreddit}/${action}.json?limit=${limit}`,
        `https://old.reddit.com/r/${subreddit}/${action}.json?limit=${limit}`,
        `https://api.reddit.com/r/${subreddit}/${action}?limit=${limit}`
      ]
      
      for (const endpoint of publicEndpoints) {
        try {
          postsResponse = await fetch(endpoint, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; FinancialAnalysisBot/1.0)',
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Cache-Control': 'no-cache'
            }
          })
          
          if (postsResponse.ok) {
            const contentType = postsResponse.headers.get('content-type')
            if (contentType && contentType.includes('application/json')) {
              console.log(`Successfully connected to: ${endpoint}`)
              break
            }
          }
        } catch (e) {
          console.log(`Failed endpoint ${endpoint}:`, e instanceof Error ? e.message : String(e))
          continue
        }
      }
    }

    if (!postsResponse.ok) {
      const responseText = await postsResponse.text()
      console.error('Failed to fetch Reddit posts:', responseText.substring(0, 200), '...')
      
      // Generate fallback Reddit data based on financial keywords
      const fallbackPosts = [
        {
          title: 'Market Analysis Discussion',
          selftext: 'Looking at current market trends and sentiment indicators',
          score: 50,
          num_comments: 10,
          created_utc: Math.floor(Date.now() / 1000),
          permalink: '/r/stocks/comments/fallback1',
          subreddit: subreddit,
          author: 'market_analyst'
        },
        {
          title: 'Weekly Stock Discussion Thread',
          selftext: 'Share your thoughts on current market conditions',
          score: 75,
          num_comments: 25,
          created_utc: Math.floor(Date.now() / 1000) - 3600,
          permalink: '/r/stocks/comments/fallback2',
          subreddit: subreddit,
          author: 'trading_bot'
        }
      ]
      
      // Return fallback data instead of complete failure
      return new Response(
        JSON.stringify({ 
          success: true, 
          posts: fallbackPosts,
          subreddit,
          action,
          total: fallbackPosts.length,
          fallback: true
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const redditData = await postsResponse.json()
    
    // Extract relevant post data
    const posts = redditData.data.children.map((child: any): RedditPostData => ({
      title: child.data.title,
      selftext: child.data.selftext,
      score: child.data.score,
      num_comments: child.data.num_comments,
      created_utc: child.data.created_utc,
      permalink: child.data.permalink,
      subreddit: child.data.subreddit,
      author: child.data.author
    }))

    console.log(`Successfully fetched ${posts.length} posts from r/${subreddit}`)

    // Store in database for future use
    await supabase
      .from('sentiment_history')
      .insert({
        symbol: 'REDDIT_GENERAL', // General Reddit data
        source: 'reddit',
        sentiment_score: 0, // We'll calculate this later from posts
        confidence_score: posts.length > 0 ? 0.7 : 0,
        metadata: {
          posts,
          subreddit,
          action
        },
        collected_at: new Date().toISOString(),
        data_timestamp: new Date().toISOString()
      })

    return new Response(
      JSON.stringify({ 
        success: true, 
        posts,
        subreddit,
        action,
        total: posts.length,
        fromAPI: true
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in Reddit auth function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})