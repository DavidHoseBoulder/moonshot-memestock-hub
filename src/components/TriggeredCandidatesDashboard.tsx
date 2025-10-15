import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { todayInDenverDateString } from '@/utils/timezone';
import { cn } from '@/lib/utils';
import { TodaySentimentSummary, VelocitySentimentSummary, HistorySentimentSummary } from './SentimentSummaryWidgets';
import { 
  RefreshCw, 
  Target, 
  TrendingUp, 
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BarChart3,
  Activity,
  Filter,
  Settings,
  Plus,
  Trophy,
  Copy,
  AlertCircle,
  Info
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

interface TriggeredCandidate {
  symbol: string;
  horizon: string;
  side: string;
  grade: 'Strong' | 'Moderate' | 'Weak' | null;
  confidence_label: string | null;
  mentions: number;
  min_mentions: number;
  pos_thresh: number;
  sharpe: number | null;
  avg_ret: number | null;
  win_rate: number | null;
  trades: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  is_enabled: boolean;
  priority: number;
}

interface SummaryKPIs {
  totalCandidates: number;
  strongCandidates: number;
  averageSharpe: string;
  averageWinRate: string;
}

const TriggeredCandidatesDashboard = () => {
  const [candidates, setCandidates] = useState<TriggeredCandidate[]>([]);
  const [summaryKPIs, setSummaryKPIs] = useState<SummaryKPIs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeGradeFilter, setActiveGradeFilter] = useState<'all' | 'strong' | 'moderate' | 'weak'>('all');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [tradingDate] = useState<string>(todayInDenverDateString());
  const [showConfig, setShowConfig] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [existingTrades, setExistingTrades] = useState<Set<string>>(new Set());
  
  // Configuration state - loaded from database
  const [recoDate, setRecoDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [minConfidence, setMinConfidence] = useState(60);
  const [minTrades, setMinTrades] = useState(5);
  
  // Dialog state
  const [newTradeDialogOpen, setNewTradeDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<TriggeredCandidate | null>(null);
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);

  // Form schema
  const tradeFormSchema = z.object({
    symbol: z.string().min(1, "Symbol is required"),
    side: z.string().min(1, "Side is required"),
    horizon: z.string().min(1, "Horizon is required"),
    mode: z.string().min(1, "Mode is required"),
    trade_date: z.string().min(1, "Trade date is required"),
    entry_price: z.string().optional(),
    qty: z.string().min(1, "Quantity is required"),
    fees_bps: z.string().optional(),
    slippage_bps: z.string().optional(),
    notes: z.string().optional(),
  });

  const form = useForm<z.infer<typeof tradeFormSchema>>({
    resolver: zodResolver(tradeFormSchema),
    defaultValues: {
      symbol: "",
      side: "LONG", 
      horizon: "5d",
      mode: "paper",
      trade_date: todayInDenverDateString(),
      entry_price: "",
      qty: "",
      fees_bps: "0",
      slippage_bps: "0",
      notes: "",
    },
  });
  
  // Load configuration from reddit_heuristics table
  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        const { data, error } = await supabase
          .from('reddit_heuristics' as any)
          .select('min_confidence_score, min_trades')
          .eq('is_active', true)
          .single();
        
        if (data && !error) {
          const config = data as any;
          setMinConfidence(config.min_confidence_score || 60);
          setMinTrades(config.min_trades || 5);
        }
      } catch (error) {
        console.error('Error loading configuration:', error);
      }
    };
    
    loadConfiguration();
  }, []);

  const { toast } = useToast();
  const navigate = useNavigate();

  // Helper functions
  const formatPercent = (value: number | null) => {
    if (value === null || value === undefined) return '—';
    return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  };

  const formatNumber = (value: number | null, decimals: number = 2) => {
    if (value === null || value === undefined) return '—';
    return value.toFixed(decimals);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatDateRange = (startDate: string | null, endDate: string | null) => {
    if (!startDate && !endDate) return '—';
    if (!startDate) return formatDate(endDate);
    if (!endDate) return formatDate(startDate);
    return `${formatDate(startDate)}–${formatDate(endDate)}`;
  };

  const mapConfidenceToGrade = (confidenceLabel: string | null): 'Strong' | 'Moderate' | 'Weak' => {
    if (!confidenceLabel) return 'Weak';
    const label = confidenceLabel.toLowerCase();
    if (label === 'high') return 'Strong';
    if (label === 'medium') return 'Moderate';
    return 'Weak';
  };

  const getBacktestBadgeText = (trades: number | null) => {
    if (trades === null || trades === undefined) return 'No sweep match';
    return `Trades=${trades}`;
  };

  const getGradeVariant = (grade: string | null) => {
    switch (grade) {
      case 'Strong': return 'default';
      case 'Moderate': return 'secondary';
      case 'Weak': return 'outline';
      default: return 'outline';
    }
  };

  const getGradeOrder = (grade: string | null) => {
    const order = { 'Strong': 1, 'Moderate': 2, 'Weak': 3 };
    return order[grade as keyof typeof order] || 4;
  };

  const getGradeHelperText = (grade: string | null) => {
    switch (grade) {
      case 'Strong': return '✅ Full size (~$1,000). High Sharpe, reliable backtest edge.';
      case 'Moderate': return '⚖️ Half size (~$500). Some edge, but lower confidence.';
      case 'Weak': return '👀 Watch / paper only. Marginal backtest performance.';
      default: return '';
    }
  };

  const getGradeTooltip = () => 'Strong = full, Moderate = half, Weak = watch.';

  // Ranking logic: Sharpe (desc), trades (desc), avg_ret (desc)
  const rankCandidates = (candidates: TriggeredCandidate[]) => {
    return [...candidates].sort((a, b) => {
      // Check if diagnostics exist
      const aDiagnostics = a.sharpe !== null || a.trades !== null;
      const bDiagnostics = b.sharpe !== null || b.trades !== null;
      
      // Prioritize candidates with diagnostics
      if (aDiagnostics && !bDiagnostics) return -1;
      if (!aDiagnostics && bDiagnostics) return 1;
      
      // Both have diagnostics or both don't - rank by Sharpe
      const sharpeA = a.sharpe ?? -Infinity;
      const sharpeB = b.sharpe ?? -Infinity;
      if (sharpeA !== sharpeB) return sharpeB - sharpeA;
      
      // Tie-break by trades
      const tradesA = a.trades ?? 0;
      const tradesB = b.trades ?? 0;
      if (tradesA !== tradesB) return tradesB - tradesA;
      
      // Final tie-break by avg return
      const retA = a.avg_ret ?? -Infinity;
      const retB = b.avg_ret ?? -Infinity;
      return retB - retA;
    });
  };

  const hasDiagnostics = (candidate: TriggeredCandidate) => {
    return candidate.sharpe !== null || candidate.trades !== null;
  };

  const copyToClipboard = (text: string, message: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: message,
    });
  };

  const getBacktestCommand = (symbol: string) => {
    // Get all horizons and parameters for this symbol from the candidates
    const symbolCandidates = candidates.filter(c => c.symbol === symbol);
    const horizons = [...new Set(symbolCandidates.map(c => c.horizon))].join(',');
    
    // Get all unique min_mentions and pos_thresh values from the live rules (what the backtest needs to match)
    const minMentionsList = [...new Set(symbolCandidates.map(c => c.min_mentions))].sort((a, b) => a - b).join(',');
    const posThreshList = [...new Set(symbolCandidates.map(c => c.pos_thresh))].sort((a, b) => a - b).map(v => v.toFixed(2)).join(',');
    
    return `SYMBOLS=${symbol} HORIZONS=${horizons} MIN_MENTIONS_LIST=${minMentionsList} POS_THRESH_LIST=${posThreshList} DO_PERSIST=1 bash moonshot-memestock-hub/reddit-utils/run_grid.sh`;
  };

  // Helper function to calculate default trade size based on grade
  const getDefaultTradeSize = (grade: string | null, currentPrice?: number) => {
    const resolvedGrade = grade || 'Weak';
    let targetValue: number;
    
    switch (resolvedGrade) {
      case 'Strong': 
        targetValue = 1000; // $1,000 for Strong
        break;
      case 'Moderate': 
        targetValue = 500; // $500 for Moderate
        break;
      case 'Weak':
      default:
        return { qty: 1, value: currentPrice || 50, mode: 'paper' }; // 1 share paper trade
    }
    
    if (!currentPrice || currentPrice <= 0) {
      return { qty: 1, value: targetValue, mode: 'real' };
    }
    
    // Calculate quantity (rounded up to whole numbers)
    const qty = Math.ceil(targetValue / currentPrice);
    const actualValue = qty * currentPrice;
    
    return { qty, value: actualValue, mode: 'real' };
  };

  const handleNewTrade = async (candidate: TriggeredCandidate) => {
    const grade = candidate.grade || mapConfidenceToGrade(candidate.confidence_label);
    
    // Fetch latest available opening price with data_date FIRST
    let openPrice = "";
    let priceDataDate = "";
    let priceIsStale = false;
    let usedClosePrice = false;
    try {
      const { data, error } = await supabase
        .from('enhanced_market_data' as any)
        .select('price_open, price, data_date')
        .eq('symbol', candidate.symbol)
        .order('data_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data && !error) {
        const marketData = data as any;
        // Use price_open if available, otherwise fallback to price (close)
        if (marketData.price_open) {
          openPrice = marketData.price_open.toString();
          usedClosePrice = false;
        } else if (marketData.price) {
          openPrice = marketData.price.toString();
          usedClosePrice = true;
        }
        
        if (openPrice) {
          priceDataDate = marketData.data_date;
          
          // Check if price data is from today (Denver time)
          const todayDenver = todayInDenverDateString();
          priceIsStale = marketData.data_date !== todayDenver;
          
          if (priceIsStale) {
            console.warn(`⚠️ Stale price data for ${candidate.symbol}: data_date=${marketData.data_date}, today=${todayDenver}`);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching opening price:', error);
    }
    
    // Calculate trade size using the actual fetched price (must be valid number)
    const currentPrice = openPrice && !isNaN(parseFloat(openPrice)) ? parseFloat(openPrice) : undefined;
    const size = getDefaultTradeSize(grade, currentPrice);
    const quantity = size.qty.toString();
    
    // Build notes with price data warning if stale
    let notesText = grade === 'Weak' ? `Weak confidence trade - paper trading recommended` : "";
    if (priceIsStale && priceDataDate) {
      const priceType = usedClosePrice ? 'close' : 'open';
      const warningText = `⚠️ Entry price from ${priceDataDate} ${priceType} (stale data - verify current price before trading)`;
      notesText = notesText ? `${notesText}\n${warningText}` : warningText;
    }

    setSelectedCandidate(candidate);
    form.reset({
      symbol: candidate.symbol,
      side: candidate.side,
      horizon: candidate.horizon,
      mode: size.mode,
      trade_date: todayInDenverDateString(),
      entry_price: openPrice,
      qty: quantity,
      fees_bps: "0",
      slippage_bps: "0",
      notes: notesText,
    });
    setNewTradeDialogOpen(true);
  };

  // Submit new trade
  const submitNewTrade = async (values: z.infer<typeof tradeFormSchema>) => {
    if (!selectedCandidate) return;
    
    setIsSubmittingTrade(true);
    try {
      const { error } = await supabase.from('trades' as any).insert([{
        symbol: values.symbol.toUpperCase(),
        side: values.side,
        horizon: values.horizon,
        mode: values.mode,
        trade_date: values.trade_date,
        entry_ts: new Date().toISOString(),
        entry_price: values.entry_price ? parseFloat(values.entry_price) : null,
        qty: parseFloat(values.qty),
        fees_total: 0, // Default to 0 fees for paper trades
        notes: values.notes || null,
        source: 'recommendation',
        status: 'OPEN',
      }]);
      if (error) throw error;

      toast({
        title: "Trade Created",
        description: `${values.mode === 'paper' ? 'Paper' : 'Real'} trade for ${values.symbol} has been created.`,
      });

      form.reset();
      setNewTradeDialogOpen(false);
      setSelectedCandidate(null);
      
      // Refresh existing trades to update the UI
      await fetchExistingTrades();
    } catch (error: any) {
      console.error('Error creating trade:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create trade",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingTrade(false);
    }
  };

  // Fetch existing trades
  const fetchExistingTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('trades' as any)
        .select('symbol, horizon, side, status')
        .in('status', ['OPEN', 'PENDING']);

      if (error) {
        console.error('❌ Error fetching existing trades:', error);
        return;
      }

      if (data) {
        // Create a Set of trade keys: "SYMBOL-HORIZON-SIDE"
        const tradeKeys = new Set(
          data.map((trade: any) => `${trade.symbol}-${trade.horizon}-${trade.side}`)
        );
        setExistingTrades(tradeKeys);
        console.log('📊 Found', tradeKeys.size, 'existing open trades');
      }
    } catch (error) {
      console.error('❌ Error fetching existing trades:', error);
    }
  };

  // Check if a candidate has an existing trade
  const hasExistingTrade = (candidate: TriggeredCandidate) => {
    const tradeKey = `${candidate.symbol}-${candidate.horizon}-${candidate.side}`;
    return existingTrades.has(tradeKey);
  };

  // Data fetching
  const fetchTriggeredCandidates = async () => {
    console.log('🎯 Fetching recommended trades...');
    try {
      const { data, error } = await supabase
        .from('v_recommended_trades_today_conf' as any)
        .select('*')
        .order('sharpe', { ascending: false });

      if (error) {
        console.error('❌ Triggered candidates query error:', error);
        throw error;
      }

      console.log('🎯 Triggered candidates received:', data?.length || 0, 'items');

      // Debug: log candidate details to help troubleshoot backtest matching
      if (data && data.length > 0) {
        console.log('📊 All candidates with backtest lookup params:');
        data.forEach((item: any) => {
          console.log(`  ${item.symbol} ${item.side} ${item.horizon}: min_mentions=${item.min_mentions}, rule_threshold=${item.rule_threshold}, sharpe=${item.sharpe}, trades=${item.trades}, has_backtest=${item.sharpe !== null}`);
        });
      }

      if (data) {
        const processed = data.map((item: any) => ({
          symbol: item.symbol,
          horizon: item.horizon,
          side: item.side,
          grade: item.grade || mapConfidenceToGrade(item.confidence_label),
          confidence_label: item.confidence_label,
          mentions: item.mentions || 0,
          min_mentions: item.min_mentions || 0,
          pos_thresh: item.rule_threshold || 0,
          sharpe: item.sharpe,
          avg_ret: item.avg_ret,
          win_rate: item.win_rate,
          trades: item.trades,
          start_date: item.start_date,
          end_date: item.end_date,
          notes: item.grade_explain || '',
          is_enabled: true, // All items from this view are triggered
          priority: 100,
        }));

        setCandidates(processed);

        // Calculate summary KPIs
        const strongCount = processed.filter(c => c.grade === 'Strong' || mapConfidenceToGrade(c.confidence_label) === 'Strong').length;
        
        // Average Sharpe - only include non-null values
        const validSharpes = processed.filter(c => c.sharpe !== null && c.sharpe !== undefined).map(c => c.sharpe as number);
        const avgSharpe = validSharpes.length > 0 ? validSharpes.reduce((sum, val) => sum + val, 0) / validSharpes.length : null;
        
        // Average Win Rate - only include non-null values
        const validWinRates = processed.filter(c => c.win_rate !== null && c.win_rate !== undefined).map(c => c.win_rate as number);
        const avgWinRate = validWinRates.length > 0 ? validWinRates.reduce((sum, val) => sum + val, 0) / validWinRates.length : null;

        setSummaryKPIs({
          totalCandidates: processed.length,
          strongCandidates: strongCount,
          averageSharpe: formatNumber(avgSharpe),
          averageWinRate: formatPercent(avgWinRate),
        });
      } else {
        setCandidates([]);
        setSummaryKPIs(null);
      }
    } catch (error) {
      console.error('❌ Error fetching triggered candidates:', error);
      setCandidates([]);
      setSummaryKPIs(null);
      toast({
        title: 'Data Fetch Error',
        description: 'Failed to load triggered candidates. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchTriggeredCandidates(), fetchExistingTrades()]);
    setIsRefreshing(false);
    toast({
      title: 'Data Refreshed',
      description: `Updated at ${new Date().toLocaleTimeString()}`,
    });
  };

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchTriggeredCandidates(), fetchExistingTrades()])
      .finally(() => setIsLoading(false));
  }, [recoDate, minConfidence, minTrades]);

  // Filter data
  const filteredCandidates = candidates.filter(candidate => {
    const gradeMatch = activeGradeFilter === 'all' || 
                     candidate.grade.toLowerCase() === activeGradeFilter;
    const symbolMatch = searchSymbol === '' || 
                       candidate.symbol.toLowerCase().includes(searchSymbol.toLowerCase());
    return gradeMatch && symbolMatch;
  });

  // Rank all candidates globally
  const rankedCandidates = rankCandidates(filteredCandidates);

  const toggleNoteExpansion = (key: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedNotes(newExpanded);
  };

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Recommended Trades</h1>
          <p className="text-muted-foreground">
            Backtest-validated trading signals triggered on {formatDate(tradingDate)}
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <Tabs value={activeGradeFilter} onValueChange={(value) => setActiveGradeFilter(value as any)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="strong">Strong</TabsTrigger>
                  <TabsTrigger value="moderate">Moderate</TabsTrigger>
                  <TabsTrigger value="weak">Weak</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search symbol..."
                  value={searchSymbol}
                  onChange={(e) => setSearchSymbol(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              {showConfig ? 'Hide Config' : 'Show Config'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Panel */}
      {showConfig && (
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Configuration</CardTitle>
            <Badge variant="outline" className="text-xs">
              From Database
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reco-date">Recommendation Date</Label>
                <Input
                  id="reco-date"
                  type="date"
                  value={recoDate}
                  onChange={(e) => setRecoDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Min Confidence Score: {minConfidence}</Label>
                <Slider
                  value={[minConfidence]}
                  onValueChange={(value) => setMinConfidence(value[0])}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                  disabled
                />
              </div>
              
              <div className="space-y-2">
                <Label>Min Trades: {minTrades}</Label>
                <Slider
                  value={[minTrades]}
                  onValueChange={(value) => setMinTrades(value[0])}
                  min={1}
                  max={20}
                  step={1}
                  className="w-full"
                  disabled
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-3">
              Configuration values are loaded from the database. Use the Configuration page to modify them.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Candidates Today</p>
                {summaryKPIs ? (
                  <p className="text-2xl font-bold">{summaryKPIs.totalCandidates}</p>
                ) : (
                  <Skeleton className="h-8 w-12" />
                )}
              </div>
              <Target className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Strong Candidates</p>
                {summaryKPIs ? (
                  <p className="text-2xl font-bold text-green-600">{summaryKPIs.strongCandidates}</p>
                ) : (
                  <Skeleton className="h-8 w-12" />
                )}
              </div>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Sharpe</p>
                {summaryKPIs ? (
                  <p className="text-2xl font-bold">{summaryKPIs.averageSharpe}</p>
                ) : (
                  <Skeleton className="h-8 w-16" />
                )}
              </div>
              <BarChart3 className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Win Rate</p>
                {summaryKPIs ? (
                  <p className="text-2xl font-bold">{summaryKPIs.averageWinRate}</p>
                ) : (
                  <Skeleton className="h-8 w-16" />
                )}
              </div>
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Candidate List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Candidate Details
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">Ranking Logic</p>
                <p className="text-xs">Cards are ranked by: 1) Sharpe ratio (desc), 2) Trade count (desc), 3) Avg return (desc). Top 2 picks per symbol are highlighted.</p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : rankedCandidates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No triggered candidates found matching your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rankedCandidates.map((candidate, globalRank) => {
                const isTopPick = globalRank < 2 && activeGradeFilter !== 'moderate' && activeGradeFilter !== 'weak';
                const needsBacktest = !hasDiagnostics(candidate);
                const noteKey = `${candidate.symbol}-${candidate.horizon}`;
                const tradeExists = hasExistingTrade(candidate);

                return (
                  <div 
                    key={noteKey}
                    className={cn(
                      "border rounded-lg p-4 transition-all",
                      isTopPick && "ring-2 ring-primary shadow-md",
                      needsBacktest && "border-dashed border-yellow-500/50"
                    )}
                  >
                    {/* Symbol Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 
                          className="text-xl font-bold cursor-pointer hover:text-primary"
                          onClick={() => {
                            setSelectedSymbol(candidate.symbol);
                            navigate(`/sentiment?symbol=${candidate.symbol}`);
                          }}
                        >
                          {candidate.symbol}
                        </h3>
                        
                        {isTopPick && (
                          <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 gap-1">
                            <Trophy className="w-3 h-3" />
                            Top Pick
                          </Badge>
                        )}
                        
                        {tradeExists && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Badge variant="default" className="bg-green-600 hover:bg-green-700 gap-1">
                                  ✓ Trade Created
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              An open trade already exists for this symbol/horizon/side
                            </TooltipContent>
                          </Tooltip>
                        )}
                        
                        {needsBacktest && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge 
                                variant="outline" 
                                className="border-yellow-500 text-yellow-600 gap-1 cursor-pointer hover:bg-yellow-50"
                                onClick={() => copyToClipboard(getBacktestCommand(candidate.symbol), "Copied backtest command to clipboard")}
                              >
                                <AlertCircle className="w-3 h-3" />
                                No backtest data
                                <Copy className="w-3 h-3 ml-1" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>No backtest results found for:</p>
                              <p className="font-mono text-xs">min_mentions={candidate.min_mentions}, pos_thresh={candidate.pos_thresh.toFixed(2)}</p>
                              <p className="text-xs mt-1 text-muted-foreground">Could be: not run yet, or insufficient qualifying trades</p>
                              <p className="text-xs font-semibold mt-1">Click to copy backtest command</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        
                        <Badge variant="outline">{candidate.horizon}</Badge>
                        <Badge variant="outline">{candidate.side}</Badge>
                        
                        <div className="flex flex-col items-start gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Badge variant={getGradeVariant(candidate.grade || mapConfidenceToGrade(candidate.confidence_label))}>
                                  {candidate.grade || mapConfidenceToGrade(candidate.confidence_label)}
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {getGradeTooltip()}
                            </TooltipContent>
                          </Tooltip>
                          <span className="text-xs text-muted-foreground max-w-[200px]">
                            {getGradeHelperText(candidate.grade || mapConfidenceToGrade(candidate.confidence_label))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Candidate Data */}
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center mb-2">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Mentions:</span> {candidate.mentions}/{candidate.min_mentions}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Threshold:</span> {candidate.pos_thresh.toFixed(3)}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Sharpe:</span> {formatNumber(candidate.sharpe)}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Avg Ret:</span> {formatPercent(candidate.avg_ret)}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Win:</span> {formatPercent(candidate.win_rate)}
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {getBacktestBadgeText(candidate.trades)}
                          </Badge>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            size="sm"
                            onClick={() => handleNewTrade(candidate)}
                            className="h-6 px-2 text-xs"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            {(() => {
                              const grade = candidate.grade || mapConfidenceToGrade(candidate.confidence_label);
                              const size = getDefaultTradeSize(grade);
                              if (grade === 'Weak') return 'Paper';
                              return `$${Math.round(size.value)}`;
                            })()}
                          </Button>
                        </div>
                      </div>

                      {/* Backtest Context */}
                      <div className="text-xs text-muted-foreground mb-2">
                        [{candidate.grade || mapConfidenceToGrade(candidate.confidence_label)}] {getBacktestBadgeText(candidate.trades)} • 
                        Avg {formatPercent(candidate.avg_ret)} • Win {formatPercent(candidate.win_rate)} • 
                        Sharpe {formatNumber(candidate.sharpe, 1)} ({formatDateRange(candidate.start_date, candidate.end_date)})
                        <Button 
                          variant="link" 
                          className="h-auto p-0 ml-2 text-xs"
                          onClick={() => navigate(`/backtesting?symbol=${candidate.symbol}&horizon=${candidate.horizon}`)}
                        >
                          View Backtest
                        </Button>
                      </div>

                      {/* Notes */}
                      {candidate.notes && (
                        <div className="border-t pt-2 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Notes:</span>
                            {candidate.notes.length > 200 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleNoteExpansion(noteKey)}
                                className="h-auto py-0 px-2 text-xs"
                              >
                                {expandedNotes.has(noteKey) ? (
                                  <>
                                    <ChevronUp className="w-3 h-3 mr-1" />
                                    Show less
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3 h-3 mr-1" />
                                    Show more
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                          <p className={cn(
                            "text-xs text-muted-foreground mt-1",
                            !expandedNotes.has(noteKey) && candidate.notes.length > 200 && "line-clamp-3"
                          )}>
                            {candidate.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Persistent Footer */}
          <div className="mt-6 pt-4 border-t border-dashed">
            <p className="text-xs text-muted-foreground text-center">
              <strong className="text-foreground">Strong = backtested edge.</strong> Refresh shards before trading if diagnostics are missing.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sentiment */}
      <Card>
        <CardHeader>
          <CardTitle>Sentiment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Today */}
            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/sentiment?tab=sentiment')}
                className="w-full flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <TrendingUp className="w-4 h-4" />
                Today
              </Button>
              <TodaySentimentSummary selectedSymbol={selectedSymbol} />
            </div>

            {/* Velocity */}
            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/sentiment?tab=velocity')}
                className="w-full flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <BarChart3 className="w-4 h-4" />
                Velocity
              </Button>
              <VelocitySentimentSummary />
            </div>

            {/* History */}
            <div className="space-y-3">
              <Button 
                onClick={() => navigate(`/sentiment?tab=history${selectedSymbol ? `&symbol=${selectedSymbol}` : ''}`)}
                className="w-full flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Activity className="w-4 h-4" />
                History {selectedSymbol && `(${selectedSymbol})`}
              </Button>
              <HistorySentimentSummary selectedSymbol={selectedSymbol} />
            </div>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* New Trade Dialog */}
      <Dialog open={newTradeDialogOpen} onOpenChange={setNewTradeDialogOpen}>
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
    </TooltipProvider>
  );
};

export default TriggeredCandidatesDashboard;