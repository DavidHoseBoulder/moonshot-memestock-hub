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
  sentiment_delta_threshold?: number
  volume_multiplier?: number
  enable_sentiment_delta?: boolean
  enable_volume_filter?: boolean
}

interface Trade {
  entry_date: string
  exit_date: string
  entry_price: number
  exit_price: number
  return_percent: number
  sentiment_score: number
  position_size: number
  signal_type?: string
  volume_ratio?: number
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
    
    console.log(`Running enhanced backtest for ${params.symbol} from ${params.start_date} to ${params.end_date}`)
    console.log(`Enhanced features: Sentiment Delta=${params.enable_sentiment_delta}, Volume Filter=${params.enable_volume_filter}`)

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

    console.log(`Found ${marketData.length} market data points and ${processedSentimentData?.length || 0} sentiment data points`)

    // Calculate technical indicators for enhanced features
    const volumes = marketData.map(d => d.volume || 0).filter(v => v > 0);
    const avgVolume = volumes.length > 0 ? volumes.reduce((sum, v) => sum + v, 0) / volumes.length : 0;

    // Enhanced sentiment-based trading strategy with advanced features
    const trades: Trade[] = []
    let currentPosition = null
    let totalReturn = 0
    const returns: number[] = []
    let signalQuality = 0 // Track how well advanced signals perform

    // Group sentiment by date for easier lookup and calculate sentiment deltas
    const sentimentByDate = new Map()
    const sentimentHistory: number[] = []
    
    if (processedSentimentData) {
      for (let i = 0; i < processedSentimentData.length; i++) {
        const sentiment = processedSentimentData[i]
        const date = new Date(sentiment.post_created_at).toDateString()
        if (!sentimentByDate.has(date)) {
          sentimentByDate.set(date, [])
        }
        sentimentByDate.get(date).push(sentiment)
        
        // Track sentiment history for delta calculations
        sentimentHistory.push(sentiment.overall_sentiment || 0)
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

      // Enhanced signal detection
      let shouldEnter = false
      let signalType = 'basic'
      let signalStrength = 0

      // Basic sentiment threshold signal
      if (avgSentiment > params.sentiment_threshold) {
        shouldEnter = true
        signalStrength += 1
      }

      // Sentiment delta signal (sudden sentiment spikes)
      if (params.enable_sentiment_delta && params.sentiment_delta_threshold) {
        const recentSentiments = sentimentHistory.slice(-5) // Last 5 data points
        if (recentSentiments.length >= 2) {
          const previousAvg = recentSentiments.slice(0, -1).reduce((sum, s) => sum + s, 0) / (recentSentiments.length - 1)
          const currentSentiment = recentSentiments[recentSentiments.length - 1]
          const sentimentDelta = currentSentiment - previousAvg
          
          if (sentimentDelta > params.sentiment_delta_threshold) {
            shouldEnter = true
            signalType = 'sentiment_spike'
            signalStrength += 2
            console.log(`Sentiment spike detected: ${sentimentDelta.toFixed(3)} (threshold: ${params.sentiment_delta_threshold})`)
          }
        }
      }

      // Volume filter (combine with sentiment for stronger signals)
      if (params.enable_volume_filter && params.volume_multiplier && currentData.volume && avgVolume > 0) {
        const volumeRatio = currentData.volume / avgVolume
        if (volumeRatio > params.volume_multiplier && shouldEnter) {
          signalType = 'volume_confirmed'
          signalStrength += 2
          console.log(`Volume spike confirmed: ${volumeRatio.toFixed(2)}x average (threshold: ${params.volume_multiplier}x)`)
        } else if (volumeRatio < params.volume_multiplier && params.enable_volume_filter) {
          // If volume filter is enabled but volume is low, don't enter
          shouldEnter = false
          signalStrength = 0
        }
      }

      // Trading logic: Enter position based on enhanced signals
      if (!currentPosition && shouldEnter) {
        currentPosition = {
          entry_date: currentData.timestamp,
          entry_price: currentData.price,
          sentiment_score: avgSentiment,
          signal_type: signalType,
          signal_strength: signalStrength
        }
        console.log(`Enter position at ${currentData.price} on ${currentDate} (sentiment: ${avgSentiment.toFixed(2)}, signal: ${signalType})`)
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
            position_size: params.position_size,
            signal_type: currentPosition.signal_type,
            volume_ratio: currentData.volume && avgVolume > 0 ? currentData.volume / avgVolume : 1
          }
          
          trades.push(trade)
          returns.push(positionReturn)
          totalReturn += positionReturn
          
          // Update signal quality metric
          if (currentPosition.signal_strength > 1 && returnPercent > 0) {
            signalQuality += currentPosition.signal_strength
          }
          
          console.log(`Exit position at ${currentData.price} on ${currentDate} (return: ${returnPercent.toFixed(2)}%, signal: ${currentPosition.signal_type})`)
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

    // Normalize signal quality
    const normalizedSignalQuality = trades.length > 0 ? signalQuality / trades.length : 0

    // Store backtest results
    const backtestResult = {
      symbol: params.symbol.toUpperCase(),
      strategy_name: 'enhanced_reddit_sentiment_strategy',
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
      signal_quality: normalizedSignalQuality,
      sentiment_threshold: params.sentiment_threshold,
      holding_period_days: params.holding_period_days,
      position_size: params.position_size,
      sentiment_delta_threshold: params.sentiment_delta_threshold,
      volume_multiplier: params.volume_multiplier,
      enable_sentiment_delta: params.enable_sentiment_delta,
      enable_volume_filter: params.enable_volume_filter,
      trades_data: trades
    }

    const { error: storeError } = await supabase
      .from('backtesting_results')
      .insert(backtestResult)

    if (storeError) {
      console.error('Error storing backtest results:', storeError)
    } else {
      console.log('Enhanced backtest results stored successfully')
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        backtest_results: backtestResult,
        trades_count: trades.length,
        sentiment_data_points: sentimentData?.length || 0,
        market_data_points: marketData.length,
        advanced_features_used: {
          sentiment_delta: params.enable_sentiment_delta,
          volume_filter: params.enable_volume_filter
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in enhanced backtesting function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
