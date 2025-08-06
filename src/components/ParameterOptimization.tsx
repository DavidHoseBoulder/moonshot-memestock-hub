
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, TrendingUp, Target, Activity, Volume2, Scan } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ParameterOptimization = () => {
  const [symbol, setSymbol] = useState("AAPL");
  const [days, setDays] = useState(30);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { toast } = useToast();

  const runOptimization = async () => {
    setIsOptimizing(true);
    
    toast({
      title: "High-Conviction Strategy Optimization Started",
      description: `Testing 300+ parameter combinations for ${symbol} over ${days} days with sentiment deltas + volume filtering. This may take 10-15 minutes.`,
    });

    // In a real implementation, this would trigger the GitHub workflow
    // For now, we'll show instructions to the user
    setTimeout(() => {
      toast({
        title: "Optimization Instructions",
        description: `Go to your GitHub repository → Actions tab → Run 'Parameter Optimization' workflow manually with symbol: ${symbol}, days: ${days}. Advanced features are enabled by default.`,
      });
      setIsOptimizing(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            🎯 High-Conviction Strategy Optimization
            <Settings className="w-6 h-6 ml-3 text-primary" />
          </h2>
          <p className="text-muted-foreground">Validate strategy parameters for scalable, selective trading across multiple stocks</p>
        </div>
      </div>

      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          🧪 Strategy Validation & Parameter Tuning
          <Scan className="w-5 h-5 ml-2 text-blue-500" />
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <Label htmlFor="opt-symbol">Stock Symbol</Label>
            <Input 
              id="opt-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL, TSLA, BB, etc."
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

        {/* Always-On Advanced Features */}
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
          <h4 className="font-semibold mb-3 flex items-center text-green-700">
            <Activity className="w-4 h-4 mr-2" />
            🎯 High-Conviction Filters (Always Enabled):
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium text-green-700">Sentiment Delta Analysis</span>
            </div>
            <div className="flex items-center space-x-2">
              <Volume2 className="w-3 h-3 text-green-600" />
              <span className="text-sm font-medium text-green-700">Volume Spike Confirmation</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-green-600">
            Strategy focuses on sudden sentiment changes backed by unusual volume - ideal for 2-3 high-quality trades per stock per year
          </div>
        </div>

        <div className="mb-6 p-4 bg-white/50 rounded-lg border border-blue-100">
          <h4 className="font-semibold mb-3 flex items-center">
            <Target className="w-4 h-4 mr-2 text-blue-600" />
            Parameters to Optimize:
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
          <div className="mt-3 p-2 bg-green-100 rounded text-sm">
            <div className="font-medium text-green-700 mb-1">Advanced Signal Parameters:</div>
            <div className="text-green-600">• Sentiment change thresholds: 0.1, 0.2, 0.3</div>
            <div className="text-green-600">• Volume multipliers: 1.5x, 2x, 3x average</div>
          </div>
          <div className="mt-3 text-sm text-blue-600 font-medium">
            Total Combinations: 300+ high-conviction backtests
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>🎯 Optimizes for selective, high-conviction signals</p>
            <p>📊 Designed for 2-3 quality trades per stock per year</p>
            <p>🚀 Scalable across 50-100+ stock universe</p>
            <p>⏱️ Estimated runtime: 10-15 minutes</p>
          </div>
          <Button 
            onClick={runOptimization}
            disabled={isOptimizing}
            size="lg"
            className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
          >
            {isOptimizing ? (
              <>
                <Settings className="w-4 h-4 mr-2 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Validate Strategy
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-gradient-card border-border">
        <h3 className="font-bold text-lg mb-4">🔄 Scaling to Multi-Stock Universe</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xs mt-0.5">1</div>
            <div>
              <div className="font-medium text-foreground">Strategy Validation</div>
              <p>Test optimal parameters on individual stocks to validate the high-conviction approach</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xs mt-0.5">2</div>
            <div>
              <div className="font-medium text-foreground">Universe Expansion</div>
              <p>Apply validated parameters across 50-100 stocks with sufficient social signal volume</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xs mt-0.5">3</div>
            <div>
              <div className="font-medium text-foreground">Daily Signal Generation</div>
              <p>AI scans all stocks daily, surfaces only highest-conviction opportunities meeting all criteria</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xs mt-0.5">4</div>
            <div>
              <div className="font-medium text-foreground">Quality over Quantity</div>
              <p>2-3 trades per stock per year × 100 stocks = ~200-300 high-quality trades annually</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ParameterOptimization;
