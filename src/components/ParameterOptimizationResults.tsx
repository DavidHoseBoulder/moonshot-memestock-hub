import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, Target, BarChart3, Activity, Volume2 } from "lucide-react";
import OptimizationReportBrowser from "./OptimizationReportBrowser";

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
  const [selectedFile, setSelectedFile] = useState<string>("");

  // Load report data based on selected file
  useEffect(() => {
    if (selectedFile) {
      loadReportFromFile(selectedFile);
    }
  }, [selectedFile]);

  const loadReportFromFile = (filename: string) => {
    // Extract symbol from filename (e.g., "BB-enhanced-optimization-1754516167667.json" -> "BB")
    const symbol = filename.split('-')[0];
    const isEnhanced = filename.includes('enhanced');
    
    // In a real implementation, you would fetch the actual file content from GitHub
    // For now, we'll create realistic mock data based on the filename
    const mockReport: OptimizationReport = {
      symbol: symbol,
      timestamp: new Date().toISOString(),
      total_combinations_tested: isEnhanced ? 375 : 125,
      features_enabled: isEnhanced ? {
        sentiment_delta: true,
        volume_filter: true
      } : undefined,
      top_performers: {
        by_return: [
          {
            parameters: { 
              sentiment_threshold: 0.4, 
              holding_period_days: 5, 
              position_size: 0.15,
              ...(isEnhanced && {
                sentiment_delta_threshold: 0.2,
                volume_multiplier: 2.0,
                enable_sentiment_delta: true,
                enable_volume_filter: true
              })
            },
            performance: { 
              total_return: symbol === 'BB' ? 15.7 : 12.3, 
              sharpe_ratio: 1.6, 
              win_rate: 74, 
              trades_count: 11,
              ...(isEnhanced && { signal_quality: 2.3 })
            }
          },
          {
            parameters: { 
              sentiment_threshold: 0.3, 
              holding_period_days: 7, 
              position_size: 0.2,
              ...(isEnhanced && {
                sentiment_delta_threshold: 0.1,
                enable_sentiment_delta: true
              })
            },
            performance: { 
              total_return: symbol === 'BB' ? 13.2 : 10.8, 
              sharpe_ratio: 1.2, 
              win_rate: 67, 
              trades_count: 14,
              ...(isEnhanced && { signal_quality: 1.9 })
            }
          }
        ],
        by_sharpe: [
          {
            parameters: { 
              sentiment_threshold: 0.5, 
              holding_period_days: 3, 
              position_size: 0.1,
              ...(isEnhanced && {
                volume_multiplier: 3.0,
                enable_volume_filter: true
              })
            },
            performance: { 
              total_return: symbol === 'BB' ? 9.4 : 8.7, 
              sharpe_ratio: 1.9, 
              win_rate: 81, 
              trades_count: 7,
              ...(isEnhanced && { signal_quality: 2.5 })
            }
          }
        ],
        by_win_rate: [
          {
            parameters: { 
              sentiment_threshold: 0.6, 
              holding_period_days: 1, 
              position_size: 0.05,
              ...(isEnhanced && {
                sentiment_delta_threshold: 0.3,
                enable_sentiment_delta: true
              })
            },
            performance: { 
              total_return: symbol === 'BB' ? 6.8 : 5.4, 
              sharpe_ratio: 1.4, 
              win_rate: 87, 
              trades_count: 18,
              ...(isEnhanced && { signal_quality: 2.1 })
            }
          }
        ],
        ...(isEnhanced && {
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
              performance: { 
                total_return: symbol === 'BB' ? 11.5 : 9.8, 
                sharpe_ratio: 1.7, 
                win_rate: 78, 
                trades_count: 9, 
                signal_quality: 2.8 
              }
            }
          ]
        })
      }
    };

    setReports([mockReport]);
  };

  const handleFileSelect = (filename: string) => {
    setSelectedFile(filename);
  };

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center">
          <Trophy className="w-5 h-5 mr-2 text-yellow-500" />
          Parameter Optimization Results
        </h3>
      </div>

      <OptimizationReportBrowser 
        onFileSelect={handleFileSelect}
        selectedFile={selectedFile}
      />

      {selectedFile && reports.length > 0 && (
        <div className="space-y-4">
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
        </div>
      )}

      {!selectedFile && (
        <Card className="p-6 text-center text-muted-foreground">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p>Select a report from the table above to view optimization results.</p>
          <p className="text-sm">The most recent reports are shown first.</p>
        </Card>
      )}
    </div>
  );
};

export default ParameterOptimizationResults;
