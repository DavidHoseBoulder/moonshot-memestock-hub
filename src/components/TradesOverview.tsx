import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, DollarSign, Target, ExternalLink, X, Info, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

interface Trade {
  trade_id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  horizon: string;
  mode: 'paper' | 'live';
  status: 'OPEN' | 'CLOSED';
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

interface SignalData {
  n_mentions?: number;
  min_mentions?: number;
  used_score?: number;
  pos_thresh?: number;
  use_weighted?: boolean;
}

interface MentionData {
  title: string;
  selftext?: string;
  permalink?: string;
  overall_score?: number;
  label?: string;
  confidence?: number;
}

interface TradeDetailData {
  signal?: SignalData;
  mentions: MentionData[];
  priceHistory: MarketData[];
}

const newTradeSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").max(5, "Symbol must be 5 characters or less"),
  side: z.enum(["LONG", "SHORT"]),
  horizon: z.enum(["1d", "3d", "5d", "10d"]),
  mode: z.enum(["paper", "live"]),
  trade_date: z.string().min(1, "Trade date is required"),
  entry_price: z.string().optional(),
  qty: z.string().min(1, "Quantity is required"),
  notes: z.string().optional(),
  fees_bps: z.string().optional(),
  slippage_bps: z.string().optional(),
});

type NewTradeFormData = z.infer<typeof newTradeSchema>;

const TradesOverview = () => {
  const [trades, setTrades] = useState<TradeWithPnL[]>([]);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paper' | 'live'>('all');
  const [selectedTrade, setSelectedTrade] = useState<TradeWithPnL | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tradeDetailData, setTradeDetailData] = useState<TradeDetailData | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [newTradeDialogOpen, setNewTradeDialogOpen] = useState(false);
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);
  const { toast } = useToast();

  const form = useForm<NewTradeFormData>({
    resolver: zodResolver(newTradeSchema),
    defaultValues: {
      side: "LONG",
      horizon: "3d",
      mode: "paper",
      trade_date: new Date().toISOString().split('T')[0],
      qty: "1",
      fees_bps: "0",
      slippage_bps: "0",
    },
  });

  // Calculate PnL for a trade
  const calculatePnL = (trade: Trade, currentPrice?: number) => {
    if (trade.status.toLowerCase() === 'closed' && trade.exit_price) {
      const pnl = trade.side === 'LONG' 
        ? trade.exit_price - trade.entry_price
        : trade.entry_price - trade.exit_price;
      const returnPct = (pnl / trade.entry_price) * 100;
      return { realized_pnl: pnl, return_pct: returnPct };
    } else if (trade.status.toLowerCase() === 'open' && currentPrice) {
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
      // Using raw query to bypass type issues
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (tradesError) throw tradesError;

      // Get unique symbols for market data
      const symbols = [...new Set((tradesData as any[] || []).map((t: any) => t.symbol))];
      
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
            .maybeSingle();
          if (marketRow) {
            marketDataMap[symbol] = {
              ...(marketRow as any),
              price: Number((marketRow as any).price)
            } as any;
          }
        }
      }

      setMarketData(marketDataMap);

      // Calculate PnL for each trade
      const tradesWithPnL = ((tradesData as any[]) || []).map((trade: any) => {
        const entryPriceNum = trade.entry_price != null ? Number(trade.entry_price) : null;
        const exitPriceNum = trade.exit_price != null ? Number(trade.exit_price) : null;
        const currentPriceNum = marketDataMap[trade.symbol]?.price as number | undefined;

        let pnlData: any = {};
        if (typeof entryPriceNum === 'number' && !isNaN(entryPriceNum)) {
          pnlData = calculatePnL(
            { ...(trade as any), entry_price: entryPriceNum, exit_price: (exitPriceNum ?? undefined) } as any,
            typeof currentPriceNum === 'number' ? currentPriceNum : undefined
          );
        }
        
        return {
          ...trade,
          entry_price: entryPriceNum,
          exit_price: exitPriceNum,
          current_price: typeof currentPriceNum === 'number' ? currentPriceNum : undefined,
          mark_timestamp: marketDataMap[trade.symbol]?.timestamp,
          ...pnlData
        } as any;
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
      const { data, error } = await supabase.functions.invoke('close-paper-trade', {
        body: { trade_id: tradeId },
      });

      if (error) throw error as any;

      toast({
        title: 'Trade Closed',
        description: `Paper trade for ${symbol} closed successfully`,
      });

      fetchTrades();
    } catch (error: any) {
      console.error('Error closing trade:', error);
      const message = error?.message || error?.details || 'Failed to close trade';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const submitNewTrade = async (formData: NewTradeFormData) => {
    setIsSubmittingTrade(true);
    try {
      const { error } = await supabase
        .from('trades' as any)
        .insert({
          symbol: formData.symbol.toUpperCase(),
          side: formData.side,
          horizon: formData.horizon,
          mode: formData.mode,
          trade_date: formData.trade_date,
          entry_date: new Date().toISOString(),
          entry_price: formData.entry_price ? parseFloat(formData.entry_price) : null,
          qty: parseFloat(formData.qty),
          notes: formData.notes || null,
          fees_bps: formData.fees_bps ? parseFloat(formData.fees_bps) : 0,
          slippage_bps: formData.slippage_bps ? parseFloat(formData.slippage_bps) : 0,
          source: 'manual',
          status: 'OPEN',
        });

      if (error) throw error;

      toast({
        title: 'Trade Created',
        description: `New ${formData.mode} trade for ${formData.symbol} created successfully`,
      });

      form.reset();
      setNewTradeDialogOpen(false);
      fetchTrades();
    } catch (error: any) {
      console.error('Error creating trade:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create trade',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingTrade(false);
    }
  };

  const fetchTradeDetails = async (trade: TradeWithPnL) => {
    setIsLoadingDetails(true);
    try {
      const tradeDate = trade.trade_date;
      
      // 1. Fetch signal data from reddit candidates (today or last trading day)
      let signalData: SignalData | null = null;
      
      // Try today's signals first
      const { data: todaySignals } = await supabase
        .from('v_reddit_candidates_today')
        .select('*')
        .eq('symbol', trade.symbol)
        .eq('horizon', trade.horizon)
        .maybeSingle();
      
      if (todaySignals) {
        signalData = {
          n_mentions: (todaySignals as any).n_mentions,
          min_mentions: (todaySignals as any).min_mentions,
          used_score: (todaySignals as any).used_score,
          pos_thresh: (todaySignals as any).pos_thresh,
          use_weighted: (todaySignals as any).use_weighted,
        };
      } else {
        // Fallback to last trading day
        const { data: lastDaySignals } = await supabase
          .from('v_reddit_candidates_last_trading_day')
          .select('*')
          .eq('symbol', trade.symbol)
          .eq('horizon', trade.horizon)
          .maybeSingle();
          
        if (lastDaySignals) {
          signalData = {
            n_mentions: (lastDaySignals as any).n_mentions,
            min_mentions: (lastDaySignals as any).min_mentions,
            used_score: (lastDaySignals as any).used_score,
            pos_thresh: (lastDaySignals as any).pos_thresh,
            use_weighted: (lastDaySignals as any).use_weighted,
          };
        }
      }

      // 2. Fetch top 3 recent mentions for the symbol on trade date
      const { data: mentionsData } = await supabase
        .from('reddit_mentions')
        .select(`
          post_id,
          reddit_sentiment!inner(overall_score, label, confidence),
          v_scoring_posts!inner(title, selftext, permalink)
        `)
        .eq('symbol', trade.symbol)
        .gte('created_utc', tradeDate + ' 00:00:00')
        .lt('created_utc', tradeDate + ' 23:59:59')
        .order('created_utc', { ascending: false })
        .limit(3);

      const mentions: MentionData[] = (mentionsData || []).map((item: any) => ({
        title: item.v_scoring_posts?.title || '',
        selftext: item.v_scoring_posts?.selftext || '',
        permalink: item.v_scoring_posts?.permalink || '',
        overall_score: item.reddit_sentiment?.overall_score,
        label: item.reddit_sentiment?.label,
        confidence: item.reddit_sentiment?.confidence,
      }));

      // 3. Fetch price history since entry (last ~20 marks)
      const entryTimestamp = new Date(trade.entry_date).toISOString();
      const { data: priceData } = await supabase
        .from('enhanced_market_data')
        .select('symbol, price, timestamp, data_date')
        .eq('symbol', trade.symbol)
        .gte('timestamp', entryTimestamp)
        .order('timestamp', { ascending: true })
        .limit(20);

      const priceHistory: MarketData[] = (priceData || []).map((item: any) => ({
        symbol: item.symbol,
        price: Number(item.price),
        timestamp: item.timestamp,
        data_date: item.data_date,
      }));

      setTradeDetailData({
        signal: signalData || undefined,
        mentions,
        priceHistory,
      });
    } catch (error) {
      console.error('Error fetching trade details:', error);
      toast({
        title: "Error",
        description: "Failed to fetch trade details",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleTradeClick = (trade: TradeWithPnL) => {
    setSelectedTrade(trade);
    setDrawerOpen(true);
    fetchTradeDetails(trade);
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

  const openTrades = filteredTrades.filter(t => t.status.toLowerCase() === 'open');
  const closedTrades = filteredTrades.filter(t => t.status.toLowerCase() === 'closed');

  // Calculate summaries
  const summary = {
    openPositions: {
      count: openTrades.length,
      grossExposure: openTrades.reduce((sum, t) => sum + (typeof t.entry_price === 'number' ? t.entry_price : 0), 0),
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
    const isOpen = trade.status.toLowerCase() === 'open';
    const isPaper = trade.mode === 'paper';
    const pnl = isOpen ? trade.unrealized_pnl : trade.realized_pnl;
    const isProfit = (pnl || 0) > 0;

    return (
      <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => handleTradeClick(trade)}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <a 
                href={`https://finance.yahoo.com/quote/${trade.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
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
                onClick={(e) => {
                  e.stopPropagation();
                  closePaperTrade(trade.trade_id, trade.symbol);
                }}
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
              {typeof trade.entry_price === 'number' ? `$${trade.entry_price.toFixed(2)}` : 'N/A'}
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
                ? (typeof trade.current_price === 'number'
                    ? `$${trade.current_price.toFixed(2)}`
                    : "Loading...")
                : (typeof trade.exit_price === 'number' ? `$${trade.exit_price.toFixed(2)}` : 'N/A')
              }
              {!isOpen && trade.exit_date && (
                <div className="text-xs text-muted-foreground">
                  {new Date(trade.exit_date).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {typeof pnl === 'number' && (
          <div className="flex justify-between items-center p-2 rounded bg-muted/50">
            <span className="text-sm font-medium">
              {isOpen ? "Unrealized" : "Realized"} PnL
            </span>
            <div className="text-right">
              <div className={`font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                ${pnl.toFixed(2)}
              </div>
              <div className={`text-sm ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {typeof trade.return_pct === 'number' ? `${trade.return_pct.toFixed(2)}%` : '—'}
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
        <div className="flex gap-2">
          <Dialog open={newTradeDialogOpen} onOpenChange={setNewTradeDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Trade
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New Trade</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(submitNewTrade)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="symbol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Symbol</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g. AAPL" 
                              {...field} 
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="side"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Side</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select side" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="LONG">LONG</SelectItem>
                              <SelectItem value="SHORT">SHORT</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="horizon"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Horizon</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select horizon" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1d">1 Day</SelectItem>
                              <SelectItem value="3d">3 Days</SelectItem>
                              <SelectItem value="5d">5 Days</SelectItem>
                              <SelectItem value="10d">10 Days</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="mode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mode</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select mode" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="paper">Paper</SelectItem>
                              <SelectItem value="live">Live</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="trade_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Trade Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="entry_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Entry Price (optional)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              placeholder="e.g. 150.25" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="qty"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              min="0.01"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fees_bps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fees (bps)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.1" 
                              placeholder="0"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="slippage_bps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Slippage (bps)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.1" 
                              placeholder="0"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Add any notes about this trade..."
                            className="resize-none"
                            rows={3}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-2 pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setNewTradeDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmittingTrade}>
                      {isSubmittingTrade ? 'Creating...' : 'Create Trade'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          <Button onClick={fetchTrades} variant="outline">
            Refresh Data
          </Button>
        </div>
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

      {/* Trade Detail Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between">
              <DrawerTitle className="flex items-center gap-2">
                {selectedTrade && (
                  <>
                    <span className="text-xl font-bold">{selectedTrade.symbol}</span>
                    <span className="text-muted-foreground">•</span>
                    <Badge variant="outline">{selectedTrade.side}</Badge>
                    <Badge variant="outline">{selectedTrade.horizon}</Badge>
                    <Badge variant={selectedTrade.mode === 'paper' ? "secondary" : "default"}>
                      {selectedTrade.mode === 'paper' ? "PAPER" : "REAL"}
                    </Badge>
                  </>
                )}
              </DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="sm">
                  <X className="w-4 h-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          
          <div className="p-6 overflow-y-auto space-y-6">
            {selectedTrade && (
              <>
                {/* Entry Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Entry Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Entry Date</div>
                      <div className="font-medium">
                        {new Date(selectedTrade.entry_date).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Entry Price</div>
                      <div className="font-medium">
                        {typeof selectedTrade.entry_price === 'number' 
                          ? `$${selectedTrade.entry_price.toFixed(2)}` 
                          : 'N/A'
                        }
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Quantity</div>
                      <div className="font-medium">1 (paper default)</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Source</div>
                      <div className="font-medium">{selectedTrade.source}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Status</div>
                      <div className="font-medium">
                        <Badge variant={selectedTrade.status.toLowerCase() === 'open' ? "default" : "secondary"}>
                          {selectedTrade.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                    {selectedTrade.notes && (
                      <div className="col-span-full">
                        <div className="text-sm text-muted-foreground">Notes</div>
                        <div className="font-medium">{selectedTrade.notes}</div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Signal Section */}
                {isLoadingDetails ? (
                  <div className="text-center py-4">Loading signal data...</div>
                ) : tradeDetailData?.signal ? (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Signal Used</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Mentions</div>
                        <div className="font-medium">
                          {tradeDetailData.signal.n_mentions} / {tradeDetailData.signal.min_mentions}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Score</div>
                        <div className="font-medium">
                          {tradeDetailData.signal.used_score?.toFixed(3)} / {tradeDetailData.signal.pos_thresh?.toFixed(3)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Weighted</div>
                        <div className="font-medium">
                          {tradeDetailData.signal.use_weighted ? 'Yes' : 'No'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Side</div>
                        <div className="font-medium">{selectedTrade.side}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Signal Used</h3>
                    <p className="text-muted-foreground">No signal data found for this trade date</p>
                  </div>
                )}

                <Separator />

                {/* Mentions Audit Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Mentions Audit</h3>
                  {isLoadingDetails ? (
                    <div className="text-center py-4">Loading mentions...</div>
                  ) : tradeDetailData?.mentions && tradeDetailData.mentions.length > 0 ? (
                    <div className="space-y-3">
                      {tradeDetailData.mentions.map((mention, index) => (
                        <Card key={index} className="p-3">
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm mb-1 truncate">
                                {mention.title}
                              </div>
                              {mention.selftext && (
                                <div className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                  {mention.selftext.slice(0, 100)}...
                                </div>
                              )}
                              {mention.permalink && (
                                <a 
                                  href={`https://reddit.com${mention.permalink}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  View on Reddit
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            <div className="flex flex-col items-end text-xs">
                              <Badge 
                                variant={
                                  mention.label === 'positive' ? 'default' : 
                                  mention.label === 'negative' ? 'destructive' : 
                                  'secondary'
                                }
                                className="mb-1"
                              >
                                {mention.label || 'neutral'}
                              </Badge>
                              {mention.overall_score !== undefined && (
                                <div className="text-muted-foreground">
                                  Score: {mention.overall_score.toFixed(2)}
                                </div>
                              )}
                              {mention.confidence !== undefined && (
                                <div className="text-muted-foreground">
                                  Confidence: {(mention.confidence * 100).toFixed(0)}%
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No scored mentions found on trade date</p>
                  )}
                </div>

                <Separator />

                {/* Price Since Entry Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Price Since Entry</h3>
                  {isLoadingDetails ? (
                    <div className="text-center py-4">Loading price data...</div>
                  ) : tradeDetailData?.priceHistory && tradeDetailData.priceHistory.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Current Price</div>
                          <div className="font-medium">
                            {typeof selectedTrade.current_price === 'number'
                              ? `$${selectedTrade.current_price.toFixed(2)}`
                              : 'N/A'
                            }
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Unrealized PnL</div>
                          <div className={`font-medium ${
                            (selectedTrade.unrealized_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {selectedTrade.status.toLowerCase() === 'open' && typeof selectedTrade.unrealized_pnl === 'number'
                              ? `$${selectedTrade.unrealized_pnl.toFixed(2)}`
                              : 'N/A'
                            }
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Return %</div>
                          <div className={`font-medium ${
                            (selectedTrade.return_pct || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {typeof selectedTrade.return_pct === 'number'
                              ? `${selectedTrade.return_pct.toFixed(2)}%`
                              : 'N/A'
                            }
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Data Points</div>
                          <div className="font-medium">{tradeDetailData.priceHistory.length}</div>
                        </div>
                      </div>
                      
                      {/* Simple price sparkline representation */}
                      <div className="mt-4">
                        <div className="text-xs text-muted-foreground mb-2">Price History (Entry → Current)</div>
                        <div className="flex items-end gap-1 h-16 bg-muted/20 rounded p-2">
                          {tradeDetailData.priceHistory.map((point, index) => {
                            const minPrice = Math.min(...tradeDetailData.priceHistory.map(p => p.price));
                            const maxPrice = Math.max(...tradeDetailData.priceHistory.map(p => p.price));
                            const range = maxPrice - minPrice;
                            const height = range > 0 ? ((point.price - minPrice) / range) * 48 + 4 : 24;
                            
                            return (
                              <div
                                key={index}
                                className="flex-1 bg-primary rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                                style={{ height: `${height}px` }}
                                title={`$${point.price.toFixed(2)} on ${new Date(point.timestamp).toLocaleDateString()}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No price history available since entry</p>
                  )}
                </div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default TradesOverview;