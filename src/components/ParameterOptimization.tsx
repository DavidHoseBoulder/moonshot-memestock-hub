
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, TrendingUp, Target, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ParameterOptimization = () => {
  const [symbol, setSymbol] = useState("AAPL");
  const [days, setDays] = useState(30);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { toast } = useToast();

  const runOptimization = async () => {
    setIsOptimizing(true);
    
    toast({
      title: "Parameter Optimization Started",
      description: `Testing 125 parameter combinations for ${symbol} over ${days} days. This may take 5-10 minutes.`,
    });

    // In a real implementation, this would trigger the GitHub workflow
    // For now, we'll show instructions to the user
    setTimeout(() => {
      toast({
        title: "Optimization Instructions",
        description: "Go to your GitHub repository → Actions tab → Run 'Parameter Optimization' workflow manually with your symbol and days parameters.",
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
          <p className="text-muted-foreground">Automatically find optimal trading parameters</p>
        </div>
      </div>

      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          🧪 Automated Parameter Sweep
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
          <div className="mt-3 text-sm text-blue-600 font-medium">
            Total Combinations: 5 × 5 × 5 = 125 backtests
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>📊 Tests all parameter combinations systematically</p>
            <p>🏆 Ranks results by return, Sharpe ratio, and win rate</p>
            <p>⏱️ Estimated runtime: 5-10 minutes for 125 combinations</p>
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
                Start Optimization
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
              <div className="font-medium text-foreground">Performance Ranking</div>
              <p>Ranks combinations by total return, risk-adjusted return (Sharpe), and win rate</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mt-0.5">3</div>
            <div>
              <div className="font-medium text-foreground">Optimal Parameters</div>
              <p>Identifies the best performing parameter combinations for your strategy</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ParameterOptimization;
