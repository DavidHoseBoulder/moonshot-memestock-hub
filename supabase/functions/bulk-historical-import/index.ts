import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImportProgress {
  total_symbols: number
  processed_symbols: number
  current_symbol: string
  start_date: string
  end_date: string
  status: 'running' | 'completed' | 'error'
  last_updated: string
}

interface TechnicalIndicators {
  rsi: number
  sma_20: number
  sma_50: number
  volume_ratio: number
  momentum: number
  volatility: number
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

    const { 
      symbols = [], 
      days = 90, 
      batch_size = 5,
      delay_ms = 3000 
    } = await req.json()
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid symbols array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Starting bulk historical import for ${symbols.length} symbols, ${days} days`)

    // Start background task without blocking response
    const backgroundImport = async () => {
      let processed = 0
      const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000))
      const endDate = new Date()

      for (let i = 0; i < symbols.length; i += batch_size) {
        const batch = symbols.slice(i, i + batch_size)
        const batchNum = Math.floor(i / batch_size) + 1
        const totalBatches = Math.ceil(symbols.length / batch_size)
        
        console.log(`Processing batch ${batchNum}/${totalBatches}: ${batch.join(', ')}`)

        // Process batch in parallel
        const batchPromises = batch.map(async (symbol) => {
          try {
            const period1 = Math.floor(startDate.getTime() / 1000)
            const period2 = Math.floor(endDate.getTime() / 1000)
            
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`
            
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
            
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
            const quotes = result.indicators.quote[0]
            const prices = quotes.close
            const openPrices = quotes.open
            const highPrices = quotes.high
            const lowPrices = quotes.low
            const volumes = quotes.volume

            // Process all historical data points for this symbol
            const historicalData = []
            
            for (let j = 0; j < timestamps.length; j++) {
              if (prices[j] === null || prices[j] === undefined) continue

              const currentDate = new Date(timestamps[j] * 1000)
              const validPrices = prices.slice(Math.max(0, j - 19), j + 1).filter((p: any) => p !== null)
              const validVolumes = volumes.slice(Math.max(0, j - 19), j + 1).filter((v: any) => v !== null && v > 0)

              if (validPrices.length < 10) continue // Need minimum data for indicators

              // Calculate technical indicators
              const rsi = calculateRSI(validPrices.slice(-14))
              const sma_20 = validPrices.length >= 20 ? 
                validPrices.reduce((sum: number, p: any) => sum + p, 0) / validPrices.length : validPrices[validPrices.length - 1]
              const sma_50 = j >= 49 ? 
                prices.slice(j - 49, j + 1).filter((p: any) => p !== null).reduce((sum: number, p: any) => sum + p, 0) / 50 : sma_20

              const avgVolume = validVolumes.length > 0 ? 
                validVolumes.reduce((sum: number, v: any) => sum + v, 0) / validVolumes.length : 0
              const currentVolume = volumes[j] || 0
              const volume_ratio = avgVolume > 0 ? currentVolume / avgVolume : 1

              const currentPrice = prices[j]
              const price_1d_ago = j > 0 ? (prices[j - 1] || currentPrice) : currentPrice
              const price_5d_ago = j >= 5 ? (prices[j - 5] || currentPrice) : currentPrice
              
              const price_change_1d = ((currentPrice - price_1d_ago) / price_1d_ago) * 100
              const price_change_5d = ((currentPrice - price_5d_ago) / price_5d_ago) * 100
              
              const momentum = price_change_5d
              const volatility = calculateVolatility(validPrices.slice(-10))

              const technicalIndicators: TechnicalIndicators = {
                rsi,
                sma_20,
                sma_50,
                volume_ratio,
                momentum,
                volatility
              }

              historicalData.push({
                symbol: symbol.toUpperCase(),
                price_open: (openPrices && openPrices[j] != null) ? openPrices[j] : currentPrice,
                price_high: (highPrices && highPrices[j] != null) ? highPrices[j] : currentPrice,
                price_low: (lowPrices && lowPrices[j] != null) ? lowPrices[j] : currentPrice,
                price_close: currentPrice,
                volume: currentVolume,
                timestamp: currentDate.toISOString(),
                technical_indicators: technicalIndicators,
                price_change_1d,
                price_change_5d,
                data_date: currentDate.toISOString().split('T')[0]
              })
            }

            // Batch insert historical data
            if (historicalData.length > 0) {
              const { error: dbError } = await supabase
                .from('enhanced_market_data')
                .upsert(historicalData, { 
                  onConflict: 'symbol,data_date',
                  ignoreDuplicates: false 
                })

              if (dbError) {
                console.error(`Database error for ${symbol}:`, dbError)
              } else {
                console.log(`Stored ${historicalData.length} historical data points for ${symbol}`)
              }
            }

            processed++
            return symbol

          } catch (error) {
            console.error(`Error processing ${symbol}:`, error)
            return null
          }
        })

        // Wait for batch to complete
        const batchResults = await Promise.allSettled(batchPromises)
        const successCount = batchResults.filter(r => r.status === 'fulfilled' && r.value).length
        
        console.log(`Batch ${batchNum}/${totalBatches} completed: ${successCount}/${batch.length} successful`)

        // Delay between batches to avoid rate limiting
        if (i + batch_size < symbols.length) {
          console.log(`Waiting ${delay_ms}ms before next batch...`)
          await new Promise(resolve => setTimeout(resolve, delay_ms))
        }
      }

      console.log(`Bulk historical import completed. Processed ${processed}/${symbols.length} symbols`)
    }

    // Start background task (removed EdgeRuntime as it's not available in all environments)
    backgroundImport().catch(console.error)

    // Return immediate response
    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Historical import started for ${symbols.length} symbols`,
        estimated_duration_minutes: Math.ceil((symbols.length / batch_size) * (delay_ms / 1000) / 60),
        symbols_queued: symbols.length,
        days_requested: days
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in bulk historical import function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error) 
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