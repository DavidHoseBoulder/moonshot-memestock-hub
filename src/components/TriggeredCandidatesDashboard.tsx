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
  Plus
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';

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
  
  // Configuration state - loaded from database
  const [recoDate, setRecoDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [minConfidence, setMinConfidence] = useState(60);
  const [minTrades, setMinTrades] = useState(5);
  
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
        return { qty: 0, value: 0, mode: 'paper' }; // Watch/paper only
    }
    
    if (!currentPrice || currentPrice <= 0) {
      return { qty: 1, value: targetValue, mode: 'real' };
    }
    
    // Calculate quantity (rounded up to whole numbers)
    const qty = Math.ceil(targetValue / currentPrice);
    const actualValue = qty * currentPrice;
    
    return { qty, value: actualValue, mode: 'real' };
  };

  const handleNewTrade = (candidate: TriggeredCandidate) => {
    const grade = candidate.grade || mapConfidenceToGrade(candidate.confidence_label);
    const tradeSize = getDefaultTradeSize(grade);
    
    // Navigate to trades page with pre-filled data
    const params = new URLSearchParams({
      symbol: candidate.symbol,
      side: candidate.side,
      horizon: candidate.horizon,
      qty: tradeSize.qty.toString(),
      mode: tradeSize.mode,
      source: 'recommendation'
    });
    
    navigate(`/trades?${params.toString()}`);
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
    await fetchTriggeredCandidates();
    setIsRefreshing(false);
    toast({
      title: 'Data Refreshed',
      description: `Updated at ${new Date().toLocaleTimeString()}`,
    });
  };

  useEffect(() => {
    setIsLoading(true);
    fetchTriggeredCandidates().finally(() => setIsLoading(false));
  }, [recoDate, minConfidence, minTrades]);

  // Filter and group data
  const filteredCandidates = candidates.filter(candidate => {
    const gradeMatch = activeGradeFilter === 'all' || 
                     candidate.grade.toLowerCase() === activeGradeFilter;
    const symbolMatch = searchSymbol === '' || 
                       candidate.symbol.toLowerCase().includes(searchSymbol.toLowerCase());
    return gradeMatch && symbolMatch;
  });

  // Group by symbol
  const groupedCandidates = filteredCandidates.reduce((acc, candidate) => {
    if (!acc[candidate.symbol]) {
      acc[candidate.symbol] = [];
    }
    acc[candidate.symbol].push(candidate);
    return acc;
  }, {} as Record<string, TriggeredCandidate[]>);

  // Sort symbols by best grade and sharpe
  const sortedSymbols = Object.keys(groupedCandidates).sort((a, b) => {
    const aGrades = groupedCandidates[a].map(c => getGradeOrder(c.grade));
    const bGrades = groupedCandidates[b].map(c => getGradeOrder(c.grade));
    const aBestGrade = Math.min(...aGrades);
    const bBestGrade = Math.min(...bGrades);
    
    if (aBestGrade !== bBestGrade) {
      return aBestGrade - bBestGrade;
    }
    
    const aBestSharpe = Math.max(...groupedCandidates[a].map(c => c.sharpe));
    const bBestSharpe = Math.max(...groupedCandidates[b].map(c => c.sharpe));
    return bBestSharpe - aBestSharpe;
  });

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
          <CardTitle>Candidate Details</CardTitle>
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
          ) : sortedSymbols.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No triggered candidates found matching your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedSymbols.map(symbol => {
                const symbolCandidates = groupedCandidates[symbol];
                const bestGrade = symbolCandidates.reduce((best, current) => {
                  const currentGrade = current.grade || mapConfidenceToGrade(current.confidence_label);
                  const bestGradeResolved = best.grade || mapConfidenceToGrade(best.confidence_label);
                  return getGradeOrder(currentGrade) < getGradeOrder(bestGradeResolved) ? current : best;
                });

                return (
                  <div key={symbol} className="border rounded-lg p-4">
                    {/* Symbol Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3 
                          className="text-xl font-bold cursor-pointer hover:text-primary"
                          onClick={() => {
                            setSelectedSymbol(symbol);
                            navigate(`/sentiment?symbol=${symbol}`);
                          }}
                        >
                          {symbol}
                        </h3>
                        <Badge variant="outline">{bestGrade.side}</Badge>
                        <div className="flex flex-col items-start gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant={getGradeVariant(bestGrade.grade || mapConfidenceToGrade(bestGrade.confidence_label))}>
                                {bestGrade.grade || mapConfidenceToGrade(bestGrade.confidence_label)}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {getGradeTooltip()}
                            </TooltipContent>
                          </Tooltip>
                          <span className="text-xs text-muted-foreground">
                            {getGradeHelperText(bestGrade.grade || mapConfidenceToGrade(bestGrade.confidence_label))}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {symbolCandidates.length} signal{symbolCandidates.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Horizon Rows */}
                    <div className="space-y-3">
                      {symbolCandidates
                        .sort((a, b) => {
                          const aGrade = a.grade || mapConfidenceToGrade(a.confidence_label);
                          const bGrade = b.grade || mapConfidenceToGrade(b.confidence_label);
                          return getGradeOrder(aGrade) - getGradeOrder(bGrade);
                        })
                        .map((candidate, idx) => {
                          const noteKey = `${symbol}-${candidate.horizon}`;
                          const isNoteExpanded = expandedNotes.has(noteKey);
                          
                          return (
                            <div key={idx} className="bg-muted/30 rounded-lg p-3">
                               {/* Horizon Data Row */}
                               <div className="grid grid-cols-2 md:grid-cols-8 gap-3 items-center mb-2">
                                 <div>
                                   <span className="font-medium text-sm">{candidate.horizon}</span>
                                 </div>
                                 <div className="text-sm">
                                   <span className="text-muted-foreground">Mentions:</span> {candidate.mentions}/{candidate.min_mentions}
                                 </div>
                                 <div className="text-sm">
                                   <span className="text-muted-foreground">Threshold:</span> {candidate.pos_thresh}
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
                                   <div className="flex flex-col items-start gap-1">
                                     <Tooltip>
                                       <TooltipTrigger asChild>
                                         <Badge variant={getGradeVariant(candidate.grade || mapConfidenceToGrade(candidate.confidence_label))} className="text-xs">
                                           {candidate.grade || mapConfidenceToGrade(candidate.confidence_label)}
                                         </Badge>
                                       </TooltipTrigger>
                                       <TooltipContent>
                                         {getGradeTooltip()}
                                       </TooltipContent>
                                     </Tooltip>
                                     <span className="text-xs text-muted-foreground max-w-xs">
                                       {getGradeHelperText(candidate.grade || mapConfidenceToGrade(candidate.confidence_label))}
                                     </span>
                                   </div>
                                   <Badge variant="secondary" className="text-xs">
                                     {getBacktestBadgeText(candidate.trades)}
                                   </Badge>
                                   {candidate.trades === null && (
                                     <span className="text-xs text-muted-foreground" title="No backtest at this exact (min_mentions, pos_thresh)">
                                       ⚠️
                                     </span>
                                   )}
                                 </div>
                                 <div className="flex gap-1">
                                   <Button
                                     size="sm"
                                     onClick={() => handleNewTrade(candidate)}
                                     className="h-6 px-2 text-xs"
                                     disabled={!candidate.grade && mapConfidenceToGrade(candidate.confidence_label) === 'Weak'}
                                   >
                                     <Plus className="w-3 h-3 mr-1" />
                                     {(() => {
                                       const grade = candidate.grade || mapConfidenceToGrade(candidate.confidence_label);
                                       const size = getDefaultTradeSize(grade);
                                       if (grade === 'Weak') return 'Watch';
                                       return `$${Math.round(size.value)}`;
                                     })()}
                                   </Button>
                                 </div>
                               </div>

                              {/* Backtest Context */}
                              <div className="text-xs text-muted-foreground mb-2">
                                [{candidate.grade || mapConfidenceToGrade(candidate.confidence_label)}] {getBacktestBadgeText(candidate.trades)} • Avg {formatPercent(candidate.avg_ret)} • 
                                Win {formatPercent(candidate.win_rate)} • Sharpe {formatNumber(candidate.sharpe, 1)} ({formatDateRange(candidate.start_date, candidate.end_date)})
                                <Button 
                                  variant="link" 
                                  className="h-auto p-0 ml-2 text-xs"
                                  onClick={() => navigate(`/backtesting?symbol=${symbol}&horizon=${candidate.horizon}`)}
                                >
                                  View Backtest
                                </Button>
                              </div>

                              {/* Notes */}
                              {candidate.notes && candidate.notes.trim().length > 0 && (
                                <div className="mt-2">
                                  <div className={cn(
                                    "text-sm text-muted-foreground",
                                    !isNoteExpanded && "line-clamp-2"
                                  )}>
                                    {candidate.notes}
                                  </div>
                                  {candidate.notes.length > 100 && (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-xs"
                                      onClick={() => toggleNoteExpansion(noteKey)}
                                    >
                                      {isNoteExpanded ? (
                                        <>Show Less <ChevronUp className="w-3 h-3 ml-1" /></>
                                      ) : (
                                        <>Show More <ChevronDown className="w-3 h-3 ml-1" /></>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
    </TooltipProvider>
  );
};

export default TriggeredCandidatesDashboard;