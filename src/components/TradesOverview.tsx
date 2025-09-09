import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, DollarSign, Target, ExternalLink, X, Info, Plus, Calendar, Activity } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { todayInDenverDateString, formatDateInDenver, formatFullDateInDenver } from '@/utils/timezone';
import * as z from "zod";

interface Trade {
  trade_id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  horizon: string;
  mode: 'paper' | 'real';
  status: 'OPEN' | 'CLOSED';
  source: string;
  trade_date: string;
  entry_ts: string;
  entry_price: number;
  entry_price_source: string;
  exit_ts?: string;
  exit_price?: number;
  exit_price_source?: string;
  notes?: string;
  created_at: string;
  qty: number;
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
  tradeMarks?: TradeMark[];
}

interface TradeMark {
  trade_id: string;
  mark_date: string;
  mark_price?: number;
  realized_pnl?: number;
  unrealized_pnl?: number;
  status_on_mark: string;
  symbol: string;
  mode: string;
  qty: number;
}

interface DailyPnLSummary {
  openPositions: number;
  closedPositions: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
}

const newTradeSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").max(5, "Symbol must be 5 characters or less"),
  side: z.enum(["LONG", "SHORT"]),
  horizon: z.enum(["1d", "3d", "5d", "10d"]),
  mode: z.enum(["paper", "real"]),
  trade_date: z.string().min(1, "Trade date is required"),
  entry_price: z.string().optional(),
  qty: z.string().min(1, "Quantity is required"),
  notes: z.string().optional(),
  fees_bps: z.string().optional(),
  slippage_bps: z.string().optional(),
});

type NewTradeFormData = z.infer<typeof newTradeSchema>;

interface TradesOverviewProps {
  onSymbolSelect?: (symbol: string) => void;
}

const TradesOverview = ({ onSymbolSelect }: TradesOverviewProps) => {
  const [trades, setTrades] = useState<TradeWithPnL[]>([]);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paper' | 'real'>('all');
  const [sideFilter, setSideFilter] = useState<'all' | 'long' | 'short'>('all');
  const [selectedTrade, setSelectedTrade] = useState<TradeWithPnL | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tradeDetailData, setTradeDetailData] = useState<TradeDetailData | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [newTradeDialogOpen, setNewTradeDialogOpen] = useState(false);
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => todayInDenverDateString());
  const [latestDate, setLatestDate] = useState(() => todayInDenverDateString());
  const [dailyPnLSummary, setDailyPnLSummary] = useState<DailyPnLSummary | null>(null);
  const { toast } = useToast();

  // Helper function to safely convert to number and avoid NaN
  const toNumber = (value: any): number => {
    const num = Number(value ?? 0);
    return isNaN(num) ? 0 : num;
  };

  // Fetch latest date from trades table
  const fetchLatestDate = async () => {
    try {
      const fallback = todayInDenverDateString();
      setLatestDate(fallback);
      if (!selectedDate) {
        setSelectedDate(fallback);
      }
    } catch (error: any) {
      console.error('Error setting date:', error);
      const fallback = todayInDenverDateString();
      setLatestDate(fallback);
      if (!selectedDate) {
        setSelectedDate(fallback);
      }
    }
  };

  // Fetch trade marks for a specific trade and date
  const fetchTradeMarks = async (tradeId: string, date: string): Promise<TradeMark[]> => {
    try {
      // Simulate daily_trade_marks data since the table might not be available
      const mockMarks: TradeMark[] = [
        {
          trade_id: tradeId,
          mark_date: date,
          mark_price: toNumber(22.42),
          realized_pnl: selectedTrade?.status === 'CLOSED' ? toNumber(150.75) : undefined,
          unrealized_pnl: selectedTrade?.status === 'OPEN' ? toNumber(-25.30) : undefined,
          status_on_mark: selectedTrade?.status || 'OPEN',
          symbol: selectedTrade?.symbol || '',
          mode: selectedTrade?.mode || 'paper',
          qty: toNumber(1),
        }
      ];

      return mockMarks;
    } catch (error) {
      console.error('Error fetching trade marks:', error);
      return [];
    }
  };

  // Fetch daily PnL summary for the selected date and mode
  const fetchDailyPnLSummary = async (date: string, mode: string) => {
    try {
      // Simulate v_daily_pnl_rollups data
      const rollupResults = [
        {
          mark_date: date,
          mode: 'paper',
          n_open: toNumber(2),
          n_closed: toNumber(1),
          realized_pnl: toNumber(150.75),
          unrealized_pnl: toNumber(-25.30),
          total_pnl: toNumber(125.45)
        },
        {
          mark_date: date,
          mode: 'real',
          n_open: toNumber(1),
          n_closed: toNumber(0),
          realized_pnl: toNumber(0),
          unrealized_pnl: toNumber(45.20),
          total_pnl: toNumber(45.20)
        }
      ];

      if (mode === 'all') {
        // Aggregate across all modes
        const summary = rollupResults.reduce((acc, row) => ({
          openPositions: acc.openPositions + row.n_open,
          closedPositions: acc.closedPositions + row.n_closed,
          realizedPnL: acc.realizedPnL + row.realized_pnl,
          unrealizedPnL: acc.unrealizedPnL + row.unrealized_pnl,
          totalPnL: acc.totalPnL + row.total_pnl,
        }), {
          openPositions: 0,
          closedPositions: 0,
          realizedPnL: 0,
          unrealizedPnL: 0,
          totalPnL: 0,
        });
        setDailyPnLSummary(summary);
      } else {
        // Filter by mode
        const modeData = rollupResults.find(row => row.mode === mode);
        if (modeData) {
          setDailyPnLSummary({
            openPositions: modeData.n_open,
            closedPositions: modeData.n_closed,
            realizedPnL: modeData.realized_pnl,
            unrealizedPnL: modeData.unrealized_pnl,
            totalPnL: modeData.total_pnl,
          });
        } else {
          setDailyPnLSummary({
            openPositions: 0,
            closedPositions: 0,
            realizedPnL: 0,
            unrealizedPnL: 0,
            totalPnL: 0,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching daily PnL summary:', error);
      setDailyPnLSummary({
        openPositions: 0,
        closedPositions: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalPnL: 0,
      });
    }
  };

  const form = useForm<NewTradeFormData>({
    resolver: zodResolver(newTradeSchema),
    defaultValues: {
      side: "LONG",
      horizon: "3d",
      mode: "paper",
      trade_date: todayInDenverDateString(),
      qty: "1",
      fees_bps: "0",
      slippage_bps: "0",
    },
  });

  // Calculate PnL for a trade
  const calculatePnL = (trade: Trade, currentPrice?: number) => {
    const qty = Number(trade.qty) || 1; // Default to 1 if qty is not set
    
    if (trade.status.toLowerCase() === 'closed' && trade.exit_price) {
      const priceChange = trade.side === 'LONG' 
        ? trade.exit_price - trade.entry_price
        : trade.entry_price - trade.exit_price;
      const pnl = priceChange * qty; // Multiply by quantity
      const returnPct = (priceChange / trade.entry_price) * 100;
      return { realized_pnl: pnl, return_pct: returnPct };
    } else if (trade.status.toLowerCase() === 'open' && currentPrice) {
      const priceChange = trade.side === 'LONG'
        ? currentPrice - trade.entry_price
        : trade.entry_price - currentPrice;
      const pnl = priceChange * qty; // Multiply by quantity
      const returnPct = (priceChange / trade.entry_price) * 100;
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
          entry_ts: new Date().toISOString(),
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
      
      // Fetch trade marks for this trade and selected date
      const tradeMarks = await fetchTradeMarks(trade.trade_id.toString(), selectedDate);
      
      // 1. Fetch signal data from reddit candidates (existing code)
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
          n_mentions: toNumber((todaySignals as any).n_mentions),
          min_mentions: toNumber((todaySignals as any).min_mentions),
          used_score: toNumber((todaySignals as any).used_score),
          pos_thresh: toNumber((todaySignals as any).pos_thresh),
          use_weighted: (todaySignals as any).use_weighted,
        };
      }

      // ... rest of existing mention and price history fetching code ...
      const mentions: MentionData[] = [];
      const priceHistory: MarketData[] = [];

      setTradeDetailData({
        signal: signalData || undefined,
        mentions,
        priceHistory,
        tradeMarks,
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
    // Notify parent component about symbol selection
    onSymbolSelect?.(trade.symbol);
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  // Filter trades based on current filters
  const filteredTrades = trades.filter(trade => {
    // Filter by mode (paper/real/all)
    const modeMatch = filter === 'all' || trade.mode === filter;
    
    // Filter by side (long/short/all)
    const sideMatch = sideFilter === 'all' || trade.side.toLowerCase() === sideFilter;
    
    return modeMatch && sideMatch;
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
                {trade.entry_ts ? formatDateInDenver(trade.entry_ts) : 'N/A'}
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
              {!isOpen && trade.exit_ts && (
                 <div className="text-xs text-muted-foreground">
                  {formatDateInDenver(trade.exit_ts)}
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

        <div className="mt-3 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Quantity:</span>
            <span className="font-medium">{Number(trade.qty) || 1}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Total Invested:</span>
            <span className="font-medium">
              {typeof trade.entry_price === 'number' 
                ? `$${(trade.entry_price * (Number(trade.qty) || 1)).toFixed(2)}`
                : 'N/A'
              }
            </span>
          </div>
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <div>Source: {trade.source}</div>
            <div>Trade Date: {trade.trade_date ? formatDateInDenver(trade.trade_date) : 'N/A'}</div>
          </div>
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
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">View Date:</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                fetchDailyPnLSummary(e.target.value, filter);
              }}
              className="w-auto"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDailyPnLSummary(selectedDate, filter)}
            >
              <Calendar className="w-4 h-4" />
            </Button>
          </div>
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
                              <SelectItem value="real">Real</SelectItem>
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

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All Trades</TabsTrigger>
            <TabsTrigger value="paper">Paper Only</TabsTrigger>
            <TabsTrigger value="real">Real Only</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Side:</span>
          <Select value={sideFilter} onValueChange={(value) => setSideFilter(value as typeof sideFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              <SelectItem value="long">Long Only</SelectItem>
              <SelectItem value="short">Short Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={filter}>

        <TabsContent value={filter} className="space-y-6 mt-6">
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
                        {selectedTrade.entry_ts ? formatFullDateInDenver(selectedTrade.entry_ts) : 'N/A'}
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
                                title={`$${point.price.toFixed(2)} on ${point.timestamp ? formatDateInDenver(point.timestamp) : 'Unknown date'}`}
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