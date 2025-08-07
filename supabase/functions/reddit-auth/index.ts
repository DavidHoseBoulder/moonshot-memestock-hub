import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    const tokenData: RedditTokenResponse = await tokenResponse.json()
    console.log('Successfully authenticated with Reddit')

    // Parse request body to get subreddit and action
    const { subreddit = 'stocks', action = 'hot', limit = 25 } = await req.json().catch(() => ({}))

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
          console.log(`Failed endpoint ${endpoint}:`, e.message)
          continue
        }
      }
    }

    if (!postsResponse.ok) {
      console.error('Failed to fetch Reddit posts:', await postsResponse.text())
      
      // Return error instead of mock data
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Reddit API unavailable',
          posts: [],
          subreddit,
          action,
          total: 0
        }),
        { 
          status: 503, // Service Unavailable
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        posts,
        subreddit,
        action,
        total: posts.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in Reddit auth function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})