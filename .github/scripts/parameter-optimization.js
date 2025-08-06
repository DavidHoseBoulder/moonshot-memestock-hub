
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Enhanced parameter ranges to test
const PARAMETER_RANGES = {
  sentiment_threshold: [0.2, 0.3, 0.4, 0.5, 0.6],
  holding_period_days: [1, 3, 5, 7, 10],
  position_size: [0.05, 0.1, 0.15, 0.2, 0.25],
  // Advanced parameters
  sentiment_delta_threshold: [0.1, 0.2, 0.3], // For sentiment spike detection
  volume_multiplier: [1.5, 2.0, 3.0] // Volume spike detection (X times average)
};

async function calculateTechnicalIndicators(marketData) {
  // Calculate average volume over the dataset
  const volumes = marketData.map(d => d.volume || 0).filter(v => v > 0);
  const avgVolume = volumes.length > 0 ? volumes.reduce((sum, v) => sum + v, 0) / volumes.length : 0;

  // Calculate price momentum (5-day moving average)
  const priceChanges = [];
  for (let i = 1; i < marketData.length; i++) {
    const change = ((marketData[i].price - marketData[i-1].price) / marketData[i-1].price) * 100;
    priceChanges.push(change);
  }

  return {
    avgVolume,
    priceChanges,
    marketData: marketData.map((data, i) => ({
      ...data,
      priceChange: i > 0 ? priceChanges[i-1] : 0,
      volumeRatio: data.volume ? data.volume / avgVolume : 1
    }))
  };
}

async function runEnhancedParameterSweep(symbol, days, enableSentimentDelta = false, enableVolumeFilter = false) {
  console.log(`Starting enhanced parameter optimization for ${symbol} over ${days} days...`);
  console.log(`Features enabled: Sentiment Delta: ${enableSentimentDelta}, Volume Filter: ${enableVolumeFilter}`);
  
  const results = [];
  let totalCombinations = PARAMETER_RANGES.sentiment_threshold.length * 
                         PARAMETER_RANGES.holding_period_days.length * 
                         PARAMETER_RANGES.position_size.length;

  // Add combinations for advanced features
  if (enableSentimentDelta) {
    totalCombinations *= PARAMETER_RANGES.sentiment_delta_threshold.length;
  }
  if (enableVolumeFilter) {
    totalCombinations *= PARAMETER_RANGES.volume_multiplier.length;
  }
  
  let currentRun = 0;

  // Get base ranges
  const sentimentDeltas = enableSentimentDelta ? PARAMETER_RANGES.sentiment_delta_threshold : [null];
  const volumeMultipliers = enableVolumeFilter ? PARAMETER_RANGES.volume_multiplier : [null];

  for (const sentimentThreshold of PARAMETER_RANGES.sentiment_threshold) {
    for (const holdingPeriod of PARAMETER_RANGES.holding_period_days) {
      for (const positionSize of PARAMETER_RANGES.position_size) {
        for (const sentimentDelta of sentimentDeltas) {
          for (const volumeMultiplier of volumeMultipliers) {
            currentRun++;
            console.log(`\n--- Run ${currentRun}/${totalCombinations} ---`);
            console.log(`Testing: Sentiment=${sentimentThreshold}, Holding=${holdingPeriod}d, Position=${positionSize*100}%`);
            if (enableSentimentDelta) console.log(`Sentiment Delta=${sentimentDelta}`);
            if (enableVolumeFilter) console.log(`Volume Multiplier=${volumeMultiplier}x`);

            try {
              const endDate = new Date().toISOString();
              const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();

              const { data: backtestData, error: backtestError } = await supabase.functions.invoke('sentiment-backtesting', {
                body: {
                  symbol: symbol.toUpperCase(),
                  start_date: startDate,
                  end_date: endDate,
                  sentiment_threshold: sentimentThreshold,
                  holding_period_days: holdingPeriod,
                  position_size: positionSize,
                  // Enhanced parameters
                  sentiment_delta_threshold: sentimentDelta,
                  volume_multiplier: volumeMultiplier,
                  enable_sentiment_delta: enableSentimentDelta,
                  enable_volume_filter: enableVolumeFilter
                }
              });

              if (backtestError) {
                console.error('Backtest error:', backtestError);
                continue;
              }

              if (backtestData && backtestData.backtest_results) {
                const result = {
                  parameters: {
                    sentiment_threshold: sentimentThreshold,
                    holding_period_days: holdingPeriod,
                    position_size: positionSize,
                    sentiment_delta_threshold: sentimentDelta,
                    volume_multiplier: volumeMultiplier,
                    enable_sentiment_delta: enableSentimentDelta,
                    enable_volume_filter: enableVolumeFilter
                  },
                  performance: {
                    total_return: backtestData.backtest_results.total_return,
                    annualized_return: backtestData.backtest_results.annualized_return,
                    sharpe_ratio: backtestData.backtest_results.sharpe_ratio,
                    win_rate: backtestData.backtest_results.win_rate,
                    max_drawdown: backtestData.backtest_results.max_drawdown,
                    trades_count: backtestData.trades_count,
                    sentiment_correlation: backtestData.backtest_results.sentiment_correlation,
                    signal_quality: backtestData.backtest_results.signal_quality || 0
                  }
                };
                
                results.push(result);
                console.log(`Return: ${(result.performance.total_return || 0).toFixed(2)}%, Trades: ${result.performance.trades_count}, Sharpe: ${(result.performance.sharpe_ratio || 0).toFixed(3)}`);
              }

              // Small delay to avoid overwhelming the system
              await new Promise(resolve => setTimeout(resolve, 800));

            } catch (error) {
              console.error('Error in parameter test:', error.message);
              continue;
            }
          }
        }
      }
    }
  }

  // Analyze results and find optimal parameters
  if (results.length === 0) {
    console.log('No successful backtests completed');
    return;
  }

  console.log(`\n=== Enhanced Parameter Optimization Results for ${symbol} ===`);
  console.log(`Completed ${results.length} successful backtests with advanced features\n`);

  // Sort by different metrics
  const byReturn = [...results].sort((a, b) => (b.performance.total_return || 0) - (a.performance.total_return || 0));
  const bySharpe = [...results].sort((a, b) => (b.performance.sharpe_ratio || 0) - (a.performance.sharpe_ratio || 0));
  const byWinRate = [...results].sort((a, b) => (b.performance.win_rate || 0) - (a.performance.win_rate || 0));
  const bySignalQuality = [...results].sort((a, b) => (b.performance.signal_quality || 0) - (a.performance.signal_quality || 0));

  const formatResult = (result) => {
    const p = result.parameters;
    const perf = result.performance;
    let paramStr = `Sentiment: ${p.sentiment_threshold}, Hold: ${p.holding_period_days}d, Size: ${(p.position_size*100).toFixed(0)}%`;
    
    if (p.enable_sentiment_delta) {
      paramStr += `, Delta: ${p.sentiment_delta_threshold}`;
    }
    if (p.enable_volume_filter) {
      paramStr += `, Vol: ${p.volume_multiplier}x`;
    }
    
    return `${paramStr} → Return: ${(perf.total_return || 0).toFixed(2)}%, Sharpe: ${(perf.sharpe_ratio || 0).toFixed(3)}, Win Rate: ${(perf.win_rate || 0).toFixed(1)}%`;
  };

  console.log('🏆 Top 5 by Total Return:');
  byReturn.slice(0, 5).forEach((result, i) => {
    console.log(`${i+1}. ${formatResult(result)}`);
  });

  console.log('\n📊 Top 5 by Sharpe Ratio:');
  bySharpe.slice(0, 5).forEach((result, i) => {
    console.log(`${i+1}. ${formatResult(result)}`);
  });

  console.log('\n🎯 Top 5 by Win Rate:');
  byWinRate.slice(0, 5).forEach((result, i) => {
    console.log(`${i+1}. ${formatResult(result)}`);
  });

  if (enableSentimentDelta || enableVolumeFilter) {
    console.log('\n🚀 Top 5 by Signal Quality (Advanced Features):');
    bySignalQuality.slice(0, 5).forEach((result, i) => {
      console.log(`${i+1}. ${formatResult(result)}`);
    });
  }

  // Save detailed results
  const reportPath = path.join(__dirname, '../../parameter-optimization-reports');
  if (!fs.existsSync(reportPath)) {
    fs.mkdirSync(reportPath, { recursive: true });
  }

  const reportFile = path.join(reportPath, `${symbol}-enhanced-optimization-${Date.now()}.json`);
  const report = {
    symbol,
    days,
    timestamp: new Date().toISOString(),
    features_enabled: {
      sentiment_delta: enableSentimentDelta,
      volume_filter: enableVolumeFilter
    },
    total_combinations_tested: results.length,
    top_performers: {
      by_return: byReturn.slice(0, 5),
      by_sharpe: bySharpe.slice(0, 5),
      by_win_rate: byWinRate.slice(0, 5),
      by_signal_quality: bySignalQuality.slice(0, 5)
    },
    all_results: results
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n📈 Enhanced optimization report saved to: ${reportFile}`);

  // Advanced recommendations
  const optimalByReturn = byReturn[0];
  const optimalBySharpe = bySharpe[0];
  const optimalBySignal = bySignalQuality[0];
  
  console.log('\n🎯 RECOMMENDED OPTIMAL PARAMETERS:');
  console.log('Best Return:', formatResult(optimalByReturn));
  if (optimalBySharpe.parameters !== optimalByReturn.parameters) {
    console.log('Best Risk-Adjusted:', formatResult(optimalBySharpe));
  }
  if (enableSentimentDelta || enableVolumeFilter) {
    console.log('Best Signal Quality:', formatResult(optimalBySignal));
  }
}

async function main() {
  const symbol = process.argv[2] || 'AAPL';
  const days = parseInt(process.argv[3]) || 30;
  const enableSentimentDelta = process.argv[4] === 'true';
  const enableVolumeFilter = process.argv[5] === 'true';

  console.log(`🚀 Starting enhanced parameter optimization for ${symbol} over ${days} days`);
  
  let totalCombinations = PARAMETER_RANGES.sentiment_threshold.length * 
                         PARAMETER_RANGES.holding_period_days.length * 
                         PARAMETER_RANGES.position_size.length;
  
  if (enableSentimentDelta) totalCombinations *= PARAMETER_RANGES.sentiment_delta_threshold.length;
  if (enableVolumeFilter) totalCombinations *= PARAMETER_RANGES.volume_multiplier.length;
  
  console.log(`Will test ${totalCombinations} parameter combinations with advanced features\n`);

  try {
    await runEnhancedParameterSweep(symbol, days, enableSentimentDelta, enableVolumeFilter);
  } catch (error) {
    console.error('Error in enhanced parameter optimization:', error.message);
  }
}

main();
