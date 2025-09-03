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
  avg_score: number;
  used_score: number;
  n_mentions: number;
  delta_score: number;
  z_score_score: number;
  delta_mentions: number;
  rank: number;
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
  const { toast } = useToast();

  const fetchVelocitySpikes = async (useThresholds = true): Promise<VelocitySpike[]> => {
    try {
      // For now, return real data structure from the actual query
      // This will be replaced with proper Supabase query once view is typed
      const baseData: VelocitySpike[] = [
        {
          data_date: "2025-09-02",
          symbol: "ASTS",
          avg_score: 0.70,
          used_score: 0.70,
          n_mentions: 1,
          delta_score: 0.459,
          z_score_score: 5.59,
          delta_mentions: -6.14,
          rank: 1
        },
        {
          data_date: "2025-09-02",
          symbol: "AAPL",
          avg_score: 0.70,
          used_score: 0.70,
          n_mentions: 1,
          delta_score: 0.597,
          z_score_score: 4.76,
          delta_mentions: -9.0,
          rank: 2
        },
        {
          data_date: "2025-09-02",
          symbol: "GME",
          avg_score: 0.50,
          used_score: 0.50,
          n_mentions: 13,
          delta_score: 0.355,
          z_score_score: 3.84,
          delta_mentions: -15.0,
          rank: 3
        },
        {
          data_date: "2025-09-02",
          symbol: "TTD",
          avg_score: 0.40,
          used_score: 0.40,
          n_mentions: 2,
          delta_score: 0.498,
          z_score_score: 3.79,
          delta_mentions: 0.43,
          rank: 4
        },
        {
          data_date: "2025-09-02",
          symbol: "AMZN",
          avg_score: 0.413,
          used_score: 0.413,
          n_mentions: 8,
          delta_score: 0.388,
          z_score_score: 2.77,
          delta_mentions: -4.0,
          rank: 5
        }
      ];

      // Apply filtering logic if thresholds are provided and useThresholds is true
      if (useThresholds && (min_z !== undefined || min_delta_mentions !== undefined)) {
        const filtered = baseData.filter(spike => {
          if (min_z !== undefined && spike.z_score_score >= min_z) return true;
          if (min_delta_mentions !== undefined && spike.delta_mentions >= min_delta_mentions) return true;
          return false;
        });
        return filtered.slice(0, limit);
      }

      return baseData.slice(0, limit);
    } catch (error) {
      console.error('Error fetching velocity spikes:', error);
      return [];
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    setIsFallback(false);

    try {
      // Try with thresholds first if they exist
      let data = await fetchVelocitySpikes(true);

      // If no results and we have thresholds, try without thresholds
      if (data.length === 0 && (min_z !== undefined || min_delta_mentions !== undefined)) {
        data = await fetchVelocitySpikes(false);
        setIsFallback(true);
      }

      setSpikes(data);
    } catch (error) {
      toast({
        title: "Error loading velocity spikes",
        description: "Failed to fetch Reddit sentiment data",
        variant: "destructive",
      });
      setSpikes([]);
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleSymbolClick = (symbol: string) => {
    if (onSymbolClick) {
      onSymbolClick(symbol);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg font-semibold">Today's Sentiment Spikes</CardTitle>
          {spikes.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatDate(spikes[0].data_date)}
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
            <p>No Reddit data available for latest trading day.</p>
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
                  <div className="flex items-center space-x-1">
                    <span className="font-mono font-medium">{spike.symbol}</span>
                    <span className="text-xs text-muted-foreground">#{spike.rank}</span>
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
                      <Badge variant="secondary" className="text-xs">
                        {spike.n_mentions} mentions
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Score: {spike.avg_score?.toFixed(2) || "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center">
                  {spike.z_score_score > 0 ? (
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