import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, XCircle, TrendingUp } from "lucide-react";

interface DataSourceStatus {
  name: string;
  status: 'active' | 'degraded' | 'down';
  coverage: number; // percentage of tickers with data
  lastUpdate: Date;
  errorMessage?: string;
}

interface SentimentCoverageProps {
  dataSourcesStatus: DataSourceStatus[];
  tickerCoverage: {
    total: number;
    withSentiment: number;
    withTechnical: number;
    zeroSentiment: number;
  };
}

export const SentimentCoverageMonitor: React.FC<SentimentCoverageProps> = ({
  dataSourcesStatus,
  tickerCoverage
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'degraded': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'down': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'degraded': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'down': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <XCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const overallCoverage = tickerCoverage.total > 0 
    ? (tickerCoverage.withSentiment / tickerCoverage.total) * 100 
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Sentiment Data Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{tickerCoverage.total}</div>
              <div className="text-sm text-muted-foreground">Total Tickers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{tickerCoverage.withSentiment}</div>
              <div className="text-sm text-muted-foreground">With Sentiment</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{tickerCoverage.withTechnical}</div>
              <div className="text-sm text-muted-foreground">With Technical</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{tickerCoverage.zeroSentiment}</div>
              <div className="text-sm text-muted-foreground">Zero Sentiment</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Coverage</span>
              <span>{overallCoverage.toFixed(1)}%</span>
            </div>
            <Progress value={overallCoverage} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Source Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {dataSourcesStatus.map((source, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(source.status)}
                  <div>
                    <div className="font-medium">{source.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {source.coverage.toFixed(1)}% coverage
                      {source.errorMessage && (
                        <span className="text-red-600 ml-2">• {source.errorMessage}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(source.status)}>
                    {source.status}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    {source.lastUpdate.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SentimentCoverageMonitor;