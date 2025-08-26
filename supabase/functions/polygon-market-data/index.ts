import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TechnicalIndicators {
  rsi: number
  sma_20: number
  sma_50: number
  volume_ratio: number
  momentum: number
  volatility: number
}

interface PolygonMarketData {
  symbol: string
  price: number
  volume: number
  timestamp: string
  technical_indicators: TechnicalIndicators
  price_change_1d: number
  price_change_5d: number
}

// Enhanced backoff-aware fetch helper with better 429 handling
async function fetchWithBackoff(url: string, init: RequestInit = {}, maxRetries = 5, baseDelayMs = 5000): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.ok || attempt >= maxRetries || (res.status < 500 && res.status !== 429)) return res;
    
    attempt++;
    let delay = baseDelayMs;
    
    if (res.status === 429) {
      // Handle rate limit with Retry-After header or aggressive backoff
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter) {
        delay = parseInt(retryAfter) * 1000; // Convert seconds to ms
      } else {
        delay = Math.min(60000, baseDelayMs * Math.pow(2, attempt)); // Cap at 60s
      }
    } else {
      // Exponential backoff for other errors
      delay = baseDelayMs * Math.pow(2, attempt);
    }
    
    const jitter = Math.floor(Math.random() * 1000); // Add jitter
    delay += jitter;
    
    console.warn(`Attempt ${attempt}/${maxRetries} failed with status ${res.status}, retrying in ${delay}ms`);
    await new Promise(r => setTimeout(r, delay));
  }
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

    const polygonApiKey = Deno.env.get('POLYGON_API_KEY')
    
    if (!polygonApiKey) {
      console.error('❌ Missing Polygon API key - returning fallback response')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing Polygon API key - configure in Supabase secrets',
          enhanced_data: [],
          fallback_available: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { symbols, days = 30 } = await req.json()
    
    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid symbols array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching Polygon market data for ${symbols.length} symbols over ${days} days`)

    const enhancedData: PolygonMarketData[] = []
    const BATCH_SIZE = 1 // Process one symbol at a time for rate limits
    const MAX_SYMBOLS = 10 // Limit to 10 symbols max for free tier
    
    // Limit symbols for free tier rate limits
    const limitedSymbols = symbols.slice(0, MAX_SYMBOLS)
    console.log(`Limited symbols from ${symbols.length} to ${limitedSymbols.length} for Polygon free tier`)
    
    // Process symbols in batches
    for (let i = 0; i < limitedSymbols.length; i += BATCH_SIZE) {
      const batch = limitedSymbols.slice(i, i + BATCH_SIZE)
      console.log(`Processing Polygon batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(limitedSymbols.length/BATCH_SIZE)}`)
      
      const batchPromises = batch.map(async (symbol) => {
        try {
          const toDate = new Date().toISOString().split('T')[0]
          const fromDate = new Date(Date.now() - (days * 2 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0] // Double the days to account for weekends
          
          // Get aggregated bars (daily data) - Using query parameter for API key, not Authorization header
          const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=5000&apikey=${polygonApiKey}`
          
          console.log(`Fetching Polygon data for ${symbol} from ${fromDate} to ${toDate}`)
          
          const response = await fetchWithBackoff(barsUrl)
        
          if (!response.ok) {
            console.error(`Failed to fetch Polygon data for ${symbol}:`, response.status, response.statusText)
            const errorText = await response.text()
            console.error(`Polygon API error response:`, errorText)
            return null
          }

          const data = await response.json()
          console.log(`Polygon response for ${symbol}:`, JSON.stringify(data).substring(0, 200))
        
          if (!data.results || data.results.length === 0) {
            console.log(`No Polygon data results for ${symbol}:`, data)
            return null
          }
          
          if (data.results.length < 1) {
            console.log(`No Polygon data for ${symbol}: ${data.results.length} bars`)
            return null
          }

          const results = data.results
          const prices = results.map((bar: any) => bar.c) // closing prices
          const volumes = results.map((bar: any) => bar.v) // volumes
          const timestamps = results.map((bar: any) => bar.t) // timestamps

          // Calculate technical indicators
          const validPrices = prices.filter((p: number) => p > 0)
          const validVolumes = volumes.filter((v: number) => v > 0)

          if (validPrices.length < 1) {
            console.log(`No valid price data for ${symbol}: only ${validPrices.length} valid prices`)
            return null
          }

          // Calculate RSI with adaptive period based on available data
          const rsiPeriod = Math.min(14, Math.floor(validPrices.length / 2))
          const rsi = validPrices.length >= 2 ? calculateRSI(validPrices.slice(-rsiPeriod)) : 50
        
          // Calculate moving averages with adaptive periods
          const sma20Period = Math.min(20, validPrices.length)
          const sma_20 = sma20Period > 0 ? 
            validPrices.slice(-sma20Period).reduce((sum: number, p: number) => sum + p, 0) / sma20Period : validPrices[validPrices.length - 1]
            
          const sma50Period = Math.min(50, validPrices.length)  
          const sma_50 = sma50Period > 0 ? 
            validPrices.slice(-sma50Period).reduce((sum: number, p: number) => sum + p, 0) / sma50Period : sma_20

          // Volume analysis
          const avgVolume = validVolumes.length > 0 ? 
            validVolumes.reduce((sum: number, v: number) => sum + v, 0) / validVolumes.length : 0
          const currentVolume = validVolumes[validVolumes.length - 1] || 0
          const volume_ratio = avgVolume > 0 ? currentVolume / avgVolume : 1

          // Price momentum and volatility
          const currentPrice = validPrices[validPrices.length - 1]
          const price_1d_ago = validPrices[validPrices.length - 2] || currentPrice
          const price_5d_ago = validPrices[validPrices.length - 6] || currentPrice
        
          const price_change_1d = ((currentPrice - price_1d_ago) / price_1d_ago) * 100
          const price_change_5d = ((currentPrice - price_5d_ago) / price_5d_ago) * 100
        
          const momentum = price_change_5d
          const volatility = calculateVolatility(validPrices.slice(-20))

          const technicalIndicators: TechnicalIndicators = {
            rsi,
            sma_20,
            sma_50,
            volume_ratio,
            momentum,
            volatility
          }

          console.log(`✅ Polygon data calculated for ${symbol}: Price=$${currentPrice.toFixed(2)}, RSI=${rsi.toFixed(1)}, Volume Ratio=${volume_ratio.toFixed(2)}x, Data Points=${validPrices.length}`)

          return {
            symbol: symbol.toUpperCase(),
            price: Math.round(currentPrice * 100) / 100,
            volume: Math.round(currentVolume),
            timestamp: new Date(timestamps[timestamps.length - 1]).toISOString(),
            technical_indicators: {
              rsi: Math.max(0, Math.min(100, rsi)),
              sma_20,
              sma_50, 
              volume_ratio: Math.max(0.1, volume_ratio),
              momentum,
              volatility
            },
            price_change_1d: Math.round(price_change_1d * 100) / 100,
            price_change_5d: Math.round(price_change_5d * 100) / 100,
            polygon_available: true,
            data_points: validPrices.length
          }

        } catch (error) {
          console.error(`Error processing Polygon data for ${symbol}:`, error)
          return null
        }
      })

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises)
      
      // Add successful results
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          enhancedData.push(result.value)
        }
      })
      
      // Aggressive rate limit delay between batches (30 seconds for free tier)
      if (i + BATCH_SIZE < limitedSymbols.length) {
        console.log(`Waiting 30 seconds before next batch to respect rate limits...`)
        await new Promise(resolve => setTimeout(resolve, 30000))
      }
    }

    // Store the enhanced data in the database
    if (enhancedData.length > 0) {
      console.log(`Storing ${enhancedData.length} Polygon records to enhanced_market_data table`)
      
      const dbRecords = enhancedData.map(item => ({
        symbol: item.symbol,
        price: item.price,
        volume: item.volume,
        timestamp: item.timestamp,
        technical_indicators: item.technical_indicators,
        price_change_1d: item.price_change_1d,
        price_change_5d: item.price_change_5d,
        data_date: new Date(item.timestamp).toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))

      const { error: insertError } = await supabase
        .from('enhanced_market_data')
        .upsert(dbRecords, { 
          onConflict: 'symbol,data_date',
          ignoreDuplicates: false 
        })

      if (insertError) {
        console.error('Error storing Polygon data to database:', insertError)
      } else {
        console.log(`✅ Successfully stored ${dbRecords.length} Polygon records to database`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        enhanced_data: enhancedData,
        total_processed: enhancedData.length,
        symbols_requested: symbols.length,
        source: 'polygon',
        stored_to_db: enhancedData.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in Polygon market data function:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error', 
        details: error.message,
        enhanced_data: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Technical indicator calculation functions
function calculateRSI(prices: number[]): number {
  if (prices.length < 2) return 50

  let gains = 0
  let losses = 0
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }
  
  const avgGain = gains / (prices.length - 1)
  const avgLoss = losses / (prices.length - 1)
  
  if (avgLoss === 0) return 100
  
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0
  
  const returns = []
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
  
  return Math.sqrt(variance) * 100 // Convert to percentage
}