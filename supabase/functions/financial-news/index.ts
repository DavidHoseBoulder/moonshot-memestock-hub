
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NewsArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  publishedAt: string;
  source: {
    name: string;
  };
  sentiment?: number;
  symbols_mentioned?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const newsApiKey = Deno.env.get('NEWS_API_KEY')
    
    if (!newsApiKey) {
      console.error('Missing NEWS_API_KEY')
      return new Response(
        JSON.stringify({ 
          error: 'News API key not configured',
          articles: [],
          totalResults: 0
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { symbols, days = 1 } = await req.json()
    const symbolsQuery = symbols ? symbols.join(' OR ') : 'stocks OR trading OR market'
    
    console.log(`Fetching financial news for: ${symbolsQuery}`)

    // Fetch from NewsAPI
    const fromDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
    const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(symbolsQuery)}&language=en&sortBy=publishedAt&from=${fromDate}&pageSize=50`

    const response = await fetch(newsUrl, {
      headers: {
        'X-API-Key': newsApiKey,
        'User-Agent': 'Financial-Pipeline/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`NewsAPI error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log(`Retrieved ${data.articles?.length || 0} financial news articles`)

    // Filter for financial relevance
    const financialArticles = data.articles?.filter((article: any) => {
      const text = `${article.title} ${article.description}`.toLowerCase()
      return text.includes('stock') || text.includes('market') || text.includes('trading') ||
             text.includes('earnings') || text.includes('revenue') || text.includes('shares')
    }) || []

    return new Response(
      JSON.stringify({ 
        articles: financialArticles,
        totalResults: financialArticles.length,
        source: 'NewsAPI'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in financial news function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
