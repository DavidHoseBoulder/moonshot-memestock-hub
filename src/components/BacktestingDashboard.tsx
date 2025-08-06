import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, BarChart3, Target, Activity, Database, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BacktestResult {
  id: string;
  symbol: string;
  strategy_name: string;
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  sentiment_correlation: number;
  sentiment_accuracy: number;
  trades_data: any;
  created_at: string;
}

const BacktestingDashboard = () => {
  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState("AAPL");
  const [days, setDays] = useState(30);
  const { toast } = useToast();

  const fetchBacktestResults = async () => {
    try {
      const { data, error } = await supabase
        .from('backtesting_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching backtest results:', error);
        return;
      }

      setBacktestResults(data || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const runBacktest = async () => {
    setIsLoading(true);
    try {
      // First fetch market data
      toast({
        title: "Fetching market data...",
        description: `Getting ${days} days of data for ${symbol}`,
      });

      const { data: marketData, error: marketError } = await supabase.functions.invoke('fetch-market-data', {
        body: { symbols: [symbol], days }
      });

      if (marketError) {
        throw marketError;
      }

      // Then run backtest
      toast({
        title: "Running backtest...",
        description: "Analyzing sentiment vs market performance",
      });

      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();

      const { data: backtestData, error: backtestError } = await supabase.functions.invoke('sentiment-backtesting', {
        body: {
          symbol,
          start_date: startDate,
          end_date: endDate,
          sentiment_threshold: 0.3,
          holding_period_days: 3,
          position_size: 0.1
        }
      });

      if (backtestError) {
        throw backtestError;
      }

      toast({
        title: "Backtest completed!",
        description: `Found ${backtestData.trades_count} trades with ${backtestData.market_data_points} data points`,
      });

      // Refresh results
      await fetchBacktestResults();

    } catch (error) {
      console.error('Error running backtest:', error);
      toast({
        title: "Backtest failed",
        description: "Check console for details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBacktestResults();
  }, []);

  const formatPercent = (value: number) => `${(value || 0).toFixed(2)}%`;
  const formatNumber = (value: number) => (value || 0).toFixed(3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            📊 Sentiment Backtesting
            <Calculator className="w-6 h-6 ml-3 text-primary" />
          </h2>
          <p className="text-muted-foreground">Test if Reddit sentiment predicts market movements</p>
        </div>
      </div>

      {/* Backtesting Controls */}
      <Card className="p-6 bg-gradient-card border-border">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          🧪 Run New Backtest
          <Target className="w-5 h-5 ml-2 text-accent" />
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <Label htmlFor="symbol">Stock Symbol</Label>
            <Input 
              id="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL, TSLA, etc."
            />
          </div>
          <div>
            <Label htmlFor="days">Historical Days</Label>
            <Input 
              id="days"
              type="number"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value) || 30)}
              min="7"
              max="365"
            />
          </div>
          <div className="flex items-end">
            <Button 
              onClick={runBacktest}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Running...' : 'Run Backtest'}
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <p>📈 Strategy: Buy when Reddit sentiment greater than 0.3, hold for 3 days</p>
          <p>💰 Position Size: 10% of portfolio per trade</p>
        </div>
      </Card>

      {/* Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {backtestResults.map((result) => (
          <Card key={result.id} className="p-6 bg-gradient-card border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">{result.symbol}</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(result.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge 
                variant={result.total_return > 0 ? "default" : "destructive"}
                className="text-sm"
              >
                {formatPercent(result.total_return)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Return</span>
                  <span className={`font-semibold ${result.total_return > 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatPercent(result.total_return)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Win Rate</span>
                  <span className="font-semibold">{formatPercent(result.win_rate)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sharpe Ratio</span>
                  <span className="font-semibold">{formatNumber(result.sharpe_ratio)}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sentiment Correlation</span>
                  <span className={`font-semibold ${Math.abs(result.sentiment_correlation) > 0.3 ? 'text-primary' : 'text-muted-foreground'}`}>
                    {formatNumber(result.sentiment_correlation)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Max Drawdown</span>
                  <span className="font-semibold text-destructive">{formatPercent(result.max_drawdown)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Trades</span>
                  <span className="font-semibold">{result.trades_data?.length || 0}</span>
                </div>
              </div>
            </div>

            {/* Sentiment Correlation Indicator */}
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sentiment Predictive Power</span>
                <div className="flex items-center space-x-2">
                  {Math.abs(result.sentiment_correlation) > 0.5 ? (
                    <Activity className="w-4 h-4 text-success" />
                  ) : Math.abs(result.sentiment_correlation) > 0.3 ? (
                    <Activity className="w-4 h-4 text-primary" />
                  ) : (
                    <Activity className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className={`font-medium ${
                    Math.abs(result.sentiment_correlation) > 0.5 ? 'text-success' : 
                    Math.abs(result.sentiment_correlation) > 0.3 ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                  {Math.abs(result.sentiment_correlation) > 0.5 ? 'Strong' : 
                   Math.abs(result.sentiment_correlation) > 0.3 ? 'Moderate' : 'Weak'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {backtestResults.length === 0 && (
        <Card className="p-8 text-center bg-gradient-card border-border">
          <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">No Backtest Results Yet</h3>
          <p className="text-muted-foreground mb-4">
            Run your first backtest to see how Reddit sentiment correlates with market performance
          </p>
          <Button onClick={runBacktest} disabled={isLoading}>
            Run Sample Backtest
          </Button>
        </Card>
      )}
    </div>
  );
};

export default BacktestingDashboard;