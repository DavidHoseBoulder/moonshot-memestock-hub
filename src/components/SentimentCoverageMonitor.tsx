import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { todayInDenverDateString } from '@/utils/timezone';

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
      const today = todayInDenverDateString();
      
      // First try to get universe from live_sentiment_entry_rules for stable denominator
      let totalUniverse = 0;
      const { data: rulesData, error: rulesError } = await supabase
        .from('live_sentiment_entry_rules')
        .select('symbol, horizon')
        .eq('is_enabled', true);

      if (!rulesError && rulesData && rulesData.length > 0) {
        // Use rules as universe (symbol, horizon pairs)
        const uniquePairs = new Set(rulesData.map(r => `${r.symbol}:${r.horizon}`));
        totalUniverse = uniquePairs.size;
      } else {
        // Fallback to daily_sentiment_candidates for today
        const { data: candidatesData } = await supabase
          .from('daily_sentiment_candidates')
          .select('symbol, horizon')
          .eq('d', today);
        
        if (candidatesData) {
          const uniquePairs = new Set(candidatesData.map(c => `${c.symbol}:${c.horizon}`));
          totalUniverse = uniquePairs.size;
        }
      }

      // Get symbols with Reddit sentiment today using priority system:
      // 1. Try v_reddit_today_signals if present
      // 2. Fallback to v_reddit_daily_signals
      // 3. Fallback to sentiment_history filtered to today + Reddit
      let withRedditSentiment = 0;
      
      // Try v_reddit_daily_signals first (this is what we have available)
      const { data: signalsData, error: signalsError } = await supabase
        .from('v_reddit_daily_signals')
        .select('symbol')
        .eq('trade_date', today);

      if (!signalsError && signalsData) {
        withRedditSentiment = signalsData.length;
      } else {
        // Fallback to sentiment_history
        const { data: historyData } = await supabase
          .from('sentiment_history')
          .select('symbol')
          .eq('source', 'reddit')
          .gte('data_timestamp', `${today}T00:00:00Z`)
          .lt('data_timestamp', `${today}T23:59:59Z`);
        
        if (historyData) {
          const uniqueSymbols = new Set(historyData.map(h => h.symbol));
          withRedditSentiment = uniqueSymbols.size;
        }
      }

      const zeroSentiment = Math.max(0, totalUniverse - withRedditSentiment);
      const coveragePercentage = totalUniverse > 0 ? (withRedditSentiment / totalUniverse) * 100 : 0;

      // Determine Reddit status based on whether we have data for today
      const redditStatus = withRedditSentiment > 0 ? 'active' : 'awaiting';

      setCoverage({
        totalTickers: totalUniverse,
        withRedditSentiment,
        zeroSentiment,
        coveragePercentage,
        redditStatus,
        lastUpdate: new Date()
      });

      if (totalUniverse === 0) {
        toast({
          title: "No Universe Defined",
          description: "No rule universe defined for today",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Coverage Updated",
          description: `${Math.round(coveragePercentage)}% Reddit coverage (${withRedditSentiment}/${totalUniverse})`,
        });
      }

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
          {coverage.totalTickers > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-primary">{coverage.totalTickers}</div>
                <div className="text-sm text-muted-foreground">Total Universe</div>
                <div className="text-xs text-muted-foreground mt-1">
                  (symbol, horizon) pairs
                </div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{coverage.withRedditSentiment}</div>
                <div className="text-sm text-muted-foreground">With Reddit Sentiment</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Today's Reddit data
                </div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-red-600">{coverage.zeroSentiment}</div>
                <div className="text-sm text-muted-foreground">Zero Sentiment</div>
                <div className="text-xs text-muted-foreground mt-1">
                  No Reddit mentions today
                </div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{Math.round(coverage.coveragePercentage)}%</div>
                <div className="text-sm text-muted-foreground">Coverage %</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Reddit sentiment today
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
                <TrendingUp className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  No Rule Universe Defined
                </h3>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                  No trading rules or candidates found for today.
                </p>
              </div>
            </div>
          )}
          
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