import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, DollarSign, Target, ExternalLink, X, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Trade {
  trade_id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  horizon: string;
  mode: 'paper' | 'live';
  status: 'open' | 'closed';
  source: string;
  trade_date: string;
  entry_date: string;
  entry_price: number;
  entry_price_source: string;
  exit_date?: string;
  exit_price?: number;
  exit_price_source?: string;
  notes?: string;
  created_at: string;
}

interface MarketData {
  symbol: string;
  price: number;
  timestamp: string;
  data_date: string;
}

interface TradeWithPnL extends Trade {
  current_price?: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  return_pct?: number;
  mark_timestamp?: string;
}

const TradesOverview = () => {
  const [trades, setTrades] = useState<TradeWithPnL[]>([]);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paper' | 'live'>('all');
  const { toast } = useToast();

  // Calculate PnL for a trade
  const calculatePnL = (trade: Trade, currentPrice?: number) => {
    if (trade.status === 'closed' && trade.exit_price) {
      const pnl = trade.side === 'LONG' 
        ? trade.exit_price - trade.entry_price
        : trade.entry_price - trade.exit_price;
      const returnPct = (pnl / trade.entry_price) * 100;
      return { realized_pnl: pnl, return_pct: returnPct };
    } else if (trade.status === 'open' && currentPrice) {
      const pnl = trade.side === 'LONG'
        ? currentPrice - trade.entry_price
        : trade.entry_price - currentPrice;
      const returnPct = (pnl / trade.entry_price) * 100;
      return { unrealized_pnl: pnl, return_pct: returnPct };
    }
    return {};
  };

  const fetchTrades = async () => {
    setIsLoading(true);
    try {
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false });

      if (tradesError) throw tradesError;

      // Get unique symbols for market data
      const symbols = [...new Set(tradesData?.map(t => t.symbol) || [])];
      
      // Fetch latest market data for all symbols
      const marketDataMap: Record<string, MarketData> = {};
      
      if (symbols.length > 0) {
        for (const symbol of symbols) {
          const { data: marketRow } = await supabase
            .from('enhanced_market_data')
            .select('symbol, price, timestamp, data_date')
            .eq('symbol', symbol)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();
          
          if (marketRow) {
            marketDataMap[symbol] = marketRow;
          }
        }
      }

      setMarketData(marketDataMap);

      // Calculate PnL for each trade
      const tradesWithPnL = (tradesData || []).map(trade => {
        const currentPrice = marketDataMap[trade.symbol]?.price;
        const pnlData = calculatePnL(trade, currentPrice);
        
        return {
          ...trade,
          current_price: currentPrice,
          mark_timestamp: marketDataMap[trade.symbol]?.timestamp,
          ...pnlData
        };
      });

      setTrades(tradesWithPnL);
    } catch (error) {
      console.error('Error fetching trades:', error);
      toast({
        title: "Error",
        description: "Failed to fetch trades",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const closePaperTrade = async (tradeId: number, symbol: string) => {
    try {
      const marketPrice = marketData[symbol];
      if (!marketPrice) {
        toast({
          title: "Error",
          description: `No recent market tick for ${symbol} — please try again shortly.`,
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('trades')
        .update({
          status: 'closed',
          exit_date: new Date().toISOString(),
          exit_price: marketPrice.price,
          exit_price_source: 'enhanced_market_data'
        })
        .eq('trade_id', tradeId);

      if (error) throw error;

      toast({
        title: "Trade Closed",
        description: `Paper trade for ${symbol} closed successfully`,
      });

      fetchTrades(); // Refresh data
    } catch (error) {
      console.error('Error closing trade:', error);
      toast({
        title: "Error",
        description: "Failed to close trade",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  // Filter trades based on current filter
  const filteredTrades = trades.filter(trade => {
    if (filter === 'all') return true;
    if (filter === 'paper') return trade.mode === 'paper';
    if (filter === 'live') return trade.mode === 'live';
    return true;
  });

  const openTrades = filteredTrades.filter(t => t.status === 'open');
  const closedTrades = filteredTrades.filter(t => t.status === 'closed');

  // Calculate summaries
  const summary = {
    openPositions: {
      count: openTrades.length,
      grossExposure: openTrades.reduce((sum, t) => sum + t.entry_price, 0),
      unrealizedPnL: openTrades.reduce((sum, t) => sum + (t.unrealized_pnl || 0), 0),
      avgReturn: openTrades.length > 0 
        ? openTrades.reduce((sum, t) => sum + (t.return_pct || 0), 0) / openTrades.length 
        : 0
    },
    closedTrades: {
      count: closedTrades.length,
      hitRate: closedTrades.length > 0
        ? (closedTrades.filter(t => (t.return_pct || 0) > 0).length / closedTrades.length) * 100
        : 0,
      avgReturn: closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => sum + (t.return_pct || 0), 0) / closedTrades.length
        : 0,
      totalPnL: closedTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0)
    }
  };

  const TradeCard = ({ trade }: { trade: TradeWithPnL }) => {
    const isOpen = trade.status === 'open';
    const isPaper = trade.mode === 'paper';
    const pnl = isOpen ? trade.unrealized_pnl : trade.realized_pnl;
    const isProfit = (pnl || 0) > 0;

    return (
      <Card className="p-4 hover:shadow-lg transition-shadow">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <a 
                href={`https://finance.yahoo.com/quote/${trade.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary flex items-center gap-1"
              >
                {trade.symbol}
                <ExternalLink className="w-3 h-3" />
              </a>
            </h3>
            <Badge variant="outline">{trade.side}</Badge>
            <Badge variant="outline">{trade.horizon}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant={isPaper ? "secondary" : "default"} className="flex items-center gap-1">
                    {isPaper ? "PAPER" : "REAL"}
                    <Info className="w-3 h-3" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isPaper ? "Paper trading - no real money involved" : "Real trading with actual positions"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isOpen && isPaper && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => closePaperTrade(trade.trade_id, trade.symbol)}
              >
                <X className="w-4 h-4 mr-1" />
                Close
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <div className="text-sm text-muted-foreground">Entry</div>
            <div className="font-semibold">
              ${trade.entry_price.toFixed(2)}
              <div className="text-xs text-muted-foreground">
                {new Date(trade.entry_date).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">
              {isOpen ? "Current" : "Exit"}
            </div>
            <div className="font-semibold">
              {isOpen 
                ? trade.current_price 
                  ? `$${trade.current_price.toFixed(2)}`
                  : "Loading..."
                : `$${trade.exit_price?.toFixed(2) || 'N/A'}`
              }
              {!isOpen && trade.exit_date && (
                <div className="text-xs text-muted-foreground">
                  {new Date(trade.exit_date).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {pnl !== undefined && (
          <div className="flex justify-between items-center p-2 rounded bg-muted/50">
            <span className="text-sm font-medium">
              {isOpen ? "Unrealized" : "Realized"} PnL
            </span>
            <div className="text-right">
              <div className={`font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                ${pnl.toFixed(2)}
              </div>
              <div className={`text-sm ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {trade.return_pct?.toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
          <div>Source: {trade.source} • Qty: 1 (paper default)</div>
          <div>Trade Date: {new Date(trade.trade_date).toLocaleDateString()}</div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold mb-2">Portfolio & Trades</h2>
          <p className="text-muted-foreground">
            Track your paper and real trading positions with live PnL
          </p>
        </div>
        <Button onClick={fetchTrades} variant="outline">
          Refresh Data
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All Trades</TabsTrigger>
          <TabsTrigger value="paper">Paper Only</TabsTrigger>
          <TabsTrigger value="live">Real Only</TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.openPositions.count}</div>
                <p className="text-xs text-muted-foreground">
                  Exposure: ${summary.openPositions.grossExposure.toFixed(0)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Unrealized PnL</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${summary.openPositions.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${summary.openPositions.unrealizedPnL.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg: {summary.openPositions.avgReturn.toFixed(2)}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Closed (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.closedTrades.count}</div>
                <p className="text-xs text-muted-foreground">
                  Hit Rate: {summary.closedTrades.hitRate.toFixed(0)}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Realized</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${summary.closedTrades.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${summary.closedTrades.totalPnL.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg: {summary.closedTrades.avgReturn.toFixed(2)}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Open Positions */}
          {openTrades.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Open Positions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {openTrades.map(trade => (
                  <TradeCard key={trade.trade_id} trade={trade} />
                ))}
              </div>
            </div>
          )}

          {/* Closed Trades */}
          {closedTrades.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Closed Trades (Last 30 Days)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {closedTrades.slice(0, 12).map(trade => (
                  <TradeCard key={trade.trade_id} trade={trade} />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredTrades.length === 0 && !isLoading && (
            <div className="text-center py-8">
              <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No trades found</h3>
              <p className="text-muted-foreground mb-4">
                Create a paper trade from the Signals section to get started.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TradesOverview;