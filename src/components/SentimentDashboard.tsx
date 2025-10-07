import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge} from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Target, BarChart3, AlertTriangle, Plus, ExternalLink, DollarSign, Zap, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from 'react-router-dom';
import DailyPnLWidget from './DailyPnLWidget';
import { todayInDenverDateString, formatDateInDenver } from '@/utils/timezone';

interface RedditDailySignal {
  trade_date: string;
  symbol: string;
  n_mentions: number;
  avg_score: number;
  avg_confidence?: number;
  used_score: number;
}

interface RedditCandidate {
  trade_date: string;
  symbol: string;
  horizon: string;
  min_mentions?: number | null;
  pos_thresh?: number | null;
  used_score: number | null;
  n_mentions: number;
  triggered: boolean;
  use_weighted?: boolean;
  side?: string;
  avg_ret?: number;
  win_rate?: number;
  trades?: number;
  sharpe?: number;
  start_date?: string;
  end_date?: string;
  model_version?: string;
  min_conf?: number | null;
}

interface ExistingTrade {
  trade_id: number;
  symbol: string;
  side: string;
  horizon: string;
  mode: string;
  status: string;
  trade_date: string;
  entry_price?: number;
  exit_price?: number;
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

const RedditSignalCard = ({ signal }: { signal: RedditDailySignal }) => {
  const getSentimentColor = (score: number) => {
    if (score > 0.1) return 'text-green-600 dark:text-green-400';
    if (score < -0.1) return 'text-red-600 dark:text-red-400';
    return 'text-yellow-600 dark:text-yellow-400';
  };

  const getSentimentLabel = (score: number) => {
    if (score > 0.1) return 'Bullish';
    if (score < -0.1) return 'Bearish';
    return 'Neutral';
  };

  return (
    <Card className="p-4 hover:shadow-lg transition-shadow border bg-card">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">{signal.symbol}</h3>
          <p className="text-sm text-muted-foreground">Reddit Daily Signal</p>
        </div>
        <Badge className={`${getSentimentColor(signal.avg_score)} bg-transparent border`}>
          {getSentimentLabel(signal.avg_score)}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-xl font-bold text-foreground">{signal.n_mentions}</div>
          <div className="text-xs text-muted-foreground">Mentions</div>
        </div>
        <div>
          <div className={`text-xl font-bold ${getSentimentColor(signal.avg_score)}`}>
            {signal.avg_score.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">Avg Score</div>
        </div>
        <div>
          <div className={`text-xl font-bold ${getSentimentColor(signal.used_score)}`}>
            {signal.used_score.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">Used Score</div>
        </div>
      </div>
    </Card>
  );
};

const CandidateCard = ({ candidate, existingTrade, onNewTrade }: { 
  candidate: RedditCandidate, 
  existingTrade?: ExistingTrade | null,
  onNewTrade?: (candidate: RedditCandidate) => void 
}) => {
  const side = candidate.side || 'LONG';
  
  // Get sentiment colors and labels for monitoring candidates
  const getSentimentColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score > 0.05) return "text-green-600 dark:text-green-400";
    if (score < -0.05) return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const getSentimentLabel = (score: number | null, triggered: boolean) => {
    if (triggered) return "🎯 TRIGGERED";
    if (score === null) return "NO SIGNAL";
    if (score > 0.05) return "🟢 BULLISH";
    if (score < -0.05) return "🔴 BEARISH";
    return "⚪ NEUTRAL";
  };

  const getSentimentBadgeVariant = (score: number | null, triggered: boolean) => {
    if (triggered) return "default";
    if (score === null) return "outline";
    if (score > 0.05) return "secondary"; // Use secondary for bullish monitoring
    if (score < -0.05) return "destructive"; // Use destructive for bearish monitoring
    return "outline"; // Use outline for neutral monitoring
  };
  
  return (
    <Card className={`p-4 hover:shadow-lg transition-shadow border bg-card ${candidate.triggered ? 'border-success/60 ring-1 ring-success/30 shadow-success' : ''}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            {candidate.symbol} • {candidate.horizon} • <Badge variant="outline" className="text-foreground">{side}</Badge>
          </h3>
        </div>
        <div className="flex gap-2">
          <Badge 
            variant={getSentimentBadgeVariant(candidate.used_score, candidate.triggered)} 
            className={candidate.triggered ? "text-foreground" : getSentimentColor(candidate.used_score)}
          >
            {getSentimentLabel(candidate.used_score, candidate.triggered)}
          </Badge>
          {candidate.triggered && <Target className="w-4 h-4 text-green-600 dark:text-green-400" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-sm text-muted-foreground">Mentions</div>
          <div className="text-base font-semibold text-foreground">{candidate.n_mentions} / {candidate.min_mentions ?? '—'}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Score</div>
          <div className={`text-base font-semibold ${getSentimentColor(candidate.used_score)}`}>
            {candidate.used_score != null ? candidate.used_score.toFixed(2) : 'N/A'} / {candidate.pos_thresh != null ? candidate.pos_thresh.toFixed(2) : '—'}
          </div>
        </div>
      </div>

      {/* Trading Action for Triggered Candidates */}
      {candidate.triggered && (
        <div className="mt-3 pt-3 border-t border-border">
          {existingTrade ? (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                {(existingTrade.status === 'open' || existingTrade.status === 'OPEN') ? (
                  <>
                    <div className="font-medium text-green-600 dark:text-green-400">✓ Trade Active</div>
                    <div className="text-muted-foreground">
                      {existingTrade.mode} • {existingTrade.entry_price ? `$${existingTrade.entry_price.toFixed(2)}` : 'Pending'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-medium text-gray-600 dark:text-gray-400">✓ Trade Closed</div>
                    <div className="text-muted-foreground">
                      {existingTrade.mode} • Entry: ${existingTrade.entry_price?.toFixed(2) || 'N/A'} • Exit: ${existingTrade.exit_price?.toFixed(2) || 'N/A'}
                    </div>
                  </>
                )}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/trades">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  View
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Ready to trade
              </div>
              <Button 
                onClick={() => onNewTrade?.(candidate)}
                size="sm"
                variant="default"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Trade
              </Button>
            </div>
          )}
          
          {/* Backtest Statistics for Triggered Candidates */}
          <BacktestStats candidate={candidate} />
        </div>
      )}

      {/* Historical Performance for Non-Triggered Candidates */}
      {!candidate.triggered && (candidate.trades !== undefined || candidate.avg_ret !== undefined || candidate.win_rate !== undefined) && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-sm text-muted-foreground mb-2">Historical Performance</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {candidate.avg_ret != null && (
              <div>
                <div className="font-medium text-foreground">{(candidate.avg_ret * 100).toFixed(1)}%</div>
                <div className="text-muted-foreground">Avg Return</div>
              </div>
            )}
            {candidate.win_rate != null && (
              <div>
                <div className="font-medium text-foreground">{(candidate.win_rate * 100).toFixed(0)}%</div>
                <div className="text-muted-foreground">Win Rate</div>
              </div>
            )}
            {candidate.trades !== undefined && (
              <div>
                <div className="font-medium text-foreground">{candidate.trades}</div>
                <div className="text-muted-foreground">Trades</div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

// BacktestStats component for triggered candidates
const BacktestStats = ({ candidate }: { candidate: RedditCandidate }) => {
  // Don't show stats if no backtest data
  if (!candidate.trades && !candidate.avg_ret && !candidate.win_rate && !candidate.sharpe) {
    return (
      <div className="mt-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground text-center">
        No backtest history
      </div>
    );
  }

  // Calculate qualitative tag
  const getQualityTag = () => {
    const sharpe = candidate.sharpe || 0;
    const trades = candidate.trades || 0;
    const avgRet = candidate.avg_ret || 0;
    
    if (sharpe >= 2.0 && trades >= 10 && avgRet > 0) return { label: "Strong", color: "text-green-600 dark:text-green-400", bgColor: "bg-green-600/20" };
    if (sharpe >= 1.0 && trades >= 5 && avgRet > 0) return { label: "Moderate", color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-600/20" };
    return { label: "Weak", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-600/20" };
  };

  const qualityTag = getQualityTag();

  // Helper to get color for numeric values
  const getValueColor = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "text-muted-foreground";
    if (value > 0) return "text-green-600 dark:text-green-400";
    if (value < 0) return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  };

  return (
    <div className="mt-2 p-2 bg-muted/30 rounded text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="text-muted-foreground">Backtest:</span>
        <span className={`font-medium px-1.5 py-0.5 rounded text-xs ${qualityTag.color} ${qualityTag.bgColor}`}>
          [{qualityTag.label}]
        </span>
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span>
            Trades={candidate.trades || 'N/A'}, 
            AvgRet=<span className={getValueColor(candidate.avg_ret)}>
              {candidate.avg_ret ? `${(candidate.avg_ret * 100).toFixed(1)}%` : 'N/A'}
            </span>, 
            Win={candidate.win_rate ? `${Math.round(candidate.win_rate * 100)}%` : 'N/A'}, 
            Sharpe=<span className={getValueColor(candidate.sharpe)}>
              {candidate.sharpe ? candidate.sharpe.toFixed(1) : 'N/A'}
            </span>
          </span>
        </div>
        {(candidate.start_date || candidate.end_date) && (
          <div className="text-muted-foreground">
            {formatDate(candidate.start_date)} - {formatDate(candidate.end_date)}
          </div>
        )}
      </div>
    </div>
  );
};

const SentimentDashboard = () => {
  const [redditSignals, setRedditSignals] = useState<RedditDailySignal[]>([]);
  const [candidates, setCandidates] = useState<RedditCandidate[]>([]);
  const [existingTrades, setExistingTrades] = useState<Record<string, ExistingTrade>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isToday, setIsToday] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [asOfDate, setAsOfDate] = useState<Date | null>(null);
  const [newTradeDialogOpen, setNewTradeDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<RedditCandidate | null>(null);
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);
  
  const { toast } = useToast();

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

  const fetchRedditData = async () => {
    setIsLoading(true);
    console.log('🎯 SentimentDashboard: Starting data fetch...');
    
    try {
      let usedFallback = false;
      let dataDate: Date | null = null;
      const today = todayInDenverDateString(); // YYYY-MM-DD format

      console.log('📊 Fetching reddit daily signals...');
      // 1. Try today's signals first, fallback if empty
      let { data: signalsData, error: signalsError } = await supabase
        .from('v_reddit_daily_signals')
        .select('*')
        .order('trade_date', { ascending: false })
        .limit(20);

      if (signalsError) {
        console.error('❌ Reddit daily signals error:', signalsError);
        throw signalsError;
      }

      console.log('📊 Reddit signals received:', signalsData?.length || 0, 'items');

      if (!signalsData || signalsData.length === 0) {
        console.log('🔄 Trying fallback reddit signals...');
        const { data: fallbackSignals, error: fallbackError } = await supabase
          .from('v_reddit_daily_signals_last_trading_day')
          .select('*')
          .limit(20);

        if (fallbackError) {
          console.error('❌ Fallback reddit signals error:', fallbackError);
        } else if (fallbackSignals && fallbackSignals.length > 0) {
          signalsData = fallbackSignals as any;
          usedFallback = true;
          console.log('✅ Fallback reddit signals worked:', fallbackSignals.length, 'items');
        }
      }

      // Extract date string from signals data (avoid timezone issues)
      let dataDateString: string | null = null;
      if (signalsData && signalsData.length > 0) {
        dataDateString = signalsData[0].trade_date;
      }

      setRedditSignals(signalsData || []);

      console.log('👀 Fetching reddit candidates...');
      // 2. Try today's candidates first, fallback if empty
      let { data: candidatesData, error: candidatesError }: { data: any[] | null, error: any } = await supabase
        .from('v_reddit_candidates_today')
        .select('*')
        .order('used_score', { ascending: false, nullsFirst: false })
        .order('symbol', { ascending: true })
        .order('horizon', { ascending: true });

      if (candidatesError) {
        console.error('❌ Reddit candidates error:', candidatesError);
        // Continue with empty data instead of throwing
        candidatesData = [];
      } else {
        console.log('👀 Reddit candidates received:', candidatesData?.length || 0, 'items');
      }

      if (!candidatesData || candidatesData.length === 0) {
        console.log('🔄 Trying fallback reddit candidates...');
        const { data: fallbackCandidates, error: fallbackCandidatesError } = await supabase
          .from('v_reddit_candidates_last_trading_day')
          .select('*')
          .order('used_score', { ascending: false, nullsFirst: false })
          .order('symbol', { ascending: true })
          .order('horizon', { ascending: true });

        if (fallbackCandidatesError) {
          console.error('❌ Fallback reddit candidates error:', fallbackCandidatesError);
        } else if (fallbackCandidates && fallbackCandidates.length > 0) {
          candidatesData = fallbackCandidates as unknown as RedditCandidate[];
          usedFallback = true;
          console.log('✅ Fallback reddit candidates worked:', fallbackCandidates.length, 'items');
          // If we didn't get a date from signals, get it from candidates
          if (!dataDateString && fallbackCandidates.length > 0) {
            dataDateString = (fallbackCandidates[0] as any).trade_date;
          }
        }
      } else if (candidatesData.length > 0) {
        // Check if candidates are for today
        const candidateDate = (candidatesData[0] as any).trade_date;
        
        // If candidate date matches today, we're not using fallback
        if (candidateDate === today) {
          usedFallback = false;
        } else {
          // Data exists but it's not for today, so it's essentially fallback
          usedFallback = true;
        }
        
        // If we didn't get date from signals, use candidate date
        if (!dataDateString) {
          dataDateString = candidateDate;
        }
      }

      // Convert to display format (MM/DD/YYYY)
      dataDate = dataDateString ? new Date(dataDateString + 'T12:00:00') : null;

      setCandidates((candidatesData || []) as unknown as RedditCandidate[]);

      console.log('📈 Processing triggered candidates for backtest stats...');
      // 3. For triggered candidates only, fetch backtest statistics
        if (candidatesData && candidatesData.length > 0) {
        const triggeredCandidates = (candidatesData as unknown as RedditCandidate[]).filter(c => c.triggered);
        console.log('🎯 Found', triggeredCandidates.length, 'triggered candidates');
        
        
        if (triggeredCandidates.length > 0) {
          console.log('📊 Fetching backtest stats for triggered candidates...');
          // Fetch backtest stats from live_sentiment_entry_rules for triggered candidates
          try {
            const backtestPromises = triggeredCandidates.map(async (candidate) => {
              // Try to find matching backtest data without model_version since it's not in the view
              const { data: backtestData, error: backtestError } = await supabase
                .from('live_sentiment_entry_rules')
                .select('trades, avg_ret, win_rate, sharpe, start_date, end_date')
                .eq('symbol', candidate.symbol)
                .eq('horizon', candidate.horizon)
                .eq('pos_thresh', (candidate as any).pos_thresh ?? 0)
                .eq('min_mentions', (candidate as any).min_mentions ?? 0)
                .eq('use_weighted', candidate.use_weighted || false)
                .maybeSingle();
              
              if (backtestError) {
                console.error(`❌ Backtest error for ${candidate.symbol}:`, backtestError);
              }
              
              return {
                candidateKey: `${candidate.symbol}-${candidate.horizon}`,
                backtest: backtestData
              };
            });
            
            const backtestResults = await Promise.all(backtestPromises);
            console.log('📊 Backtest results received for', backtestResults.length, 'candidates');
            
            // Enhance candidates with backtest data
            const enhancedCandidates = (candidatesData as unknown as RedditCandidate[]).map(candidate => {
              if (!candidate.triggered) return candidate;
              
              const backtestResult = backtestResults.find(
                result => result.candidateKey === `${candidate.symbol}-${candidate.horizon}`
              );
              
              if (backtestResult?.backtest) {
                return {
                  ...candidate,
                  trades: backtestResult.backtest.trades,
                  avg_ret: backtestResult.backtest.avg_ret,
                  win_rate: backtestResult.backtest.win_rate,
                  sharpe: backtestResult.backtest.sharpe,
                  start_date: backtestResult.backtest.start_date,
                  end_date: backtestResult.backtest.end_date
                };
              }
              
              return candidate;
            });
            
            setCandidates(enhancedCandidates as RedditCandidate[]);
          } catch (backtestError) {
            console.error('❌ Error fetching backtest stats:', backtestError);
            setCandidates(candidatesData as unknown as RedditCandidate[]);
          }
        }
      }

      console.log('💼 Fetching existing trades...');
      // 4. Fetch existing trades for triggered candidates (both open and closed)
      if (candidatesData && candidatesData.length > 0) {
        const triggeredSymbols = (candidatesData as RedditCandidate[])
          .filter(c => (c as any).triggered)
          .map(c => c.symbol);
        
        if (triggeredSymbols.length > 0) {
          try {
            const { data: tradesData, error: tradesError } = await supabase
              .from('trades' as any)
              .select('trade_id, symbol, side, horizon, mode, status, trade_date, entry_price, exit_price')
              .in('symbol', triggeredSymbols)
              .in('status', ['OPEN', 'open', 'CLOSED', 'closed'])
              .order('created_at', { ascending: false });

            if (tradesError) {
              console.error('❌ Trades fetch error:', tradesError);
            } else if (tradesData) {
              console.log('💼 Trades received:', tradesData.length, 'items');
              const tradesMap: Record<string, ExistingTrade> = {};
              tradesData.forEach((trade: any) => {
                const key = `${trade.symbol}-${trade.horizon}`;
                // Prioritize open trades over closed ones
                if (!tradesMap[key] || ((tradesMap[key].status === 'closed' || tradesMap[key].status === 'CLOSED') && (trade.status === 'open' || trade.status === 'OPEN'))) {
                  tradesMap[key] = trade;
                }
              });
              setExistingTrades(tradesMap);
            }
          } catch (tradesError) {
            console.error('❌ Error fetching trades:', tradesError);
          }
        }
      }

      setIsFallback(usedFallback);
      setIsToday(!usedFallback);
      setAsOfDate(dataDate);
      setLastUpdate(new Date());
      
      console.log('✅ Reddit data fetch completed successfully');
      toast({
        title: "Reddit Data Updated",
        description: `Loaded ${signalsData?.length || 0} signals, ${candidatesData?.length || 0} candidates${usedFallback ? ' (last trading day)' : ''}`,
      });

    } catch (error) {
      console.error('❌ Critical error in fetchRedditData:', error);
      toast({
        title: "Connection error",
        description: "Failed to fetch Reddit sentiment data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      console.log('🎯 SentimentDashboard: Data fetch finished');
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
          entry_price: formData.entry_price ? parseFloat(formData.entry_price) : null,
          qty: parseFloat(formData.qty),
          notes: formData.notes || null,
          fees_total: formData.fees_bps ? parseFloat(formData.fees_bps) : 0,
          source: 'triggered_sentiment',
          status: 'OPEN',
        });

      if (error) throw error;

      toast({
        title: 'Trade Created',
        description: `New ${formData.mode} trade for ${formData.symbol} created successfully`,
      });

      form.reset();
      setNewTradeDialogOpen(false);
      setSelectedCandidate(null);
      fetchRedditData(); // Refresh to update existing trades
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

  const openNewTradeDialog = (candidate: RedditCandidate) => {
    setSelectedCandidate(candidate);
    form.reset({
      symbol: candidate.symbol,
      side: candidate.side as "LONG" | "SHORT",
      horizon: candidate.horizon as "1d" | "3d" | "5d" | "10d",
      mode: "paper",
      trade_date: todayInDenverDateString(),
      qty: "1",
      fees_bps: "0",
      slippage_bps: "0",
    });
    setNewTradeDialogOpen(true);
  };

  useEffect(() => {
    fetchRedditData();
  }, []);

  console.log('SentimentDashboard rendering - signals:', redditSignals.length, 'candidates:', candidates.length, 'loading:', isLoading, 'fallback:', isFallback);

  // Helper function to get banner message
  const getBannerMessage = () => {
    if (isFallback && asOfDate) {
      return `Market closed — Showing last trading day data (as of ${asOfDate.toLocaleDateString()}).`;
    }
    if (isToday && asOfDate) {
      return `Live Reddit signals for ${asOfDate.toLocaleDateString()}.`;
    }
    return null;
  };

  const bannerMessage = getBannerMessage();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center text-foreground">
            🧠 Reddit Sentiment Dashboard
            <Zap className="w-6 h-6 ml-3 text-accent" />
          </h2>
          <p className="text-muted-foreground">
            Live Reddit sentiment signals and trading candidates
          </p>
          {lastUpdate && (
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchRedditData}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Badge className="bg-gradient-primary text-primary-foreground">
            Reddit-only MVP
          </Badge>
        </div>
      </div>

      {/* Global Status Banner */}
      {bannerMessage && (
        <div className={`border rounded-lg p-4 ${isFallback ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isFallback ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
            <p className={`text-sm ${isFallback ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200'}`}>
              {bannerMessage}
            </p>
          </div>
        </div>
      )}

      {/* Daily P&L Widget */}
      <DailyPnLWidget />
      
      
      {/* Today's Triggered Candidates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center justify-between text-foreground">
          <span>🎯 Today's Triggered Candidates</span>
          {isFallback && <span className="text-sm text-muted-foreground font-normal">As of last trading day</span>}
        </h3>
        {candidates.filter(c => c.triggered).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.filter(c => c.triggered).map((candidate, index) => (
              <CandidateCard 
                key={`triggered-${candidate.symbol}-${candidate.horizon}-${index}`} 
                candidate={candidate}
                existingTrade={existingTrades[`${candidate.symbol}-${candidate.horizon}`]}
                onNewTrade={openNewTradeDialog}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No triggered candidates
          </div>
        )}
      </div>

      {/* Monitoring Candidates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center justify-between text-foreground">
          <span>👀 Monitoring</span>
          {isFallback && <span className="text-sm text-muted-foreground font-normal">As of last trading day</span>}
        </h3>
        {candidates.filter(c => !c.triggered).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.filter(c => !c.triggered).slice(0, 6).map((candidate, index) => (
              <CandidateCard 
                key={`monitoring-${candidate.symbol}-${candidate.horizon}-${index}`} 
                candidate={candidate}
                onNewTrade={openNewTradeDialog}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No candidates being monitored
          </div>
        )}
      </div>

      {/* Daily Signals */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center justify-between text-foreground">
          <span>📊 Today's Reddit Signals</span>
          {isFallback && <span className="text-sm text-muted-foreground font-normal">As of last trading day</span>}
        </h3>
        {redditSignals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {redditSignals.map((signal, index) => (
              <RedditSignalCard key={`signal-${signal.symbol}-${index}`} signal={signal} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              {isLoading ? 'Loading Reddit signals...' : 'No Reddit signals available'}
            </p>
          </div>
        )}
      </div>

      {/* New Trade Dialog */}
      <Dialog open={newTradeDialogOpen} onOpenChange={setNewTradeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Create New Trade
              {selectedCandidate && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  for {selectedCandidate.symbol} • {selectedCandidate.horizon}
                </span>
              )}
            </DialogTitle>
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
                          disabled={!!selectedCandidate}
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
                  onClick={() => {
                    setNewTradeDialogOpen(false);
                    setSelectedCandidate(null);
                  }}
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
    </div>
  );
};

export default SentimentDashboard;