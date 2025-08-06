import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MarketDataPoint {
  symbol: string
  price: number
  volume?: number
  timestamp: string
  asset_type: 'stock' | 'crypto'
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
    
    for (const symbol of symbols) {
      try {
        // Use Yahoo Finance API (free, no API key required)
        const period1 = Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000)
        const period2 = Math.floor(Date.now() / 1000)
        
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
        const prices = result.indicators.quote[0].close
        const volumes = result.indicators.quote[0].volume

        // Convert to our format
        for (let i = 0; i < timestamps.length; i++) {
          if (prices[i] !== null) {
            marketData.push({
              symbol: symbol.toUpperCase(),
              price: prices[i],
              volume: volumes[i] || null,
              timestamp: new Date(timestamps[i] * 1000).toISOString(),
              asset_type: symbol.match(/^(BTC|ETH|DOGE|ADA|DOT)/) ? 'crypto' : 'stock'
            })
          }
        }

        console.log(`Successfully fetched ${prices.filter(p => p !== null).length} data points for ${symbol}`)

      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error)
        continue
      }
    }

    // Store market data in database
    if (marketData.length > 0) {
      const { error: dbError } = await supabase
        .from('market_data')
        .upsert(marketData, { 
          onConflict: 'symbol,timestamp',
          ignoreDuplicates: true 
        })

      if (dbError) {
        console.error('Database error storing market data:', dbError)
        return new Response(
          JSON.stringify({ error: 'Failed to store market data', details: dbError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Successfully stored ${marketData.length} market data points`)
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
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})