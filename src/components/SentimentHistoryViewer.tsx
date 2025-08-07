import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Database, TrendingUp, TrendingDown, Activity, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface VelocityMetrics {
  symbol: string;
  source: string;
  velocity_1h: number;
  velocity_6h: number;
  velocity_24h: number;
  current_sentiment: number;
  confidence: number;
  last_updated: Date;
  momentum: 'ACCELERATING' | 'DECELERATING' | 'STABLE';
}

interface SentimentHistoryViewerProps {
  symbols?: string[];
  timeframe?: '1h' | '6h' | '24h' | '7d';
  refreshInterval?: number;
}

export const SentimentHistoryViewer: React.FC<SentimentHistoryViewerProps> = ({
  symbols = [],
  timeframe = '24h',
  refreshInterval = 60000 // 1 minute
}) => {
  const [velocityData, setVelocityData] = useState<VelocityMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Calculate time boundaries for queries
  const getTimeframeBoundary = (tf: string): Date => {
    const now = new Date();
    switch (tf) {
      case '1h': return new Date(now.getTime() - 60 * 60 * 1000);
      case '6h': return new Date(now.getTime() - 6 * 60 * 60 * 1000);
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      default: return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  };

  // Calculate sentiment velocity from historical data
  const calculateVelocity = async (symbol: string): Promise<VelocityMetrics | null> => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Fetch recent sentiment history for this symbol
      const { data: historyData, error } = await supabase
        .from('sentiment_history')
        .select('*')
        .eq('symbol', symbol)
        .gte('data_timestamp', oneDayAgo.toISOString())
        .order('data_timestamp', { ascending: false })
        .limit(50);

      if (error || !historyData || historyData.length === 0) {
        return null;
      }

      // Group by source and calculate velocities
      const sourceGroups = historyData.reduce((acc, row) => {
        if (!acc[row.source]) acc[row.source] = [];
        acc[row.source].push(row);
        return acc;
      }, {} as Record<string, any[]>);

      // Calculate weighted average velocity across sources
      let totalVelocity1h = 0;
      let totalVelocity6h = 0;
      let totalVelocity24h = 0;
      let totalConfidence = 0;
      let sourceCount = 0;

      for (const [source, data] of Object.entries(sourceGroups)) {
        if (data.length < 2) continue;

        // Get current and historical values
        const current = data[0];
        const oneHourData = data.find(d => 
          new Date(d.data_timestamp) <= new Date(now.getTime() - 60 * 60 * 1000)
        );
        const sixHourData = data.find(d => 
          new Date(d.data_timestamp) <= new Date(now.getTime() - 6 * 60 * 60 * 1000)
        );
        const twentyFourHourData = data.find(d => 
          new Date(d.data_timestamp) <= new Date(now.getTime() - 24 * 60 * 60 * 1000)
        );

        if (oneHourData) {
          totalVelocity1h += (current.sentiment_score - oneHourData.sentiment_score) * current.confidence_score;
        }
        if (sixHourData) {
          totalVelocity6h += (current.sentiment_score - sixHourData.sentiment_score) * current.confidence_score;
        }
        if (twentyFourHourData) {
          totalVelocity24h += (current.sentiment_score - twentyFourHourData.sentiment_score) * current.confidence_score;
        }

        totalConfidence += current.confidence_score;
        sourceCount++;
      }

      if (sourceCount === 0) return null;

      const avgConfidence = totalConfidence / sourceCount;
      const velocity1h = totalVelocity1h / sourceCount;
      const velocity6h = totalVelocity6h / sourceCount;
      const velocity24h = totalVelocity24h / sourceCount;

      // Determine momentum based on velocity acceleration
      let momentum: 'ACCELERATING' | 'DECELERATING' | 'STABLE';
      const velocityChange = Math.abs(velocity1h) - Math.abs(velocity6h);
      if (velocityChange > 0.05) momentum = 'ACCELERATING';
      else if (velocityChange < -0.05) momentum = 'DECELERATING';
      else momentum = 'STABLE';

      return {
        symbol,
        source: 'aggregated',
        velocity_1h: velocity1h,
        velocity_6h: velocity6h,
        velocity_24h: velocity24h,
        current_sentiment: historyData[0]?.sentiment_score || 0,
        confidence: avgConfidence,
        last_updated: new Date(),
        momentum
      };

    } catch (error) {
      console.error(`Error calculating velocity for ${symbol}:`, error);
      return null;
    }
  };

  // Fetch velocity data for all symbols
  const fetchVelocityData = async () => {
    if (symbols.length === 0) return;
    
    setIsLoading(true);
    try {
      const velocityPromises = symbols.map(symbol => calculateVelocity(symbol));
      const results = await Promise.all(velocityPromises);
      const validResults = results.filter(r => r !== null) as VelocityMetrics[];
      
      // Sort by 1-hour velocity magnitude (most active first)
      validResults.sort((a, b) => Math.abs(b.velocity_1h) - Math.abs(a.velocity_1h));
      
      setVelocityData(validResults);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching velocity data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Setup refresh interval
  useEffect(() => {
    if (symbols.length > 0) {
      fetchVelocityData();
      const interval = setInterval(fetchVelocityData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [symbols, refreshInterval]);

  const getVelocityColor = (velocity: number) => {
    if (velocity > 0.1) return 'text-green-600 font-bold';
    if (velocity > 0.05) return 'text-green-500';
    if (velocity < -0.1) return 'text-red-600 font-bold';
    if (velocity < -0.05) return 'text-red-500';
    return 'text-gray-600';
  };

  const getMomentumIcon = (momentum: string) => {
    switch (momentum) {
      case 'ACCELERATING': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'DECELERATING': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'STABLE': return <Activity className="w-4 h-4 text-blue-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getMomentumColor = (momentum: string) => {
    switch (momentum) {
      case 'ACCELERATING': return 'bg-green-100 text-green-800 border-green-200';
      case 'DECELERATING': return 'bg-red-100 text-red-800 border-red-200';
      case 'STABLE': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Historical Sentiment Velocity
        </CardTitle>
        <div className="flex items-center gap-4">
          {lastUpdate && (
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {lastUpdate.toLocaleTimeString()}
            </div>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchVelocityData}
            disabled={isLoading}
          >
            {isLoading ? <Activity className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {velocityData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {isLoading ? 'Loading velocity data...' : 'No velocity data available'}
          </div>
        ) : (
          <div className="space-y-4">
            {velocityData.slice(0, 10).map((item, index) => (
              <Card key={index} className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedSymbol(selectedSymbol === item.symbol ? null : item.symbol)}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{item.symbol}</h3>
                    <Badge className={getMomentumColor(item.momentum)}>
                      {getMomentumIcon(item.momentum)}
                      <span className="ml-1">{item.momentum}</span>
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      {(item.current_sentiment * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Sentiment
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className={`text-lg font-bold ${getVelocityColor(item.velocity_1h)}`}>
                      {item.velocity_1h > 0 ? '+' : ''}{(item.velocity_1h * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">1h Velocity</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${getVelocityColor(item.velocity_6h)}`}>
                      {item.velocity_6h > 0 ? '+' : ''}{(item.velocity_6h * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">6h Velocity</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${getVelocityColor(item.velocity_24h)}`}>
                      {item.velocity_24h > 0 ? '+' : ''}{(item.velocity_24h * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">24h Velocity</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Confidence</span>
                    <span>{(item.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={item.confidence * 100} className="h-2" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SentimentHistoryViewer;