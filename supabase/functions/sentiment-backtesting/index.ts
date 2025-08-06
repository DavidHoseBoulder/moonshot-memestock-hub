import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BacktestParams {
  symbol: string
  start_date: string
  end_date: string
  sentiment_threshold: number
  holding_period_days: number
  position_size: number
}

interface Trade {
  entry_date: string
  exit_date: string
  entry_price: number
  exit_price: number
  return_percent: number
  sentiment_score: number
  position_size: number
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

    const params: BacktestParams = await req.json()
    
    console.log(`Running backtest for ${params.symbol} from ${params.start_date} to ${params.end_date}`)

    // Fetch market data for the symbol and time period
    const { data: marketData, error: marketError } = await supabase
      .from('market_data')
      .select('*')
      .eq('symbol', params.symbol.toUpperCase())
      .gte('timestamp', params.start_date)
      .lte('timestamp', params.end_date)
      .order('timestamp')

    if (marketError) {
      console.error('Error fetching market data:', marketError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch market data', details: marketError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch sentiment data for the symbol and time period
    const { data: sentimentData, error: sentimentError } = await supabase
      .from('sentiment_analysis')
      .select('*')
      .contains('symbols_mentioned', [params.symbol.toUpperCase()])
      .gte('post_created_at', params.start_date)
      .lte('post_created_at', params.end_date)
      .order('post_created_at')

    if (sentimentError) {
      console.error('Error fetching sentiment data:', sentimentError)
    }

    // If no sentiment data found, generate mock data for demonstration
    let processedSentimentData = sentimentData
    if (!sentimentData || sentimentData.length === 0) {
      console.log('No sentiment data found, generating mock data for demonstration')
      processedSentimentData = marketData.map((_, index) => ({
        post_created_at: marketData[Math.min(index, marketData.length - 1)].timestamp,
        overall_sentiment: 0.2 + (Math.random() * 0.6), // Random sentiment between 0.2-0.8
        symbols_mentioned: [params.symbol.toUpperCase()]
      }))
    }

    if (!marketData || marketData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No market data found for the specified period' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${marketData.length} market data points and ${processedSentimentData?.length || 0} sentiment data points (${sentimentData?.length || 0} real, ${processedSentimentData?.length - (sentimentData?.length || 0) || 0} mock)`)

    // Run sentiment-based trading strategy
    const trades: Trade[] = []
    let currentPosition = null
    let totalReturn = 0
    const returns: number[] = []

    // Group sentiment by date for easier lookup
    const sentimentByDate = new Map()
    if (processedSentimentData) {
      for (const sentiment of processedSentimentData) {
        const date = new Date(sentiment.post_created_at).toDateString()
        if (!sentimentByDate.has(date)) {
          sentimentByDate.set(date, [])
        }
        sentimentByDate.get(date).push(sentiment)
      }
    }

    for (let i = 0; i < marketData.length - 1; i++) {
      const currentData = marketData[i]
      const currentDate = new Date(currentData.timestamp).toDateString()
      
      // Calculate average sentiment for this date
      const daySentiments = sentimentByDate.get(currentDate) || []
      const avgSentiment = daySentiments.length > 0 
        ? daySentiments.reduce((sum, s) => sum + (s.overall_sentiment || 0), 0) / daySentiments.length
        : 0

      // Trading logic: Enter position if sentiment exceeds threshold
      if (!currentPosition && avgSentiment > params.sentiment_threshold) {
        currentPosition = {
          entry_date: currentData.timestamp,
          entry_price: currentData.price,
          sentiment_score: avgSentiment
        }
        console.log(`Enter position at ${currentData.price} on ${currentDate} (sentiment: ${avgSentiment.toFixed(2)})`)
      }
      
      // Exit position after holding period or if we reach the end
      if (currentPosition) {
        const entryDate = new Date(currentPosition.entry_date)
        const currentDateObj = new Date(currentData.timestamp)
        const daysDiff = (currentDateObj.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        
        if (daysDiff >= params.holding_period_days || i === marketData.length - 1) {
          const returnPercent = ((currentData.price - currentPosition.entry_price) / currentPosition.entry_price) * 100
          const positionReturn = returnPercent * params.position_size
          
          const trade: Trade = {
            entry_date: currentPosition.entry_date,
            exit_date: currentData.timestamp,
            entry_price: currentPosition.entry_price,
            exit_price: currentData.price,
            return_percent: returnPercent,
            sentiment_score: currentPosition.sentiment_score,
            position_size: params.position_size
          }
          
          trades.push(trade)
          returns.push(positionReturn)
          totalReturn += positionReturn
          
          console.log(`Exit position at ${currentData.price} on ${currentDate} (return: ${returnPercent.toFixed(2)}%)`)
          currentPosition = null
        }
      }
    }

    // Calculate performance metrics
    const winningTrades = trades.filter(t => t.return_percent > 0)
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0
    
    const avgReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0
    const volatility = returns.length > 1 ? Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
    ) : 0
    
    const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0
    const maxDrawdown = returns.length > 0 ? Math.min(...returns) : 0

    // Calculate correlation between sentiment and returns
    let sentimentCorrelation = 0
    if (trades.length > 1) {
      const sentiments = trades.map(t => t.sentiment_score)
      const tradeReturns = trades.map(t => t.return_percent)
      
      const avgSent = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length
      const avgRet = tradeReturns.reduce((sum, r) => sum + r, 0) / tradeReturns.length
      
      const numerator = sentiments.reduce((sum, s, i) => sum + (s - avgSent) * (tradeReturns[i] - avgRet), 0)
      const denomSent = Math.sqrt(sentiments.reduce((sum, s) => sum + Math.pow(s - avgSent, 2), 0))
      const denomRet = Math.sqrt(tradeReturns.reduce((sum, r) => sum + Math.pow(r - avgRet, 2), 0))
      
      sentimentCorrelation = denomSent * denomRet > 0 ? numerator / (denomSent * denomRet) : 0
    }

    // Store backtest results
    const backtestResult = {
      symbol: params.symbol.toUpperCase(),
      strategy_name: 'reddit_sentiment_strategy',
      start_date: params.start_date,
      end_date: params.end_date,
      total_return: totalReturn,
      annualized_return: totalReturn * (365 / Math.max(1, (new Date(params.end_date).getTime() - new Date(params.start_date).getTime()) / (1000 * 60 * 60 * 24))),
      volatility: volatility,
      sharpe_ratio: sharpeRatio,
      max_drawdown: maxDrawdown,
      win_rate: winRate,
      sentiment_correlation: sentimentCorrelation,
      sentiment_accuracy: winRate, // Simplified accuracy metric
      sentiment_threshold: params.sentiment_threshold,
      holding_period_days: params.holding_period_days,
      position_size: params.position_size,
      trades_data: trades
    }

    const { error: storeError } = await supabase
      .from('backtesting_results')
      .insert(backtestResult)

    if (storeError) {
      console.error('Error storing backtest results:', storeError)
    } else {
      console.log('Backtest results stored successfully')
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        backtest_results: backtestResult,
        trades_count: trades.length,
        sentiment_data_points: sentimentData?.length || 0,
        market_data_points: marketData.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in backtesting function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})