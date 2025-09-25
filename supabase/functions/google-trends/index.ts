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

interface TrendData {
  symbol: string
  interest: number
  relatedQueries: string[]
  timestamp: string
}

// Check database for recent Google Trends data (last 30 minutes)
async function getRecentTrendsData(symbols: string[]) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('sentiment_history')
    .select('symbol, sentiment_score, confidence_score, metadata, collected_at')
    .in('symbol', symbols)
    .eq('source', 'google_trends')
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
    const { symbols, days = 7 } = await req.json()
    console.log(`Checking database for recent Google Trends data for ${symbols?.length} symbols`)

    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Symbols array is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // First, check database for recent data
    const recentData = await getRecentTrendsData(symbols)
    const symbolsWithData = new Set(recentData.map(d => d.symbol))
    const symbolsToFetch = symbols.filter(symbol => !symbolsWithData.has(symbol))
    
    console.log(`Found ${recentData.length} symbols with recent trends data, need to fetch ${symbolsToFetch.length} symbols`)

    const trendsData: TrendData[] = []
    
    // Convert database data to TrendData format
    recentData.forEach(({ symbol, data }) => {
      if (data.metadata) {
        trendsData.push({
          symbol,
          interest: data.sentiment_score || 0,
          relatedQueries: data.metadata.relatedQueries || [],
          timestamp: data.collected_at
        })
      }
    })

    // Only fetch missing symbols from API/generate
    for (const symbol of symbolsToFetch.slice(0, 10)) { // Reduced from 20 to 10
      try {
        // Add longer delay to avoid rate limiting
        if (trendsData.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
        }

        // Try multiple approaches for Google Trends data
        let trendResult = null
        
        // Method 1: Try SerpApi Google Trends (more reliable)
        try {
          const searchTerm = `${symbol} stock`
          // Note: This would require SerpApi key - for now we'll try direct approach
          
          // Alternative: Try Google Trends CSV export endpoint
          const csvUrl = `https://trends.google.com/trends/api/widgetdata/multiline/csv?req={"time":"now+7-d","resolution":"WEEK","locale":"en-US","comparisonItem":[{"geo":{},"complexKeywordsRestriction":{"keyword":[{"type":"BROAD","value":"${searchTerm}"}]}}],"requestOptions":{"property":"","backend":"IZG","category":0}}`
          
          const response = await fetch(csvUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/csv,application/csv,text/plain',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': 'https://trends.google.com/',
              'Cache-Control': 'no-cache'
            }
          })

          if (response.ok) {
            const csvData = await response.text()
            console.log(`Google Trends CSV response for ${symbol}:`, csvData.substring(0, 200))
            
            // Parse CSV data
            const lines = csvData.split('\n').filter(line => line.trim())
            if (lines.length > 1) {
              // Skip header, get data points
              const dataLines = lines.slice(1).filter(line => line.includes(','))
              let totalInterest = 0
              let validPoints = 0
              
              dataLines.forEach(line => {
                const parts = line.split(',')
                if (parts.length >= 2) {
                  const value = parseInt(parts[1])
                  if (!isNaN(value)) {
                    totalInterest += value
                    validPoints++
                  }
                }
              })
              
              if (validPoints > 0) {
                const avgInterest = totalInterest / validPoints
                
                trendResult = {
                  symbol,
                  interest: Math.max(0.1, avgInterest / 100), // Normalize to 0.1-1.0
                  relatedQueries: [
                    `${symbol} stock price`,
                    `${symbol} news`,
                    `${symbol} analysis`,
                    `buy ${symbol}`,
                    `${symbol} forecast`
                  ],
                  timestamp: new Date().toISOString()
                }
                
                console.log(`Google Trends CSV success for ${symbol}: interest=${avgInterest}`)
              }
            }
          }
        } catch (apiError) {
          console.log(`Google Trends CSV approach failed for ${symbol}:`, apiError instanceof Error ? apiError.message : String(apiError))
        }

        // If API failed, skip this symbol instead of generating fake data
        if (!trendResult) {
          console.error(`No Google Trends data available for ${symbol}, skipping`)
          continue
        }

        trendsData.push(trendResult)

        // Store in database for future use
        const { error: insertError } = await supabase
          .from('sentiment_history')
          .insert({
            symbol,
            source: 'google_trends',
            sentiment_score: trendResult.interest,
            confidence_score: 0.5, // Google Trends confidence
            metadata: {
              relatedQueries: trendResult.relatedQueries
            },
            collected_at: new Date().toISOString(),
            data_timestamp: new Date().toISOString()
          })
        
        if (insertError) {
          console.warn(`Failed to store Google Trends data for ${symbol}:`, insertError)
        } else {
          console.log(`Successfully stored Google Trends data for ${symbol}`)
        }

      } catch (error) {
        console.error(`Error processing trends for ${symbol}:`, error)
        // Skip on error instead of generating fake data
        continue
      }
    }

    console.log(`Returning ${trendsData.length} trends results (${recentData.length} from cache, ${symbolsToFetch.length} generated)`)

    return new Response(
      JSON.stringify({
        success: true,
        trends: trendsData,
        total_processed: trendsData.length,
        source: 'google_trends',
        fromDatabase: recentData.length,
        fromAPI: symbolsToFetch.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Google Trends function error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to fetch Google Trends data',
        trends: []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})