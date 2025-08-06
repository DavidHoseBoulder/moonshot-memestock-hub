
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

// Parameter ranges to test
const PARAMETER_RANGES = {
  sentiment_threshold: [0.2, 0.3, 0.4, 0.5, 0.6],
  holding_period_days: [1, 3, 5, 7, 10],
  position_size: [0.05, 0.1, 0.15, 0.2, 0.25]
};

async function runParameterSweep(symbol, days) {
  console.log(`Starting parameter optimization for ${symbol} over ${days} days...`);
  
  const results = [];
  const totalCombinations = PARAMETER_RANGES.sentiment_threshold.length * 
                           PARAMETER_RANGES.holding_period_days.length * 
                           PARAMETER_RANGES.position_size.length;
  
  let currentRun = 0;

  for (const sentimentThreshold of PARAMETER_RANGES.sentiment_threshold) {
    for (const holdingPeriod of PARAMETER_RANGES.holding_period_days) {
      for (const positionSize of PARAMETER_RANGES.position_size) {
        currentRun++;
        console.log(`\n--- Run ${currentRun}/${totalCombinations} ---`);
        console.log(`Testing: Sentiment=${sentimentThreshold}, Holding=${holdingPeriod}d, Position=${positionSize*100}%`);

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
              position_size: positionSize
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
                position_size: positionSize
              },
              performance: {
                total_return: backtestData.backtest_results.total_return,
                annualized_return: backtestData.backtest_results.annualized_return,
                sharpe_ratio: backtestData.backtest_results.sharpe_ratio,
                win_rate: backtestData.backtest_results.win_rate,
                max_drawdown: backtestData.backtest_results.max_drawdown,
                trades_count: backtestData.trades_count,
                sentiment_correlation: backtestData.backtest_results.sentiment_correlation
              }
            };
            
            results.push(result);
            console.log(`Return: ${(result.performance.total_return || 0).toFixed(2)}%, Trades: ${result.performance.trades_count}, Sharpe: ${(result.performance.sharpe_ratio || 0).toFixed(3)}`);
          }

          // Small delay to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error('Error in parameter test:', error.message);
          continue;
        }
      }
    }
  }

  // Analyze results and find optimal parameters
  if (results.length === 0) {
    console.log('No successful backtests completed');
    return;
  }

  console.log(`\n=== Parameter Optimization Results for ${symbol} ===`);
  console.log(`Completed ${results.length} successful backtests\n`);

  // Sort by different metrics
  const byReturn = [...results].sort((a, b) => (b.performance.total_return || 0) - (a.performance.total_return || 0));
  const bySharpe = [...results].sort((a, b) => (b.performance.sharpe_ratio || 0) - (a.performance.sharpe_ratio || 0));
  const byWinRate = [...results].sort((a, b) => (b.performance.win_rate || 0) - (a.performance.win_rate || 0));

  const formatResult = (result) => {
    const p = result.parameters;
    const perf = result.performance;
    return `Sentiment: ${p.sentiment_threshold}, Hold: ${p.holding_period_days}d, Size: ${(p.position_size*100).toFixed(0)}% → Return: ${(perf.total_return || 0).toFixed(2)}%, Sharpe: ${(perf.sharpe_ratio || 0).toFixed(3)}, Win Rate: ${(perf.win_rate || 0).toFixed(1)}%`;
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

  // Save detailed results
  const reportPath = path.join(__dirname, '../../parameter-optimization-reports');
  if (!fs.existsSync(reportPath)) {
    fs.mkdirSync(reportPath, { recursive: true });
  }

  const reportFile = path.join(reportPath, `${symbol}-optimization-${Date.now()}.json`);
  const report = {
    symbol,
    days,
    timestamp: new Date().toISOString(),
    total_combinations_tested: results.length,
    top_performers: {
      by_return: byReturn.slice(0, 3),
      by_sharpe: bySharpe.slice(0, 3),
      by_win_rate: byWinRate.slice(0, 3)
    },
    all_results: results
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n📈 Detailed optimization report saved to: ${reportFile}`);

  // Recommend optimal parameters (using a balanced approach)
  const optimalByReturn = byReturn[0];
  const optimalBySharpe = bySharpe[0];
  
  console.log('\n🎯 RECOMMENDED OPTIMAL PARAMETERS:');
  console.log('Based on highest return:', formatResult(optimalByReturn));
  if (optimalBySharpe.parameters !== optimalByReturn.parameters) {
    console.log('Based on best risk-adjusted return:', formatResult(optimalBySharpe));
  }
}

async function main() {
  const symbol = process.argv[2] || 'AAPL';
  const days = parseInt(process.argv[3]) || 30;

  console.log(`🚀 Starting parameter optimization for ${symbol} over ${days} days`);
  console.log(`Will test ${PARAMETER_RANGES.sentiment_threshold.length * PARAMETER_RANGES.holding_period_days.length * PARAMETER_RANGES.position_size.length} parameter combinations\n`);

  try {
    await runParameterSweep(symbol, days);
  } catch (error) {
    console.error('Error in parameter optimization:', error.message);
  }
}

main();
