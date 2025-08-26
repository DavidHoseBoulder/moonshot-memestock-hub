import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RedditCoverage {
  totalTickers: number;
  withRedditSentiment: number;
  zeroSentiment: number;
  coveragePercentage: number;
  redditStatus: 'active' | 'awaiting';
  lastUpdate: Date | null;
}

interface SentimentCoverageProps {
  refreshInterval?: number;
}

export const SentimentCoverageMonitor: React.FC<SentimentCoverageProps> = ({
  refreshInterval = 300000 // 5 minutes default
}) => {
  const [coverage, setCoverage] = useState<RedditCoverage>({
    totalTickers: 0,
    withRedditSentiment: 0,
    zeroSentiment: 0,
    coveragePercentage: 0,
    redditStatus: 'awaiting',
    lastUpdate: null
  });
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();

  const fetchCoverageData = async () => {
    setIsLoading(true);
    try {
      // Get total ticker count from ticker_universe
      const { data: totalTickers, error: totalError, count: totalCount } = await supabase
        .from('ticker_universe')
        .select('symbol', { count: 'exact' })
        .eq('active', true);

      if (totalError) {
        console.error('Error fetching total tickers:', totalError);
        return;
      }

      // Get today's Reddit sentiment coverage from v_reddit_daily_signals
      const today = new Date().toISOString().split('T')[0];
      const { data: redditData, error: redditError, count: redditCount } = await supabase
        .from('v_reddit_daily_signals')
        .select('symbol', { count: 'exact' })
        .eq('trade_date', today);

      if (redditError) {
        console.error('Error fetching Reddit coverage:', redditError);
        return;
      }

      const totalTickersCount = totalCount || 0;
      const withRedditSentimentCount = redditCount || 0;
      const zeroSentimentCount = totalTickersCount - withRedditSentimentCount;
      const coveragePercentage = totalTickersCount > 0 
        ? (withRedditSentimentCount / totalTickersCount) * 100 
        : 0;

      // Determine Reddit status based on whether we have data for today
      const redditStatus = withRedditSentimentCount > 0 ? 'active' : 'awaiting';

      setCoverage({
        totalTickers: totalTickersCount,
        withRedditSentiment: withRedditSentimentCount,
        zeroSentiment: zeroSentimentCount,
        coveragePercentage,
        redditStatus,
        lastUpdate: new Date()
      });

      toast({
        title: "Coverage Updated",
        description: `${coveragePercentage.toFixed(1)}% Reddit coverage (${withRedditSentimentCount}/${totalTickersCount} tickers)`,
      });

    } catch (error) {
      console.error('Error fetching coverage data:', error);
      toast({
        title: "Update Error",
        description: "Failed to fetch coverage data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCoverageData();
    
    const interval = setInterval(fetchCoverageData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/20 dark:text-green-200 dark:border-green-800';
      case 'awaiting': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-200 dark:border-amber-800';
      default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-950/20 dark:text-gray-200 dark:border-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'awaiting': return <Clock className="w-4 h-4 text-amber-600" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active (MVP)';
      case 'awaiting': return 'Awaiting today\'s run';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-4">
      {/* Reddit-only MVP Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className="bg-gradient-primary text-primary-foreground">
            Reddit-only MVP
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Reddit Sentiment Coverage
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              {coverage.lastUpdate && `Last updated: ${coverage.lastUpdate.toLocaleTimeString()}`}
            </div>
            <RefreshCw 
              className={`w-4 h-4 cursor-pointer ${isLoading ? 'animate-spin' : ''}`}
              onClick={fetchCoverageData}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-foreground">{coverage.totalTickers}</div>
              <div className="text-sm text-muted-foreground">Total Tickers</div>
              <div className="text-xs text-muted-foreground mt-1">
                Active in ticker_universe
              </div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-green-600">{coverage.withRedditSentiment}</div>
              <div className="text-sm text-muted-foreground">With Reddit Sentiment</div>
              <div className="text-xs text-muted-foreground mt-1">
                Today's Reddit data
              </div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-red-600">{coverage.zeroSentiment}</div>
              <div className="text-sm text-muted-foreground">Zero Sentiment</div>
              <div className="text-xs text-muted-foreground mt-1">
                No Reddit mentions today
              </div>
            </div>
          </div>
          
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span>Reddit Coverage</span>
              <span className="font-semibold">{coverage.coveragePercentage.toFixed(1)}%</span>
            </div>
            <Progress value={coverage.coveragePercentage} className="h-3" />
            <div className="text-xs text-muted-foreground text-center">
              Coverage updates after daily Reddit pipeline run
            </div>
          </div>

          {/* Reddit Data Source Status */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-base">Reddit Data Source</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(coverage.redditStatus)}
                  <div>
                    <div className="font-medium">Reddit</div>
                    <div className="text-sm text-muted-foreground">
                      {coverage.coveragePercentage.toFixed(1)}% coverage • 
                      {coverage.withRedditSentiment} symbols today
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(coverage.redditStatus)}>
                    {getStatusText(coverage.redditStatus)}
                  </Badge>
                  {coverage.lastUpdate && (
                    <div className="text-xs text-muted-foreground">
                      {coverage.lastUpdate.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
              
              {coverage.redditStatus === 'awaiting' && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Waiting for today's data:</strong> Reddit sentiment pipeline runs daily. 
                    Coverage will update after processing completes.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
};

export default SentimentCoverageMonitor;