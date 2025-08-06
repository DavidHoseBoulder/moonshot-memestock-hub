
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, Clock, Target } from "lucide-react";

interface AIStrategyReport {
  symbol: string;
  timestamp: string;
  analysis: string;
  parameters: {
    sentiment_threshold: number;
    holding_period_days: number;
    position_size: number;
  };
}

const AIStrategyReports = () => {
  const [reports, setReports] = useState<AIStrategyReport[]>([]);

  // This would typically fetch from your GitHub repo or a database
  // For now, showing mock data to demonstrate the concept
  useEffect(() => {
    const mockReports: AIStrategyReport[] = [
      {
        symbol: "AAPL",
        timestamp: new Date().toISOString(),
        analysis: "Based on recent sentiment patterns and price movements, increasing the sentiment threshold to 0.45 and extending holding period to 5 days shows improved risk-adjusted returns. The market has been showing delayed reactions to sentiment changes.",
        parameters: {
          sentiment_threshold: 0.45,
          holding_period_days: 5,
          position_size: 0.12
        }
      }
    ];
    setReports(mockReports);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center">
          <Brain className="w-5 h-5 mr-2 text-purple-500" />
          AI Strategy Reports
        </h3>
        <Badge variant="secondary" className="bg-purple-100 text-purple-800">
          Auto-Generated
        </Badge>
      </div>

      {reports.map((report, index) => (
        <Card key={index} className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Badge className="bg-purple-500">{report.symbol}</Badge>
              <div className="flex items-center text-sm text-muted-foreground">
                <Clock className="w-4 h-4 mr-1" />
                {new Date(report.timestamp).toLocaleDateString()}
              </div>
            </div>
            <Brain className="w-5 h-5 text-purple-500" />
          </div>

          <div className="mb-4">
            <h4 className="font-medium mb-2">AI Analysis</h4>
            <p className="text-sm text-gray-700">{report.analysis}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-2 bg-white rounded border">
              <Target className="w-4 h-4 mx-auto mb-1 text-green-500" />
              <div className="text-xs text-muted-foreground">Sentiment Threshold</div>
              <div className="font-semibold">{report.parameters.sentiment_threshold}</div>
            </div>
            <div className="text-center p-2 bg-white rounded border">
              <Clock className="w-4 h-4 mx-auto mb-1 text-blue-500" />
              <div className="text-xs text-muted-foreground">Hold Days</div>
              <div className="font-semibold">{report.parameters.holding_period_days}</div>
            </div>
            <div className="text-center p-2 bg-white rounded border">
              <TrendingUp className="w-4 h-4 mx-auto mb-1 text-purple-500" />
              <div className="text-xs text-muted-foreground">Position Size</div>
              <div className="font-semibold">{(report.parameters.position_size * 100).toFixed(0)}%</div>
            </div>
          </div>
        </Card>
      ))}

      {reports.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          <Brain className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p>No AI strategy reports yet.</p>
          <p className="text-sm">Click "AI Optimize" on a backtest to generate automated analysis.</p>
        </Card>
      )}
    </div>
  );
};

export default AIStrategyReports;
