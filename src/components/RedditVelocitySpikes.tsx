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
      const { data, error } = await supabase
        .from('v_latest_reddit_trade_date' as any)
        .select('data_date')
        .single();

      if (error) {
        console.error('Error fetching header date:', error);
        return null;
      }

      return ((data as any).data_date) as string;
    } catch (error) {
      console.error('Error fetching header date:', error);
      return null;
    }
  };

  const fetchVelocitySpikes = async (useThresholds = true): Promise<VelocitySpike[]> => {
    try {
      let query = supabase
        .from('v_today_velocity_ranked' as any)
        .select('*')
        .order('rank', { ascending: true });

      // Apply thresholds if requested
      if (useThresholds && min_z !== undefined && min_delta_mentions !== undefined) {
        query = query
          .gte('z_score_score', min_z)
          .gte('delta_mentions', min_delta_mentions);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching velocity spikes:', error);
        throw error;
      }

      return (data || [] as unknown) as VelocitySpike[];
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