
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, BarChart3, Target, Activity, Database, Calculator, Sparkles } from "lucide-react";
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
  const [lastRunTimestamp, setLastRunTimestamp] = useState<string | null>(null);
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
    const runStartTime = new Date().toISOString();
    setLastRunTimestamp(runStartTime);
    
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

  const triggerAIAnalysis = async () => {
    setIsLoading(true);
    
    try {
      // Trigger GitHub Actions workflow via repository dispatch
      const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY || 'YOUR_USERNAME/YOUR_REPO'}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          event_type: 'run-ai-backtest',
          client_payload: {
            symbol: symbol,
            days: days
          }
        })
      });

      if (response.ok) {
        toast({
          title: "AI Analysis Started!",
          description: `GitHub Actions is analyzing ${symbol} and will update the strategy automatically.`,
        });
      } else {
        throw new Error('Failed to trigger AI analysis');
      }
    } catch (error) {
      console.error('Error triggering AI analysis:', error);
      toast({
        title: "AI Analysis Failed",
        description: "Could not start automated analysis. Check console for details.",
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

  // Check if a result is the latest run (within 30 seconds of the last run timestamp)
  const isLatestResult = (result: BacktestResult) => {
    if (!lastRunTimestamp) return false;
    const resultTime = new Date(result.created_at).getTime();
    const runTime = new Date(lastRunTimestamp).getTime();
    return Math.abs(resultTime - runTime) < 30000; // Within 30 seconds
  };

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

      {/* Enhanced Backtesting Controls */}
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
          <div className="flex items-end gap-2">
            <Button 
              onClick={runBacktest}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Running...' : 'Run Backtest'}
            </Button>
            <Button 
              onClick={triggerAIAnalysis}
              disabled={isLoading}
              variant="secondary"
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
            >
              🤖 AI Optimize
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p>📈 Standard Strategy: Buy when Reddit sentiment &gt; 0.3, hold for 3 days</p>
          <p>🤖 AI Optimize: Analyzes your data and automatically improves the strategy via GitHub Actions</p>
        </div>
      </Card>

      {/* Results Grid */}
      <div className="space-y-4">
        {backtestResults.length > 0 && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Backtest Results</h3>
            <p className="text-sm text-muted-foreground">
              Showing {backtestResults.length} recent backtests
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {backtestResults.map((result, index) => {
            const isLatest = isLatestResult(result);
            const isFirstResult = index === 0;
            
            return (
              <Card 
                key={result.id} 
                className={`p-6 transition-all duration-300 ${
                  isLatest 
                    ? 'bg-gradient-to-br from-primary/5 to-accent/5 border-primary/30 shadow-lg' 
                    : 'bg-gradient-card border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div>
                      <h3 className="font-bold text-lg">{result.symbol}</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(result.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {isLatest && (
                      <Badge className="bg-primary/20 text-primary border-primary/30 flex items-center space-x-1">
                        <Sparkles className="w-3 h-3" />
                        <span>Latest</span>
                      </Badge>
                    )}
                    {isFirstResult && !isLatest && (
                      <Badge variant="outline" className="text-xs">
                        Most Recent
                      </Badge>
                    )}
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
            );
          })}
        </div>
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
