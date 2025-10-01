import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { todayInDenverDateString } from '@/utils/timezone';

interface SymbolCoverage {
  symbol: string;
  hasReddit: boolean;
  hasStockTwits: boolean;
  isActive: boolean;
}

interface SentimentCoverage {
  totalTickers: number;
  activeTickers: number;
  inactiveTickers: number;
  withRedditSentiment: number;
  withStockTwitsSentiment: number;
  zeroSentiment: number;
  redditCoveragePercentage: number;
  stockTwitsCoveragePercentage: number;
  redditStatus: 'active' | 'awaiting';
  stockTwitsStatus: 'active' | 'awaiting';
  lastUpdate: Date | null;
  symbolBreakdown: SymbolCoverage[];
}

interface SentimentCoverageProps {
  refreshInterval?: number;
}

export const SentimentCoverageMonitor: React.FC<SentimentCoverageProps> = ({
  refreshInterval = 300000 // 5 minutes default
}) => {
  const [coverage, setCoverage] = useState<SentimentCoverage>({
    totalTickers: 0,
    activeTickers: 0,
    inactiveTickers: 0,
    withRedditSentiment: 0,
    withStockTwitsSentiment: 0,
    zeroSentiment: 0,
    redditCoveragePercentage: 0,
    stockTwitsCoveragePercentage: 0,
    redditStatus: 'awaiting',
    stockTwitsStatus: 'awaiting',
    lastUpdate: null,
    symbolBreakdown: []
  });
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();

  const fetchCoverageData = async () => {
    setIsLoading(true);
    try {
      const today = todayInDenverDateString();
      
      // Get universe from ticker_universe
      const { data: tickerData, error: tickerError } = await supabase
        .from('ticker_universe')
        .select('symbol, active');

      if (tickerError || !tickerData) {
        throw tickerError || new Error('No ticker data');
      }

      const activeTickers = tickerData.filter(t => t.active);
      const inactiveTickers = tickerData.filter(t => !t.active);

      // Get symbols with Reddit sentiment today
      const { data: redditData } = await supabase
        .from('sentiment_history')
        .select('symbol')
        .eq('source', 'reddit')
        .gte('data_timestamp', `${today}T00:00:00Z`)
        .lt('data_timestamp', `${today}T23:59:59Z`);
      
      const redditSymbols = new Set(redditData?.map(h => h.symbol.toUpperCase()) || []);

      // Get symbols with StockTwits sentiment today
      const { data: stocktwitsData } = await supabase
        .from('sentiment_history')
        .select('symbol')
        .eq('source', 'stocktwits')
        .gte('data_timestamp', `${today}T00:00:00Z`)
        .lt('data_timestamp', `${today}T23:59:59Z`);
      
      const stocktwitsSymbols = new Set(stocktwitsData?.map(h => h.symbol.toUpperCase()) || []);

      // Build per-symbol breakdown
      const symbolBreakdown: SymbolCoverage[] = tickerData.map(ticker => ({
        symbol: ticker.symbol,
        hasReddit: redditSymbols.has(ticker.symbol.toUpperCase()),
        hasStockTwits: stocktwitsSymbols.has(ticker.symbol.toUpperCase()),
        isActive: ticker.active
      }));

      const withRedditSentiment = activeTickers.filter(t => 
        redditSymbols.has(t.symbol.toUpperCase())
      ).length;
      
      const withStockTwitsSentiment = activeTickers.filter(t => 
        stocktwitsSymbols.has(t.symbol.toUpperCase())
      ).length;

      const withAnySentiment = activeTickers.filter(t => 
        redditSymbols.has(t.symbol.toUpperCase()) || stocktwitsSymbols.has(t.symbol.toUpperCase())
      ).length;

      const zeroSentiment = activeTickers.length - withAnySentiment;
      const redditCoveragePercentage = activeTickers.length > 0 ? (withRedditSentiment / activeTickers.length) * 100 : 0;
      const stockTwitsCoveragePercentage = activeTickers.length > 0 ? (withStockTwitsSentiment / activeTickers.length) * 100 : 0;

      const redditStatus = withRedditSentiment > 0 ? 'active' : 'awaiting';
      const stockTwitsStatus = withStockTwitsSentiment > 0 ? 'active' : 'awaiting';

      setCoverage({
        totalTickers: tickerData.length,
        activeTickers: activeTickers.length,
        inactiveTickers: inactiveTickers.length,
        withRedditSentiment,
        withStockTwitsSentiment,
        zeroSentiment,
        redditCoveragePercentage,
        stockTwitsCoveragePercentage,
        redditStatus,
        stockTwitsStatus,
        lastUpdate: new Date(),
        symbolBreakdown
      });

      toast({
        title: "Coverage Updated",
        description: `Reddit: ${Math.round(redditCoveragePercentage)}% • StockTwits: ${Math.round(stockTwitsCoveragePercentage)}%`,
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
      case 'active': return 'Active';
      case 'awaiting': return 'Awaiting';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Sentiment Data Coverage
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
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-primary">{coverage.totalTickers}</div>
                  <div className="text-sm text-muted-foreground">Total Symbols</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{coverage.activeTickers}</div>
                  <div className="text-sm text-muted-foreground">Active</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">{coverage.inactiveTickers}</div>
                  <div className="text-sm text-muted-foreground">Inactive</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{coverage.withRedditSentiment}</div>
                  <div className="text-sm text-muted-foreground">Reddit Today</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{coverage.withStockTwitsSentiment}</div>
                  <div className="text-sm text-muted-foreground">StockTwits Today</div>
                </div>
              </div>

              {/* Per-Symbol Breakdown */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">Symbol Coverage</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {coverage.symbolBreakdown
                    .sort((a, b) => {
                      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                      return a.symbol.localeCompare(b.symbol);
                    })
                    .map((symbol) => (
                      <div 
                        key={symbol.symbol}
                        className={`p-2 border rounded text-center ${
                          !symbol.isActive ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="font-mono font-semibold text-sm">{symbol.symbol}</div>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <div className={`w-2 h-2 rounded-full ${symbol.hasReddit ? 'bg-blue-500' : 'bg-gray-300'}`} title="Reddit" />
                          <div className={`w-2 h-2 rounded-full ${symbol.hasStockTwits ? 'bg-purple-500' : 'bg-gray-300'}`} title="StockTwits" />
                        </div>
                      </div>
                    ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" /> Reddit
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-purple-500" /> StockTwits
                  </span>
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
          
          {/* Data Source Status Cards */}
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            {/* Reddit Data Source */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base">Reddit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(coverage.redditStatus)}
                    <div>
                      <div className="font-medium">Status</div>
                      <div className="text-sm text-muted-foreground">
                        {coverage.withRedditSentiment} symbols today
                      </div>
                    </div>
                  </div>
                  <Badge className={getStatusColor(coverage.redditStatus)}>
                    {getStatusText(coverage.redditStatus)}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Coverage</span>
                    <span className="font-semibold">{coverage.redditCoveragePercentage.toFixed(1)}%</span>
                  </div>
                  <Progress value={coverage.redditCoveragePercentage} className="h-2" />
                </div>

                {coverage.redditStatus === 'awaiting' && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-200">
                    Waiting for today's Reddit pipeline run
                  </div>
                )}
              </CardContent>
            </Card>

            {/* StockTwits Data Source */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base">StockTwits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(coverage.stockTwitsStatus)}
                    <div>
                      <div className="font-medium">Status</div>
                      <div className="text-sm text-muted-foreground">
                        {coverage.withStockTwitsSentiment} symbols today
                      </div>
                    </div>
                  </div>
                  <Badge className={getStatusColor(coverage.stockTwitsStatus)}>
                    {getStatusText(coverage.stockTwitsStatus)}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Coverage</span>
                    <span className="font-semibold">{coverage.stockTwitsCoveragePercentage.toFixed(1)}%</span>
                  </div>
                  <Progress value={coverage.stockTwitsCoveragePercentage} className="h-2" />
                </div>

                {coverage.stockTwitsStatus === 'awaiting' && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-200">
                    Waiting for today's StockTwits data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SentimentCoverageMonitor;