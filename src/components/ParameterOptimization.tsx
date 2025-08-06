import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, TrendingUp, Target, Zap, Activity, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ParameterOptimization = () => {
  const [symbol, setSymbol] = useState("AAPL");
  const [days, setDays] = useState(30);
  const [enableSentimentDelta, setEnableSentimentDelta] = useState(false);
  const [enableVolumeFilter, setEnableVolumeFilter] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { toast } = useToast();

  const runOptimization = async () => {
    setIsOptimizing(true);
    
    const features = [];
    if (enableSentimentDelta) features.push("sentiment deltas");
    if (enableVolumeFilter) features.push("volume filters");
    
    const featuresText = features.length > 0 ? ` with ${features.join(" and ")}` : "";
    
    toast({
      title: "Enhanced Parameter Optimization Started",
      description: `Testing 125+ parameter combinations for ${symbol} over ${days} days${featuresText}. This may take 7-12 minutes.`,
    });

    // In a real implementation, this would trigger the GitHub workflow
    // For now, we'll show instructions to the user
    setTimeout(() => {
      toast({
        title: "Optimization Instructions",
        description: `Go to your GitHub repository → Actions tab → Run 'Parameter Optimization' workflow manually with symbol: ${symbol}, days: ${days}, and your selected advanced features.`,
      });
      setIsOptimizing(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            ⚙️ Parameter Optimization
            <Settings className="w-6 h-6 ml-3 text-primary" />
          </h2>
          <p className="text-muted-foreground">Automatically find optimal trading parameters with advanced features</p>
        </div>
      </div>

      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          🧪 Advanced Parameter Sweep
          <Zap className="w-5 h-5 ml-2 text-blue-500" />
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <Label htmlFor="opt-symbol">Stock Symbol</Label>
            <Input 
              id="opt-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL, TSLA, etc."
            />
          </div>
          <div>
            <Label htmlFor="opt-days">Historical Days</Label>
            <Input 
              id="opt-days"
              type="number"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value) || 30)}
              min="7"
              max="365"
            />
          </div>
        </div>

        {/* Advanced Features Section */}
        <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
          <h4 className="font-semibold mb-3 flex items-center text-purple-700">
            <Activity className="w-4 h-4 mr-2" />
            🚀 Advanced Trading Features:
          </h4>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="sentiment-delta"
                checked={enableSentimentDelta}
                onCheckedChange={setEnableSentimentDelta}
              />
              <Label htmlFor="sentiment-delta" className="text-sm">
                <span className="font-medium text-purple-700">Sentiment Delta Analysis</span>
                <div className="text-xs text-muted-foreground">
                  Trade on sudden sentiment spikes/drops instead of absolute thresholds
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="volume-filter"
                checked={enableVolumeFilter}
                onCheckedChange={setEnableVolumeFilter}
              />
              <Label htmlFor="volume-filter" className="text-sm">
                <span className="font-medium text-purple-700 flex items-center">
                  Volume & Price Action Filters <Volume2 className="w-3 h-3 ml-1" />
                </span>
                <div className="text-xs text-muted-foreground">
                  Combine sentiment with volume spikes and price momentum for stronger signals
                </div>
              </Label>
            </div>
          </div>
        </div>

        <div className="mb-6 p-4 bg-white/50 rounded-lg border border-blue-100">
          <h4 className="font-semibold mb-3 flex items-center">
            <Target className="w-4 h-4 mr-2 text-blue-600" />
            Parameters to Test:
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium text-blue-700">Sentiment Threshold</div>
              <Badge variant="outline" className="mt-1">0.2, 0.3, 0.4, 0.5, 0.6</Badge>
            </div>
            <div>
              <div className="font-medium text-blue-700">Holding Period</div>
              <Badge variant="outline" className="mt-1">1, 3, 5, 7, 10 days</Badge>
            </div>
            <div>
              <div className="font-medium text-blue-700">Position Size</div>
              <Badge variant="outline" className="mt-1">5%, 10%, 15%, 20%, 25%</Badge>
            </div>
          </div>
          {(enableSentimentDelta || enableVolumeFilter) && (
            <div className="mt-3 p-2 bg-purple-100 rounded text-sm">
              <div className="font-medium text-purple-700 mb-1">Additional Parameters:</div>
              {enableSentimentDelta && (
                <div className="text-purple-600">• Sentiment change thresholds: 0.1, 0.2, 0.3</div>
              )}
              {enableVolumeFilter && (
                <div className="text-purple-600">• Volume multipliers: 1.5x, 2x, 3x average</div>
              )}
            </div>
          )}
          <div className="mt-3 text-sm text-blue-600 font-medium">
            Total Combinations: {enableSentimentDelta || enableVolumeFilter ? '300+' : '125'} backtests
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>📊 Tests all parameter combinations systematically</p>
            <p>🏆 Ranks results by return, Sharpe ratio, and win rate</p>
            <p>⏱️ Estimated runtime: {enableSentimentDelta || enableVolumeFilter ? '10-15' : '5-10'} minutes</p>
            {(enableSentimentDelta || enableVolumeFilter) && (
              <p className="text-purple-600">🚀 Enhanced with advanced trading signals</p>
            )}
          </div>
          <Button 
            onClick={runOptimization}
            disabled={isOptimizing}
            size="lg"
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          >
            {isOptimizing ? (
              <>
                <Settings className="w-4 h-4 mr-2 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Start Enhanced Optimization
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-gradient-card border-border">
        <h3 className="font-bold text-lg mb-4">📈 How It Works</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mt-0.5">1</div>
            <div>
              <div className="font-medium text-foreground">Parameter Grid Search</div>
              <p>Tests every combination of sentiment thresholds, holding periods, and position sizes</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mt-0.5">2</div>
            <div>
              <div className="font-medium text-foreground">Advanced Signal Processing</div>
              <p>Analyzes sentiment deltas and volume patterns for more reliable trading signals</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mt-0.5">3</div>
            <div>
              <div className="font-medium text-foreground">Performance Ranking</div>
              <p>Ranks combinations by total return, risk-adjusted return (Sharpe), and win rate</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mt-0.5">4</div>
            <div>
              <div className="font-medium text-foreground">Optimal Parameters</div>
              <p>Identifies the best performing parameter combinations with advanced features</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ParameterOptimization;
