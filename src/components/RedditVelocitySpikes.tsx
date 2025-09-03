import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VelocitySpike {
  data_date: string;
  symbol: string;
  rank: number;
  z_score_score: number | null;
  delta_mentions: number | null;
  n_mentions: number | null;
  avg_score: number | null;
}

interface RedditVelocitySpikesProps {
  limit?: number;
  min_z?: number;
  min_delta_mentions?: number;
  onSymbolClick?: (symbol: string) => void;
}

export default function RedditVelocitySpikes({
  limit = 10,
  min_z,
  min_delta_mentions,
  onSymbolClick
}: RedditVelocitySpikesProps) {
  const [spikes, setSpikes] = useState<VelocitySpike[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [headerDate, setHeaderDate] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchHeaderDate = async (): Promise<string | null> => {
    try {
      // TODO: Replace with actual query when v_latest_reddit_trade_date view is available
      // SELECT data_date FROM public.v_latest_reddit_trade_date;
      
      // For now, use a mock date that would come from the database
      const mockDate = new Date().toISOString().split('T')[0]; // Today's date as YYYY-MM-DD
      return mockDate;
    } catch (error) {
      console.error('Error fetching header date:', error);
      return null;
    }
  };

  const fetchVelocitySpikes = async (useThresholds = true): Promise<VelocitySpike[]> => {
    try {
      // TODO: Replace with actual query when v_today_velocity_ranked view is available
      // The actual query should be:
      /*
        SELECT
          data_date,
          symbol,
          rank,
          z_score_score,
          delta_mentions,
          n_mentions,
          avg_score
        FROM public.v_today_velocity_ranked
        WHERE rank <= :limit
        [AND (coalesce(z_score_score,0) >= :min_z OR coalesce(delta_mentions,0) >= :min_delta_mentions)]
        ORDER BY rank
      */
      
      // Mock data that matches the expected API structure
      const mockData: VelocitySpike[] = [
        {
          data_date: new Date().toISOString().split('T')[0],
          symbol: "ASTS",
          rank: 1,
          z_score_score: 5.6,
          delta_mentions: -6,
          n_mentions: 1,
          avg_score: 0.70
        },
        {
          data_date: new Date().toISOString().split('T')[0],
          symbol: "AAPL", 
          rank: 2,
          z_score_score: 4.8,
          delta_mentions: -9,
          n_mentions: 1,
          avg_score: 0.70
        },
        {
          data_date: new Date().toISOString().split('T')[0],
          symbol: "GME",
          rank: 3,
          z_score_score: 3.8,
          delta_mentions: -15,
          n_mentions: 13,
          avg_score: 0.50
        },
        {
          data_date: new Date().toISOString().split('T')[0],
          symbol: "TTD",
          rank: 4,
          z_score_score: 3.8,
          delta_mentions: 0,
          n_mentions: 2,  
          avg_score: 0.40
        },
        {
          data_date: new Date().toISOString().split('T')[0],
          symbol: "AMZN",
          rank: 5,
          z_score_score: 2.8,
          delta_mentions: -4,
          n_mentions: 8,
          avg_score: 0.41
        }
      ];

      // Apply filtering logic if thresholds are provided and useThresholds is true
      if (useThresholds && (min_z !== undefined || min_delta_mentions !== undefined)) {
        const filtered = mockData.filter(spike => {
          if (min_z !== undefined && (spike.z_score_score || 0) >= min_z) return true;
          if (min_delta_mentions !== undefined && (spike.delta_mentions || 0) >= min_delta_mentions) return true;
          return false;
        });
        return filtered.slice(0, limit);
      }

      return mockData.slice(0, limit);
    } catch (error) {
      console.error('Error fetching velocity spikes:', error);
      return [];
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    setIsFallback(false);

    try {
      // Fetch header date and velocity spikes
      const [dateResult, spikesResult] = await Promise.all([
        fetchHeaderDate(),
        fetchVelocitySpikes(true)
      ]);

      setHeaderDate(dateResult);

      // If no results and we have thresholds, try without thresholds
      let finalSpikes = spikesResult;
      if (finalSpikes.length === 0 && (min_z !== undefined || min_delta_mentions !== undefined)) {
        finalSpikes = await fetchVelocitySpikes(false);
        setIsFallback(true);
      }

      setSpikes(finalSpikes);
    } catch (error) {
      toast({
        title: "Error loading velocity spikes",
        description: "Failed to fetch Reddit sentiment data",
        variant: "destructive",
      });
      setSpikes([]);
      setHeaderDate(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [limit, min_z, min_delta_mentions]);

  const formatZScore = (zScore: number | null) => {
    if (zScore === null || zScore === undefined) return "—";
    const sign = zScore >= 0 ? "+" : "";
    return `${sign}${zScore.toFixed(1)}σ`;
  };

  const formatDeltaMentions = (delta: number | null) => {
    if (delta === null || delta === undefined) return "—";
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta} vs 7d avg`;
  };

  const formatMentions = (count: number | null) => {
    if (count === null || count === undefined) return "0 mentions";
    return `${count} ${count === 1 ? 'mention' : 'mentions'}`;
  };

  const handleSymbolClick = (symbol: string) => {
    if (onSymbolClick) {
      onSymbolClick(symbol);
    }
  };

  // Show empty state if no header date (no data available)
  if (!isLoading && !headerDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Today's Sentiment Spikes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <p>No Reddit data available for the latest trading day.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg font-semibold">Today's Sentiment Spikes</CardTitle>
          {headerDate && (
            <p className="text-sm text-muted-foreground">
              {new Date(headerDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadData}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isFallback && (
          <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
            No unusual spikes today — showing top movers instead.
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-4 w-12" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-6 w-8" />
              </div>
            ))}
          </div>
        ) : spikes.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>No spikes detected today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {spikes.map((spike) => (
              <div
                key={`${spike.symbol}-${spike.rank}`}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handleSymbolClick(spike.symbol)}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-medium">{spike.symbol}</span>
                    <Badge variant="outline" className="text-xs">
                      #{spike.rank}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium">
                        {formatZScore(spike.z_score_score)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDeltaMentions(spike.delta_mentions)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-muted-foreground">
                        {formatMentions(spike.n_mentions)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Score: {spike.avg_score?.toFixed(2) || "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center">
                  {(spike.z_score_score || 0) > 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}