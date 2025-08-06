
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, Target, BarChart3, Activity, Volume2 } from "lucide-react";

interface OptimizationResult {
  parameters: {
    sentiment_threshold: number;
    holding_period_days: number;
    position_size: number;
    sentiment_delta_threshold?: number;
    volume_multiplier?: number;
    enable_sentiment_delta?: boolean;
    enable_volume_filter?: boolean;
  };
  performance: {
    total_return: number;
    sharpe_ratio: number;
    win_rate: number;
    trades_count: number;
    signal_quality?: number;
  };
}

interface OptimizationReport {
  symbol: string;
  timestamp: string;
  total_combinations_tested: number;
  features_enabled?: {
    sentiment_delta: boolean;
    volume_filter: boolean;
  };
  top_performers: {
    by_return: OptimizationResult[];
    by_sharpe: OptimizationResult[];
    by_win_rate: OptimizationResult[];
    by_signal_quality?: OptimizationResult[];
  };
}

const ParameterOptimizationResults = () => {
  const [reports, setReports] = useState<OptimizationReport[]>([]);

  // This would typically fetch from your GitHub repo or a database
  // For now, showing mock data to demonstrate the enhanced concept
  useEffect(() => {
    const mockReports: OptimizationReport[] = [
      {
        symbol: "AAPL",
        timestamp: new Date().toISOString(),
        total_combinations_tested: 375, // Enhanced with advanced features
        features_enabled: {
          sentiment_delta: true,
          volume_filter: true
        },
        top_performers: {
          by_return: [
            {
              parameters: { 
                sentiment_threshold: 0.4, 
                holding_period_days: 5, 
                position_size: 0.15,
                sentiment_delta_threshold: 0.2,
                volume_multiplier: 2.0,
                enable_sentiment_delta: true,
                enable_volume_filter: true
              },
              performance: { total_return: 12.3, sharpe_ratio: 1.4, win_rate: 71, trades_count: 9, signal_quality: 2.1 }
            },
            {
              parameters: { 
                sentiment_threshold: 0.3, 
                holding_period_days: 7, 
                position_size: 0.2,
                sentiment_delta_threshold: 0.1,
                enable_sentiment_delta: true
              },
              performance: { total_return: 10.8, sharpe_ratio: 1.1, win_rate: 63, trades_count: 12, signal_quality: 1.8 }
            }
          ],
          by_sharpe: [
            {
              parameters: { 
                sentiment_threshold: 0.5, 
                holding_period_days: 3, 
                position_size: 0.1,
                volume_multiplier: 3.0,
                enable_volume_filter: true
              },
              performance: { total_return: 8.7, sharpe_ratio: 1.8, win_rate: 78, trades_count: 6, signal_quality: 2.3 }
            }
          ],
          by_win_rate: [
            {
              parameters: { 
                sentiment_threshold: 0.6, 
                holding_period_days: 1, 
                position_size: 0.05,
                sentiment_delta_threshold: 0.3,
                enable_sentiment_delta: true
              },
              performance: { total_return: 5.4, sharpe_ratio: 1.3, win_rate: 83, trades_count: 15, signal_quality: 1.9 }
            }
          ],
          by_signal_quality: [
            {
              parameters: { 
                sentiment_threshold: 0.4, 
                holding_period_days: 3, 
                position_size: 0.12,
                sentiment_delta_threshold: 0.2,
                volume_multiplier: 2.5,
                enable_sentiment_delta: true,
                enable_volume_filter: true
              },
              performance: { total_return: 9.8, sharpe_ratio: 1.6, win_rate: 75, trades_count: 8, signal_quality: 2.7 }
            }
          ]
        }
      }
    ];
    // Only set mock data if no real reports exist
    if (reports.length === 0) {
      setReports(mockReports);
    }
  }, [reports.length]);

  const formatParams = (params: OptimizationResult['parameters']) => {
    let paramStr = `S:${params.sentiment_threshold} H:${params.holding_period_days}d P:${(params.position_size*100).toFixed(0)}%`;
    
    if (params.enable_sentiment_delta && params.sentiment_delta_threshold) {
      paramStr += ` Δ:${params.sentiment_delta_threshold}`;
    }
    if (params.enable_volume_filter && params.volume_multiplier) {
      paramStr += ` V:${params.volume_multiplier}x`;
    }
    
    return paramStr;
  };

  const getFeatureIcons = (params: OptimizationResult['parameters']) => {
    const icons = [];
    if (params.enable_sentiment_delta) {
      icons.push(
        <div key="delta" title="Sentiment Delta Analysis">
          <Activity className="w-3 h-3 text-purple-500" />
        </div>
      );
    }
    if (params.enable_volume_filter) {
      icons.push(
        <div key="volume" title="Volume Filter">
          <Volume2 className="w-3 h-3 text-blue-500" />
        </div>
      );
    }
    return icons;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center">
          <Trophy className="w-5 h-5 mr-2 text-yellow-500" />
          Enhanced Optimization Results
        </h3>
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          AI-Enhanced
        </Badge>
      </div>

      {reports.map((report, index) => (
        <Card key={index} className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Badge className="bg-yellow-500">{report.symbol}</Badge>
              <div className="text-sm text-muted-foreground">
                {report.total_combinations_tested} combinations tested
              </div>
              {report.features_enabled && (
                <div className="flex items-center space-x-1">
                  {report.features_enabled.sentiment_delta && (
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                      <Activity className="w-3 h-3 mr-1" />
                      Delta
                    </Badge>
                  )}
                  {report.features_enabled.volume_filter && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      <Volume2 className="w-3 h-3 mr-1" />
                      Volume
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date(report.timestamp).toLocaleDateString()}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Best Return */}
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <div className="flex items-center mb-2">
                <TrendingUp className="w-4 h-4 text-green-500 mr-2" />
                <div className="font-medium text-green-700">Best Return</div>
                <div className="ml-auto flex space-x-1">
                  {getFeatureIcons(report.top_performers.by_return[0]?.parameters)}
                </div>
              </div>
              {report.top_performers.by_return[0] && (
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {report.top_performers.by_return[0].performance.total_return.toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatParams(report.top_performers.by_return[0].parameters)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {report.top_performers.by_return[0].performance.trades_count} trades, 
                    {report.top_performers.by_return[0].performance.win_rate.toFixed(0)}% win rate
                    {report.top_performers.by_return[0].performance.signal_quality && 
                      `, Quality: ${report.top_performers.by_return[0].performance.signal_quality.toFixed(1)}`
                    }
                  </div>
                </div>
              )}
            </div>

            {/* Best Sharpe */}
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="flex items-center mb-2">
                <Target className="w-4 h-4 text-blue-500 mr-2" />
                <div className="font-medium text-blue-700">Best Sharpe Ratio</div>
                <div className="ml-auto flex space-x-1">
                  {getFeatureIcons(report.top_performers.by_sharpe[0]?.parameters)}
                </div>
              </div>
              {report.top_performers.by_sharpe[0] && (
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {report.top_performers.by_sharpe[0].performance.sharpe_ratio.toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatParams(report.top_performers.by_sharpe[0].parameters)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {report.top_performers.by_sharpe[0].performance.total_return.toFixed(1)}% return, 
                    {report.top_performers.by_sharpe[0].performance.win_rate.toFixed(0)}% win rate
                  </div>
                </div>
              )}
            </div>

            {/* Best Win Rate */}
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <div className="flex items-center mb-2">
                <BarChart3 className="w-4 h-4 text-purple-500 mr-2" />
                <div className="font-medium text-purple-700">Best Win Rate</div>
                <div className="ml-auto flex space-x-1">
                  {getFeatureIcons(report.top_performers.by_win_rate[0]?.parameters)}
                </div>
              </div>
              {report.top_performers.by_win_rate[0] && (
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {report.top_performers.by_win_rate[0].performance.win_rate.toFixed(0)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatParams(report.top_performers.by_win_rate[0].parameters)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {report.top_performers.by_win_rate[0].performance.total_return.toFixed(1)}% return, 
                    Sharpe: {report.top_performers.by_win_rate[0].performance.sharpe_ratio.toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Best Signal Quality (if available) */}
            {report.top_performers.by_signal_quality && report.top_performers.by_signal_quality[0] && (
              <div className="bg-white rounded-lg p-4 border border-orange-200">
                <div className="flex items-center mb-2">
                  <Activity className="w-4 h-4 text-orange-500 mr-2" />
                  <div className="font-medium text-orange-700">Best Signal Quality</div>
                  <div className="ml-auto flex space-x-1">
                    {getFeatureIcons(report.top_performers.by_signal_quality[0].parameters)}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-600">
                    {report.top_performers.by_signal_quality[0].performance.signal_quality?.toFixed(2) || 'N/A'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatParams(report.top_performers.by_signal_quality[0].parameters)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {report.top_performers.by_signal_quality[0].performance.total_return.toFixed(1)}% return, 
                    {report.top_performers.by_signal_quality[0].performance.win_rate.toFixed(0)}% win rate
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 p-3 bg-gradient-to-r from-yellow-100 to-orange-100 rounded text-sm">
            <strong>🚀 Enhanced Recommendation:</strong> 
            {report.features_enabled?.sentiment_delta && report.features_enabled?.volume_filter ? (
              <span> The "Best Signal Quality" parameters use both sentiment deltas and volume filters for the most reliable trading signals. Consider these for live trading.</span>
            ) : (
              <span> Consider enabling advanced features (sentiment deltas + volume filters) for more sophisticated signal detection in your next optimization.</span>
            )}
          </div>
        </Card>
      ))}

      {reports.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p>No optimization results yet.</p>
          <p className="text-sm">Run an enhanced parameter optimization to see the best performing combinations with advanced features.</p>
        </Card>
      )}
    </div>
  );
};

export default ParameterOptimizationResults;
