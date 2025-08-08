
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
    
    console.log(`Fetching financial news for ${symbols?.length || 0} symbols...`)

    // Try multiple query strategies for better coverage
    const queries = [
      // Primary query with stock symbols
      symbols ? symbols.slice(0, 15).map((symbol: string) => `"${symbol}"`).join(' OR ') : '',
      // Secondary query with "stock" keyword
      symbols ? symbols.slice(0, 10).map((symbol: string) => `"${symbol} stock"`).join(' OR ') : '',
      // Fallback general financial query
      'stock market earnings financial news'
    ].filter(q => q);

    let allArticles: any[] = [];
    const fromDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    
    for (const [index, query] of queries.entries()) {
      try {
        const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&from=${fromDate}&pageSize=${index === 0 ? 100 : 50}&domains=reuters.com,bloomberg.com,cnbc.com,marketwatch.com,finance.yahoo.com,fool.com,seekingalpha.com,benzinga.com,finviz.com,biztoc.com`;

        const response = await fetch(newsUrl, {
          headers: {
            'X-API-Key': newsApiKey,
            'User-Agent': 'Financial-Pipeline/1.0'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.articles && data.articles.length > 0) {
            // Filter articles that mention our symbols
            const relevantArticles = data.articles.filter((article: any) => {
              const content = `${article.title} ${article.description || ''}`.toLowerCase();
              const isFinancial = content.includes('stock') || content.includes('market') || 
                                content.includes('trading') || content.includes('earnings') || 
                                content.includes('revenue') || content.includes('shares');
              
              if (!symbols) return isFinancial;
              
              const mentionsSymbol = symbols.some((symbol: string) => 
                content.includes(symbol.toLowerCase()) || 
                content.includes(`$${symbol.toLowerCase()}`)
              );
              
              return isFinancial && mentionsSymbol;
            });
            
            allArticles.push(...relevantArticles);
            console.log(`Query ${index + 1}: Found ${relevantArticles.length} relevant articles`);
          }
        } else {
          console.warn(`Query ${index + 1} failed: ${response.status}`);
        }
      } catch (queryError) {
        console.warn(`Query ${index + 1} error:`, queryError.message);
      }
      
      // Delay between queries to respect rate limits
      if (index < queries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Remove duplicates and sort by publication date
    const uniqueArticles = allArticles
      .filter((article, index, self) => 
        index === self.findIndex(a => a.url === article.url)
      )
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 100); // Limit to 100 most recent

    console.log(`Successfully fetched ${uniqueArticles.length} unique financial articles`);

    return new Response(
      JSON.stringify({ 
        articles: uniqueArticles,
        totalResults: uniqueArticles.length,
        source: 'NewsAPI Enhanced'
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
