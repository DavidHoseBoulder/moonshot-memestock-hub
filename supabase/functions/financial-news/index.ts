
import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const priorityA = categoryPriority[categoryA] || 1;
    const priorityB = categoryPriority[categoryB] || 1;
    return priorityB - priorityA;
  });
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

// Canonical tickers derived from Supabase ticker_universe (cold start)
const SUPA_URL_T = Deno.env.get('SUPABASE_URL')!
const SUPA_KEY_T = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supaTickers = createClient(SUPA_URL_T, SUPA_KEY_T)
let CANONICAL_TICKERS: string[] = []
try {
  const { data, error } = await supaTickers
    .from('ticker_universe')
    .select('symbol')
    .eq('active', true)
    .order('priority', { ascending: true })
    .order('symbol', { ascending: true })
  if (!error && data) {
    CANONICAL_TICKERS = (data as any[]).map(r => String(r.symbol).toUpperCase())
  }
} catch (e: any) {
  console.warn('financial-news: failed to load ticker_universe', e?.message || e)
}
const SHORT_TICKERS = CANONICAL_TICKERS.filter(t => t.length <= 3)
const LONG_TICKERS = CANONICAL_TICKERS.filter(t => t.length > 3)
const SHORT_REGEX = CANONICAL_TICKERS.length ? new RegExp(`(^|\\W)(\\$(?:${SHORT_TICKERS.join('|')}))(\\W|$)`, 'gi') : /a^/i
const LONG_REGEX = CANONICAL_TICKERS.length ? new RegExp(`(^|\\W)(${LONG_TICKERS.join('|')})(\\W|$)`, 'gi') : /a^/i
function extractTickers(text: string): string[] {
  if (!text) return []
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = SHORT_REGEX.exec(text)) !== null) {
    const sym = m[2].replace('$','').toUpperCase()
    if (CANONICAL_TICKERS.includes(sym)) found.add(sym)
  }
  while ((m = LONG_REGEX.exec(text)) !== null) {
    const sym = (m[2] || '').toUpperCase()
    if (CANONICAL_TICKERS.includes(sym)) found.add(sym)
  }
  SHORT_REGEX.lastIndex = 0; LONG_REGEX.lastIndex = 0
  return Array.from(found)
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

    // Smart prioritization by category (social sentiment focus)
    const prioritizedSymbols = symbols ? prioritizeSymbolsByCategory(symbols) : []
    
    // Try multiple query strategies for better coverage
    const queries = [
      // Primary query with prioritized stock symbols
      prioritizedSymbols ? prioritizedSymbols.slice(0, 15).map((symbol: string) => `"${symbol}"`).join(' OR ') : '',
      // Secondary query with "stock" keyword for top symbols
      prioritizedSymbols ? prioritizedSymbols.slice(0, 10).map((symbol: string) => `"${symbol} stock"`).join(' OR ') : '',
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
            // Filter and enrich articles using unified ticker extraction
            const relevantArticles = data.articles.filter((article: any) => {
              const text = `${article.title || ''} ${article.description || ''} ${article.content || ''}`;
              const lower = text.toLowerCase();
              const isFinancial = lower.includes('stock') || lower.includes('market') || 
                                  lower.includes('trading') || lower.includes('earnings') || 
                                  lower.includes('revenue') || lower.includes('shares');
              if (!isFinancial) return false;
              if (!symbols) return true;
              const found = extractTickers(text);
              const filterSet = new Set(symbols.map((s: string) => s.toUpperCase()));
              return found.some(s => filterSet.has(s));
            }).map((article: any) => {
              const text = `${article.title || ''} ${article.description || ''} ${article.content || ''}`;
              return { ...article, symbols_mentioned: extractTickers(text) };
            });
            
            allArticles.push(...relevantArticles);
            console.log(`Query ${index + 1}: Found ${relevantArticles.length} relevant articles`);
          }
        } else if (response.status === 429) {
          console.warn(`Query ${index + 1} rate limited`);
          break; // Stop processing to preserve quota
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
