import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Activity, BarChart3 } from "lucide-react";

interface SentimentPoint {
  timestamp: Date;
  sentiment: number;
  volume: number;
  source: string;
}

interface VelocityData {
  symbol: string;
  currentSentiment: number;
  velocity1h: number;
  velocity6h: number;
  velocity24h: number;
  mentionFrequency: number;
  momentum: 'ACCELERATING' | 'DECELERATING' | 'STABLE';
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  history: SentimentPoint[];
}

interface SentimentVelocityProps {
  symbols: string[];
  refreshInterval?: number; // milliseconds
}

export const SentimentVelocityTracker: React.FC<SentimentVelocityProps> = ({
  symbols,
  refreshInterval = 300000 // 5 minutes default
}) => {
  const [velocityData, setVelocityData] = useState<VelocityData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Calculate velocity between two time periods
  const calculateVelocity = (current: number, previous: number): number => {
    return current - previous;
  };

  // Determine momentum based on velocity trends
  const determineMomentum = (velocity1h: number, velocity6h: number): 'ACCELERATING' | 'DECELERATING' | 'STABLE' => {
    const velocityChange = Math.abs(velocity1h) - Math.abs(velocity6h);
    if (velocityChange > 0.1) return 'ACCELERATING';
    if (velocityChange < -0.1) return 'DECELERATING';
    return 'STABLE';
  };

  // Determine trend based on current sentiment and velocity
  const determineTrend = (sentiment: number, velocity: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
    if (sentiment > 0.6 && velocity > 0.05) return 'BULLISH';
    if (sentiment < 0.4 && velocity < -0.05) return 'BEARISH';
    return 'NEUTRAL';
  };

  // Generate mock historical data for demonstration
  const generateMockHistory = (symbol: string): SentimentPoint[] => {
    const history: SentimentPoint[] = [];
    const now = new Date();
    
    // Generate 24 hours of data points (every hour)
    for (let i = 24; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000));
      const baseSentiment = 0.4 + Math.random() * 0.4; // 0.4 to 0.8
      
      // Add some trend and volatility
      const trendFactor = Math.sin((24 - i) / 6) * 0.1; // Cyclical trend
      const noise = (Math.random() - 0.5) * 0.15; // Random noise
      
      const sentiment = Math.max(0.1, Math.min(0.9, baseSentiment + trendFactor + noise));
      const volume = Math.floor(Math.random() * 100) + 10;
      
      history.push({
        timestamp,
        sentiment,
        volume,
        source: ['reddit', 'stocktwits', 'news', 'youtube'][Math.floor(Math.random() * 4)]
      });
    }
    
    return history;
  };

  // Calculate velocity data for a symbol
  const calculateVelocityData = (symbol: string): VelocityData => {
    const history = generateMockHistory(symbol);
    const current = history[history.length - 1];
    const oneHourAgo = history[history.length - 2];
    const sixHoursAgo = history[history.length - 7];
    const twentyFourHoursAgo = history[0];
    
    const velocity1h = calculateVelocity(current.sentiment, oneHourAgo?.sentiment || current.sentiment);
    const velocity6h = calculateVelocity(current.sentiment, sixHoursAgo?.sentiment || current.sentiment);
    const velocity24h = calculateVelocity(current.sentiment, twentyFourHoursAgo?.sentiment || current.sentiment);
    
    const mentionFrequency = history.reduce((sum, point) => sum + point.volume, 0) / history.length;
    const momentum = determineMomentum(velocity1h, velocity6h);
    const trend = determineTrend(current.sentiment, velocity1h);
    
    return {
      symbol,
      currentSentiment: current.sentiment,
      velocity1h,
      velocity6h,
      velocity24h,
      mentionFrequency,
      momentum,
      trend,
      history
    };
  };

  // Fetch velocity data for all symbols
  const fetchVelocityData = async () => {
    setIsLoading(true);
    try {
      // In a real implementation, this would call your sentiment APIs
      // For now, generate mock data
      const data = symbols.map(calculateVelocityData);
      setVelocityData(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching velocity data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Setup refresh interval
  useEffect(() => {
    fetchVelocityData();
    
    const interval = setInterval(fetchVelocityData, refreshInterval);
    return () => clearInterval(interval);
  }, [symbols, refreshInterval]);

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'BULLISH': return 'bg-green-100 text-green-800 border-green-200';
      case 'BEARISH': return 'bg-red-100 text-red-800 border-red-200';
      case 'NEUTRAL': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getMomentumIcon = (momentum: string) => {
    switch (momentum) {
      case 'ACCELERATING': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'DECELERATING': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'STABLE': return <Activity className="w-4 h-4 text-blue-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getVelocityColor = (velocity: number) => {
    if (velocity > 0.1) return 'text-green-600';
    if (velocity < -0.1) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Sentiment Velocity Tracker
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            {lastUpdate && `Last updated: ${lastUpdate.toLocaleTimeString()}`}
            {isLoading && <span className="ml-2">Updating...</span>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {velocityData.map((data, index) => (
              <Card key={index} className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{data.symbol}</h3>
                    <Badge className={getTrendColor(data.trend)}>
                      {data.trend}
                    </Badge>
                    <div className="flex items-center gap-1">
                      {getMomentumIcon(data.momentum)}
                      <span className="text-sm text-muted-foreground">
                        {data.momentum}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      {(data.currentSentiment * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Current Sentiment
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span>Sentiment Level</span>
                    <span>{(data.currentSentiment * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={data.currentSentiment * 100} className="h-2" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className={`text-lg font-bold ${getVelocityColor(data.velocity1h)}`}>
                      {data.velocity1h > 0 ? '+' : ''}{(data.velocity1h * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">1h Velocity</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${getVelocityColor(data.velocity6h)}`}>
                      {data.velocity6h > 0 ? '+' : ''}{(data.velocity6h * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">6h Velocity</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${getVelocityColor(data.velocity24h)}`}>
                      {data.velocity24h > 0 ? '+' : ''}{(data.velocity24h * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">24h Velocity</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold">
                      {data.mentionFrequency.toFixed(0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Mentions</div>
                  </div>
                </div>

                {/* Mini sentiment history chart would go here in a real implementation */}
                <div className="mt-4 text-xs text-muted-foreground">
                  {data.history.length} data points over 24h
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SentimentVelocityTracker;