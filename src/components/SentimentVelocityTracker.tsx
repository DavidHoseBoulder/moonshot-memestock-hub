import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart3, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DailySentimentChange {
  symbol: string;
  currentScore: number;
  previousScore: number;
  deltaScore: number;
  currentMentions: number;
  previousMentions: number;
  deltaMentions: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
  currentDate: string;
  previousDate: string;
}

interface SentimentVelocityProps {
  symbols: string[];
  refreshInterval?: number;
}

export const SentimentVelocityTracker: React.FC<SentimentVelocityProps> = ({
  symbols,
  refreshInterval = 300000 // 5 minutes default
}) => {
  const [dailyChanges, setDailyChanges] = useState<DailySentimentChange[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [hasData, setHasData] = useState(true);
  
  const { toast } = useToast();

  const calculateDailyChanges = async (): Promise<DailySentimentChange[]> => {
    try {
      // Get today's data
      const { data: todayData, error: todayError } = await supabase
        .from('v_reddit_daily_signals')
        .select('*')
        .eq('trade_date', new Date().toISOString().split('T')[0]);

      // Get yesterday's data
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const { data: yesterdayData, error: yesterdayError } = await supabase
        .from('v_reddit_daily_signals')
        .select('*')
        .eq('trade_date', yesterday.toISOString().split('T')[0]);

      if (todayError || yesterdayError) {
        console.error('Error fetching daily changes:', todayError || yesterdayError);
        return [];
      }

      if (!todayData || todayData.length === 0) {
        setHasData(false);
        return [];
      }

      setHasData(true);

      // Create lookup for yesterday's data
      const yesterdayLookup = new Map(
        (yesterdayData || []).map(item => [item.symbol, item])
      );

      // Calculate changes for symbols that have today's data
      const changes: DailySentimentChange[] = todayData.map(today => {
        const yesterday = yesterdayLookup.get(today.symbol);
        
        const currentScore = today.used_score || 0;
        const previousScore = yesterday?.used_score || 0;
        const deltaScore = currentScore - previousScore;
        
        const currentMentions = today.n_mentions || 0;
        const previousMentions = yesterday?.n_mentions || 0;
        const deltaMentions = currentMentions - previousMentions;
        
        // Determine trend based on score delta with ±0.05 threshold
        let trend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
        if (deltaScore > 0.05) trend = 'UP';
        else if (deltaScore < -0.05) trend = 'DOWN';
        
        return {
          symbol: today.symbol,
          currentScore,
          previousScore,
          deltaScore,
          currentMentions,
          previousMentions,
          deltaMentions,
          trend,
          currentDate: today.trade_date,
          previousDate: yesterday?.trade_date || 'N/A'
        };
      });

      return changes;
    } catch (error) {
      console.error('Error calculating daily changes:', error);
      return [];
    }
  };

  const fetchDailyChanges = async () => {
    setIsLoading(true);
    try {
      const changes = await calculateDailyChanges();
      setDailyChanges(changes);
      setLastUpdate(new Date());
      
      if (changes.length > 0) {
        toast({
          title: "Daily Changes Updated",
          description: `Loaded changes for ${changes.length} symbols`,
        });
      }
    } catch (error) {
      console.error('Error fetching daily changes:', error);
      toast({
        title: "Update Error",
        description: "Failed to fetch daily sentiment changes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyChanges();
    
    const interval = setInterval(fetchDailyChanges, refreshInterval);
    return () => clearInterval(interval);
  }, [symbols, refreshInterval]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'UP': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'DOWN': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'FLAT': return <Minus className="w-4 h-4 text-gray-600" />;
      default: return <Minus className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'UP': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/20 dark:text-green-200 dark:border-green-800';
      case 'DOWN': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/20 dark:text-red-200 dark:border-red-800';
      case 'FLAT': return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-950/20 dark:text-gray-200 dark:border-gray-800';
      default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-950/20 dark:text-gray-200 dark:border-gray-800';
    }
  };

  const getDeltaColor = (delta: number, isScore = false) => {
    const threshold = isScore ? 0.05 : 0;
    if (delta > threshold) return 'text-green-600';
    if (delta < -threshold) return 'text-red-600';
    return 'text-gray-600';
  };

  const formatDelta = (delta: number, isScore = false) => {
    const prefix = delta > 0 ? '+' : '';
    return isScore ? `${prefix}${delta.toFixed(3)}` : `${prefix}${delta}`;
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
            <BarChart3 className="w-5 h-5" />
            Daily Sentiment Change
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              {lastUpdate && `Last updated: ${lastUpdate.toLocaleTimeString()}`}
            </div>
            <RefreshCw 
              className={`w-4 h-4 cursor-pointer ${isLoading ? 'animate-spin' : ''}`}
              onClick={fetchDailyChanges}
            />
          </div>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <div className="text-center py-12">
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <BarChart3 className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  Daily Change Coming Soon
                </h3>
                <p className="text-blue-700 dark:text-blue-300 text-sm">
                  Daily change will appear after today's Reddit run completes.
                </p>
                <p className="text-blue-600 dark:text-blue-400 text-xs mt-2">
                  (Reddit-only MVP)
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {dailyChanges.map((change, index) => (
                <Card key={index} className="p-4 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{change.symbol}</h3>
                      <Badge className={getTrendColor(change.trend)}>
                        <div className="flex items-center gap-1">
                          {getTrendIcon(change.trend)}
                          {change.trend}
                        </div>
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        {change.currentScore.toFixed(3)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Current Score
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className={`text-lg font-bold ${getDeltaColor(change.deltaScore, true)}`}>
                        {formatDelta(change.deltaScore, true)}
                      </div>
                      <div className="text-sm text-muted-foreground">Δ Score (d/d-1)</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {change.currentScore.toFixed(3)}
                      </div>
                      <div className="text-sm text-muted-foreground">Current Score</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${getDeltaColor(change.deltaMentions)}`}>
                        {formatDelta(change.deltaMentions)}
                      </div>
                      <div className="text-sm text-muted-foreground">Δ Mentions (d/d-1)</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {change.currentMentions}
                      </div>
                      <div className="text-sm text-muted-foreground">Mentions</div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground">
                      Comparing {change.currentDate} vs {change.previousDate} • 
                      Updates after daily Reddit pipeline run
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SentimentVelocityTracker;