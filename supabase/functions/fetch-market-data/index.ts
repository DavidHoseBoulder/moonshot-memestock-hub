import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MarketDataPoint {
  symbol: string
  price: number
  price_open: number
  price_high: number
  price_low: number
  volume: number | null
  timestamp: string
  asset_type: 'stock' | 'crypto'
}

interface TechnicalIndicators {
  rsi: number
  sma_20: number
  sma_50: number
  volume_ratio: number
  momentum: number
  volatility: number
}

interface EnhancedMarketDataPoint {
  symbol: string
  price: number
  price_open: number
  price_high: number
  price_low: number
  volume: number | null
  timestamp: string
  technical_indicators: TechnicalIndicators
  price_change_1d: number
  price_change_5d: number
  data_date: string
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

    const { symbols, days = 30 } = await req.json()
    
    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid symbols array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching market data for symbols: ${symbols.join(', ')} over ${days} days`)

    const marketData: MarketDataPoint[] = []
    const perSymbolMap = new Map<string, MarketDataPoint[]>()
    
    for (const symbol of symbols) {
      try {
        // Use Yahoo Finance API (free, no API key required)
        const period1 = Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000)
        const period2 = Math.floor(Date.now() / 1000)
        
        console.log(`Period1: ${new Date(period1 * 1000).toISOString()}, Period2: ${new Date(period2 * 1000).toISOString()}`)
        
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`
        
        console.log(`Fetching data for ${symbol} from Yahoo Finance`)
        const response = await fetch(yahooUrl)
        
        if (!response.ok) {
          console.error(`Failed to fetch data for ${symbol}:`, response.status)
          continue
        }

        const data = await response.json()
        
        if (!data.chart?.result?.[0]) {
          console.error(`No data found for symbol: ${symbol}`)
          continue
        }

        const result = data.chart.result[0]
        const timestamps = result.timestamp
        const quotes = result.indicators.quote[0]
        const prices = quotes.close
        const openPrices = quotes.open
        const highPrices = quotes.high
        const lowPrices = quotes.low
        const volumes = quotes.volume

        // Convert to our format
        for (let i = 0; i < timestamps.length; i++) {
          if (prices[i] !== null) {
            const point: MarketDataPoint = {
              symbol: symbol.toUpperCase(),
              price: prices[i],
              price_open: openPrices[i] || prices[i],
              price_high: highPrices[i] || prices[i],
              price_low: lowPrices[i] || prices[i],
              volume: volumes[i] != null ? volumes[i] : null,
              timestamp: new Date(timestamps[i] * 1000).toISOString(),
              asset_type: symbol.match(/^(BTC|ETH|DOGE|ADA|DOT)/) ? 'crypto' : 'stock'
            }

            marketData.push(point)

            if (!perSymbolMap.has(point.symbol)) {
              perSymbolMap.set(point.symbol, [])
            }
            perSymbolMap.get(point.symbol)?.push(point)
          }
        }

        console.log(`Successfully fetched ${prices.filter((p: any) => p !== null).length} data points for ${symbol}`)

      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error)
        continue
      }
    }

    // Store market data in database
    if (marketData.length > 0) {
      const enhancedData: EnhancedMarketDataPoint[] = []

      for (const [symbol, points] of perSymbolMap.entries()) {
        const orderedPoints = [...points].sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )

        for (let i = 0; i < orderedPoints.length; i++) {
          const current = orderedPoints[i]
          const windowStart = Math.max(0, i - 59) // up to last 60 observations
          const windowPoints = orderedPoints.slice(windowStart, i + 1)

          const closes = windowPoints
            .map(p => p.price)
            .filter((p): p is number => typeof p === 'number' && !Number.isNaN(p) && p > 0)

          const volumes = windowPoints
            .map(p => p.volume ?? 0)
            .filter(v => typeof v === 'number' && !Number.isNaN(v) && v > 0)

          if (closes.length === 0) {
            continue
          }

          const rsi = closes.length >= 14 ? calculateRSI(closes.slice(-14)) : calculateRSI(closes)
          const sma_20 = closes.length >= 20
            ? average(closes.slice(-20))
            : average(closes)
          const sma_50 = windowPoints.length >= 50
            ? average(
              orderedPoints
                .slice(Math.max(0, i - 49), i + 1)
                .map(p => p.price)
                .filter((p): p is number => typeof p === 'number' && !Number.isNaN(p) && p > 0),
            )
            : sma_20

          const avgVolume = volumes.length > 0 ? average(volumes) : 0
          const currentVolume = current.volume ?? 0
          const volume_ratio = avgVolume > 0 ? Math.max(currentVolume / avgVolume, 0.1) : 1

          const previousClose = i > 0 ? orderedPoints[i - 1].price : current.price
          const previousClose5 = i >= 5 ? orderedPoints[i - 5].price : current.price

          const price_change_1d = previousClose && previousClose > 0
            ? ((current.price - previousClose) / previousClose) * 100
            : 0
          const price_change_5d = previousClose5 && previousClose5 > 0
            ? ((current.price - previousClose5) / previousClose5) * 100
            : 0

          const momentum = previousClose ? current.price - previousClose : 0
          const volatilitySeries = closes.slice(-Math.min(20, closes.length))
          const volatility = volatilitySeries.length >= 2
            ? calculateVolatility(volatilitySeries)
            : 0

          const technicalIndicators: TechnicalIndicators = {
            rsi: clamp(rsi, 0, 100),
            sma_20,
            sma_50,
            volume_ratio,
            momentum,
            volatility
          }

          enhancedData.push({
            symbol,
            price: roundTo(current.price, 2),
            price_open: roundTo(current.price_open, 2),
            price_high: roundTo(current.price_high, 2),
            price_low: roundTo(current.price_low, 2),
            volume: current.volume != null ? Math.round(current.volume) : null,
            timestamp: current.timestamp,
            technical_indicators: technicalIndicators,
            price_change_1d: roundTo(price_change_1d, 2),
            price_change_5d: roundTo(price_change_5d, 2),
            data_date: new Date(current.timestamp).toISOString().split('T')[0]
          })
        }
      }

      const { error: dbError } = await supabase
        .from('enhanced_market_data')
        .upsert(enhancedData.map(item => ({
          symbol: item.symbol,
          price_close: item.price,
          price_open: item.price_open,
          price_high: item.price_high,
          price_low: item.price_low,
          volume: item.volume,
          timestamp: item.timestamp,
          technical_indicators: item.technical_indicators,
          price_change_1d: item.price_change_1d,
          price_change_5d: item.price_change_5d,
          data_date: item.data_date
        })), { 
          onConflict: 'symbol,data_date',
          ignoreDuplicates: false 
        })

      if (dbError) {
        console.error('Database error storing market data:', dbError)
        return new Response(
          JSON.stringify({ error: 'Failed to store market data', details: dbError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Successfully stored ${enhancedData.length} market data points with technical indicators`)
    }

    // Generate some sample correlation data for demonstration
    const correlationData = symbols.map(symbol => {
      const symbolData = marketData.filter(d => d.symbol === symbol.toUpperCase())
      if (symbolData.length === 0) return null

      const avgPrice = symbolData.reduce((sum, d) => sum + d.price, 0) / symbolData.length
      const priceChange = symbolData.length > 1 ? 
        ((symbolData[symbolData.length - 1].price - symbolData[0].price) / symbolData[0].price) * 100 : 0

      return {
        symbol: symbol.toUpperCase(),
        data_points: symbolData.length,
        avg_price: avgPrice,
        price_change_percent: priceChange,
        date_range: {
          start: symbolData[0]?.timestamp,
          end: symbolData[symbolData.length - 1]?.timestamp
        }
      }
    }).filter(Boolean)

    return new Response(
      JSON.stringify({ 
        success: true, 
        market_data: correlationData,
        total_data_points: marketData.length,
        symbols_processed: symbols.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in market data function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

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

  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]
    const curr = prices[i]
    if (prev > 0) {
      returns.push((curr - prev) / prev)
    }
  }

  if (returns.length === 0) return 0

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    returns.length

  return Math.sqrt(variance) * 100
}
