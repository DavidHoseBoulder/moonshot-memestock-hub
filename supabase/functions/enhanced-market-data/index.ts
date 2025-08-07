
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

interface EnhancedMarketData {
  symbol: string
  price: number
  volume: number
  timestamp: string
  technical_indicators: TechnicalIndicators
  price_change_1d: number
  price_change_5d: number
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

    const { symbols, days = 30 } = await req.json()
    
    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid symbols array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching enhanced market data for ${symbols.length} symbols over ${days} days`)

    // Check for cached data first
    const { data: cachedData, error: cacheError } = await supabase
      .from('enhanced_market_data')
      .select('*')
      .in('symbol', symbols)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // 24 hours ago

    if (cacheError) {
      console.error('Cache check error:', cacheError)
    }

    const cachedSymbols = new Set(cachedData?.map(d => d.symbol) || [])
    const symbolsToFetch = symbols.filter(symbol => !cachedSymbols.has(symbol.toUpperCase()))
    
    console.log(`Found ${cachedData?.length || 0} cached symbols, fetching ${symbolsToFetch.length} new symbols`)

    const enhancedData: EnhancedMarketData[] = []
    
    // Add cached data to results
    if (cachedData) {
      cachedData.forEach(cached => {
        enhancedData.push({
          symbol: cached.symbol,
          price: cached.price,
          volume: cached.volume,
          timestamp: cached.timestamp,
          technical_indicators: cached.technical_indicators,
          price_change_1d: cached.price_change_1d,
          price_change_5d: cached.price_change_5d
        })
      })
    }

    // Only fetch data for symbols not in cache
    if (symbolsToFetch.length === 0) {
      console.log('All data found in cache, returning cached results')
      return new Response(
        JSON.stringify({ 
          success: true, 
          enhanced_data: enhancedData,
          total_processed: enhancedData.length,
          symbols_requested: symbols.length,
          from_cache: true
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const BATCH_SIZE = 5 // Reduced batch size for reliability
    const REQUEST_TIMEOUT = 8000 // Increased timeout
    
    // Process symbols in batches to avoid timeouts
    for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
      const batch = symbolsToFetch.slice(i, i + BATCH_SIZE)
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(symbolsToFetch.length/BATCH_SIZE)}`)
      
      const batchPromises = batch.map(async (symbol) => {
        try {
          const period1 = Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000)
          const period2 = Math.floor(Date.now() / 1000)
          
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`
          
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
          
          const response = await fetch(yahooUrl, { 
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; FinanceBot/1.0)'
            }
          })
          clearTimeout(timeoutId)
        
          if (!response.ok) {
            console.error(`Failed to fetch data for ${symbol}:`, response.status)
            return null
          }

          const data = await response.json()
        
          if (!data.chart?.result?.[0]) {
            console.error(`No data found for symbol: ${symbol}`)
            return null
          }

          const result = data.chart.result[0]
          const timestamps = result.timestamp
          const prices = result.indicators.quote[0].close
          const volumes = result.indicators.quote[0].volume

          // Calculate technical indicators
          const validPrices = prices.filter(p => p !== null)
          const validVolumes = volumes.filter(v => v !== null && v > 0)

          if (validPrices.length < 20) {
            console.log(`Insufficient data for ${symbol}, skipping`)
            return null
          }

          // Calculate RSI (simplified 14-period)
          const rsi = calculateRSI(validPrices.slice(-14))
        
          // Calculate moving averages
          const sma_20 = validPrices.slice(-20).reduce((sum, p) => sum + p, 0) / 20
          const sma_50 = validPrices.length >= 50 ? 
            validPrices.slice(-50).reduce((sum, p) => sum + p, 0) / 50 : sma_20

          // Volume analysis
          const avgVolume = validVolumes.length > 0 ? 
            validVolumes.reduce((sum, v) => sum + v, 0) / validVolumes.length : 0
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


          console.log(`Enhanced data calculated for ${symbol}: RSI=${rsi.toFixed(2)}, Volume Ratio=${volume_ratio.toFixed(2)}`)

          return {
            symbol: symbol.toUpperCase(),
            price: currentPrice,
            volume: currentVolume,
            timestamp: new Date(timestamps[timestamps.length - 1] * 1000).toISOString(),
            technical_indicators: technicalIndicators,
            price_change_1d,
            price_change_5d
          }

        } catch (error) {
          console.error(`Error processing ${symbol}:`, error)
          return null
        }
      })

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises)
      
      // Add successful results to enhancedData
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          enhancedData.push(result.value)
        }
      })
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < symbolsToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // Store new enhanced market data in cache
    if (enhancedData.length > cachedData?.length || 0) {
      const newData = enhancedData.slice(cachedData?.length || 0)
      const { error: dbError } = await supabase
        .from('enhanced_market_data')
        .upsert(newData.map(item => ({
          symbol: item.symbol,
          price: item.price,
          volume: item.volume,
          timestamp: item.timestamp,
          technical_indicators: item.technical_indicators,
          price_change_1d: item.price_change_1d,
          price_change_5d: item.price_change_5d,
          data_date: new Date().toISOString().split('T')[0]
        })), { 
          onConflict: 'symbol,data_date',
          ignoreDuplicates: false 
        })

      if (dbError) {
        console.error('Database error storing enhanced market data:', dbError)
      } else {
        console.log(`Successfully cached ${newData.length} new enhanced market data points`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        enhanced_data: enhancedData,
        total_processed: enhancedData.length,
        symbols_requested: symbols.length,
        cached_count: cachedData?.length || 0,
        new_fetched: symbolsToFetch.length,
        from_cache: symbolsToFetch.length === 0
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in enhanced market data function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
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
