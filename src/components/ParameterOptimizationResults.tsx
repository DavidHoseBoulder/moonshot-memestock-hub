
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, Target, BarChart3 } from "lucide-react";

interface OptimizationResult {
  parameters: {
    sentiment_threshold: number;
    holding_period_days: number;
    position_size: number;
  };
  performance: {
    total_return: number;
    sharpe_ratio: number;
    win_rate: number;
    trades_count: number;
  };
}

interface OptimizationReport {
  symbol: string;
  timestamp: string;
  total_combinations_tested: number;
  top_performers: {
    by_return: OptimizationResult[];
    by_sharpe: OptimizationResult[];
    by_win_rate: OptimizationResult[];
  };
}

const ParameterOptimizationResults = () => {
  const [reports, setReports] = useState<OptimizationReport[]>([]);

  // This would typically fetch from your GitHub repo or a database
  // For now, showing mock data to demonstrate the concept
  useEffect(() => {
    const mockReports: OptimizationReport[] = [
      {
        symbol: "AAPL",
        timestamp: new Date().toISOString(),
        total_combinations_tested: 125,
        top_performers: {
          by_return: [
            {
              parameters: { sentiment_threshold: 0.4, holding_period_days: 5, position_size: 0.15 },
              performance: { total_return: 8.5, sharpe_ratio: 1.2, win_rate: 65, trades_count: 12 }
            },
            {
              parameters: { sentiment_threshold: 0.3, holding_period_days: 7, position_size: 0.2 },
              performance: { total_return: 7.8, sharpe_ratio: 1.0, win_rate: 58, trades_count: 15 }
            }
          ],
          by_sharpe: [
            {
              parameters: { sentiment_threshold: 0.5, holding_period_days: 3, position_size: 0.1 },
              performance: { total_return: 6.2, sharpe_ratio: 1.5, win_rate: 72, trades_count: 8 }
            }
          ],
          by_win_rate: [
            {
              parameters: { sentiment_threshold: 0.6, holding_period_days: 1, position_size: 0.05 },
              performance: { total_return: 4.1, sharpe_ratio: 1.1, win_rate: 78, trades_count: 18 }
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

  const formatParams = (params: OptimizationResult['parameters']) => 
    `S:${params.sentiment_threshold} H:${params.holding_period_days}d P:${(params.position_size*100).toFixed(0)}%`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center">
          <Trophy className="w-5 h-5 mr-2 text-yellow-500" />
          Optimization Results
        </h3>
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          Auto-Generated
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
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date(report.timestamp).toLocaleDateString()}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Best Return */}
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <div className="flex items-center mb-2">
                <TrendingUp className="w-4 h-4 text-green-500 mr-2" />
                <div className="font-medium text-green-700">Best Return</div>
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
                  </div>
                </div>
              )}
            </div>

            {/* Best Sharpe */}
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="flex items-center mb-2">
                <Target className="w-4 h-4 text-blue-500 mr-2" />
                <div className="font-medium text-blue-700">Best Sharpe Ratio</div>
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
          </div>

          <div className="mt-4 p-3 bg-yellow-100 rounded text-sm text-yellow-800">
            <strong>💡 Recommendation:</strong> Consider the "Best Sharpe Ratio" parameters for optimal risk-adjusted returns, 
            or use "Best Return" parameters if you prefer higher absolute returns with potentially more risk.
          </div>
        </Card>
      ))}

      {reports.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p>No optimization results yet.</p>
          <p className="text-sm">Run a parameter optimization to see the best performing combinations.</p>
        </Card>
      )}
    </div>
  );
};

export default ParameterOptimizationResults;
