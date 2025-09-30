import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  Calendar as CalendarIcon,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  History,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import SourceFilter, { SourceType, getSourceIcon, getSourceColor, getSourceBadgeColor } from '@/components/SourceFilter';
import { aggregateSentiment, getSentimentLabel } from '@/utils/sentimentAggregator';

// Types
interface SentimentData {
  symbol: string;
  mentions: number;
  avg_score: number;
  avg_confidence: number;
  used_score: number;
  pos: number;
  neu: number;
  neg: number;
  sentiment: 'Bullish' | 'Neutral' | 'Bearish';
  // Multi-source fields
  reddit_score?: number;
  reddit_mentions?: number;
  stocktwits_score?: number;
  stocktwits_mentions?: number;
  combined_score?: number;
  sources: string[];
  consensus?: 'agreement' | 'divergence' | 'single';
}

interface SparklineData {
  symbol: string;
  data: { date: string; score: number }[];
}

interface FilterState {
  date: Date;
  contentType: 'all' | 'comments' | 'posts';
  minPosts: number;
  minScore: number;
  minConfidence: number;
  selectedSymbol: string;
  selectedHorizon: string;
  sourceFilter: SourceType;
}

interface RuleDefaults {
  def_min_posts: number;
  def_min_score: number;
  def_min_conf: number;
}

const TodaysSentiment = () => {
  const [sentimentData, setSentimentData] = useState<SentimentData[]>([]);
  const [sparklineData, setSparklineData] = useState<SparklineData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showLeadersOnly, setShowLeadersOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'mentions' | 'score'>('mentions');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [availableHorizons, setAvailableHorizons] = useState<string[]>([]);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);
  
  const [filters, setFilters] = useState<FilterState>({
    date: new Date(), // Will be updated with latest available date
    contentType: 'all',
    minPosts: 3, // Fallback default
    minScore: 0.20, // Fallback default
    minConfidence: 0.70, // Fallback default
    selectedSymbol: 'ALL',
    selectedHorizon: 'ALL',
    sourceFilter: 'all' as SourceType,
  });

  const { toast } = useToast();
  const navigate = useNavigate();

  // Helper functions
  const formatDate = (date: Date) => 
    date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

  const formatPercent = (value: number) => 
    `${(value * 100).toFixed(0)}%`;

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'Bullish': return 'default';
      case 'Bearish': return 'destructive';
      default: return 'outline';
    }
  };

  // Data fetching functions
  const fetchGlobalDefaults = async (modelVersion: string = 'gpt-sent-v1'): Promise<RuleDefaults | null> => {
    try {
      console.log('📊 Fetching global defaults for model:', modelVersion);
      const { data, error } = await supabase
        .from('live_sentiment_entry_rules')
        .select('min_mentions, pos_thresh, min_conf')
        .eq('is_enabled', true)
        .eq('model_version', modelVersion);

      if (error) {
        console.error('❌ Error fetching global defaults:', error);
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      // Calculate medians manually
      const mentions = data.map(d => d.min_mentions).sort((a, b) => a - b);
      const scores = data.map(d => d.pos_thresh).sort((a, b) => a - b);
      const confs = data.map(d => d.min_conf).sort((a, b) => a - b);

      const getMedian = (arr: number[]) => {
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
      };

      const result = {
        def_min_posts: Math.round(getMedian(mentions)),
        def_min_score: getMedian(scores),
        def_min_conf: getMedian(confs)
      };

      console.log('📊 Global defaults calculated:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching global defaults:', error);
      return null;
    }
  };

  const fetchSymbolDefaults = async (symbol: string, horizon: string, modelVersion: string = 'gpt-sent-v1'): Promise<RuleDefaults | null> => {
    try {
      console.log('🎯 Fetching symbol defaults for:', { symbol, horizon, modelVersion });
      const { data, error } = await supabase
        .from('live_sentiment_entry_rules')
        .select('min_mentions, pos_thresh, min_conf')
        .eq('symbol', symbol)
        .eq('horizon', horizon)
        .eq('model_version', modelVersion)
        .eq('is_enabled', true)
        .order('priority', { ascending: false })
        .limit(1);

      if (error) {
        console.error('❌ Error fetching symbol defaults:', error);
        return null;
      }

      if (data && data.length > 0) {
        console.log('🎯 Symbol defaults received:', data[0]);
        return {
          def_min_posts: data[0].min_mentions,
          def_min_score: data[0].pos_thresh,
          def_min_conf: data[0].min_conf
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error fetching symbol defaults:', error);
      return null;
    }
  };

  const fetchAvailableOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('live_sentiment_entry_rules')
        .select('symbol, horizon')
        .eq('is_enabled', true)
        .order('priority', { ascending: false });

      if (error) {
        console.error('❌ Error fetching available options:', error);
        return;
      }

      const symbols = [...new Set(data?.map(d => d.symbol) || [])];
      const horizons = [...new Set(data?.map(d => d.horizon) || [])];
      
      setAvailableSymbols(['ALL', ...symbols]);
      setAvailableHorizons(['ALL', ...horizons]);
      
      console.log('📊 Available options:', { symbols, horizons });
    } catch (error) {
      console.error('❌ Error fetching available options:', error);
    }
  };

  const updateFiltersWithDefaults = async (symbol: string, horizon: string) => {
    setIsLoadingDefaults(true);
    try {
      let defaults: RuleDefaults | null = null;

      // Try symbol-specific defaults first
      if (symbol !== 'ALL' && horizon !== 'ALL') {
        defaults = await fetchSymbolDefaults(symbol, horizon);
      }

      // Fall back to global defaults
      if (!defaults) {
        defaults = await fetchGlobalDefaults();
      }

      // Apply defaults or fall back to hardcoded values
      if (defaults) {
        console.log('📊 Applying defaults:', defaults);
        setFilters(prev => ({
          ...prev,
          minPosts: defaults!.def_min_posts,
          minScore: defaults!.def_min_score,
          minConfidence: defaults!.def_min_conf,
        }));
      } else {
        console.log('📊 Using fallback defaults: 3 / 0.20 / 0.70');
        setFilters(prev => ({
          ...prev,
          minPosts: 3,
          minScore: 0.20,
          minConfidence: 0.70,
        }));
      }
    } catch (error) {
      console.error('❌ Error updating filters with defaults:', error);
    } finally {
      setIsLoadingDefaults(false);
    }
  };

  const fetchLatestAvailableDate = async () => {
    try {
      const { data, error } = await supabase
        .from('v_reddit_daily_signals')
        .select('trade_date')
        .order('trade_date', { ascending: false })
        .limit(1);

      if (error) {
        console.error('❌ Error fetching latest date:', error);
        return null;
      }

      return data?.[0]?.trade_date ? new Date(data[0].trade_date) : null;
    } catch (error) {
      console.error('❌ Error fetching latest date:', error);
      return null;
    }
  };

  const fetchSentimentData = async () => {
    console.log('📊 Fetching multi-source sentiment data for date:', formatDate(filters.date));
    try {
      const dateStr = format(filters.date, 'yyyy-MM-dd');
      
      // Fetch Reddit data
      let redditData: any[] = [];
      if (filters.sourceFilter === 'all' || filters.sourceFilter === 'reddit') {
        const { data, error } = await supabase
          .from('v_reddit_daily_signals')
          .select('*')
          .eq('trade_date', dateStr)
          .gte('n_mentions', filters.minPosts)
          .order('n_mentions', { ascending: false });

        if (error) {
          console.error('❌ Reddit data query error:', error);
        } else {
          redditData = data || [];
          console.log('📊 Reddit data received:', redditData.length, 'items');
        }
      }

      // Fetch StockTwits data
      let stocktwitsData: any[] = [];
      if (filters.sourceFilter === 'all' || filters.sourceFilter === 'stocktwits') {
        const { data, error } = await supabase
          .from('sentiment_history')
          .select('symbol, sentiment_score, confidence_score, volume_indicator')
          .eq('source', 'stocktwits')
          .eq('collected_date', dateStr)
          .gte('volume_indicator', filters.minPosts)
          .order('volume_indicator', { ascending: false });

        if (error) {
          console.error('❌ StockTwits data query error:', error);
        } else {
          stocktwitsData = data || [];
          console.log('📊 StockTwits data received:', stocktwitsData.length, 'items');
        }
      }

      // Merge and process data
      const symbolMap = new Map<string, SentimentData>();

      // Process Reddit data
      redditData.forEach((item: any) => {
        const score = item.avg_score || 0;
        if (Math.abs(score) < filters.minScore) return;

        const mentions = item.n_mentions || 0;
        symbolMap.set(item.symbol, {
          symbol: item.symbol,
          mentions: mentions,
          avg_score: score,
          avg_confidence: 0.75,
          used_score: item.used_score || score * mentions,
          pos: Math.max(0, Math.round(score * mentions)),
          neu: Math.round(mentions * 0.2),
          neg: Math.max(0, Math.round(-score * mentions)),
          sentiment: score > 0.1 ? 'Bullish' : score < -0.1 ? 'Bearish' : 'Neutral',
          reddit_score: score,
          reddit_mentions: mentions,
          sources: ['reddit'],
          consensus: 'single',
        });
      });

      // Process StockTwits data and merge
      stocktwitsData.forEach((item: any) => {
        const score = item.sentiment_score || 0;
        if (Math.abs(score) < filters.minScore) return;

        const volume = item.volume_indicator || 0;
        const existing = symbolMap.get(item.symbol);

        if (existing) {
          // Merge with Reddit data
          const aggregated = aggregateSentiment(
            existing.reddit_score,
            score,
            undefined,
            undefined,
            undefined,
            undefined,
            0.75,
            item.confidence_score || 0.8
          );

          // Determine consensus
          const redditDir = (existing.reddit_score || 0) > 0 ? 1 : -1;
          const stocktwitsDir = score > 0 ? 1 : -1;
          const consensus = redditDir === stocktwitsDir ? 'agreement' : 'divergence';

          symbolMap.set(item.symbol, {
            ...existing,
            stocktwits_score: score,
            stocktwits_mentions: volume,
            avg_score: aggregated.overall,
            combined_score: aggregated.overall,
            avg_confidence: aggregated.confidence,
            sentiment: aggregated.overall > 0.1 ? 'Bullish' : aggregated.overall < -0.1 ? 'Bearish' : 'Neutral',
            sources: ['reddit', 'stocktwits'],
            consensus,
            mentions: existing.mentions + volume,
          });
        } else {
          // StockTwits only
          symbolMap.set(item.symbol, {
            symbol: item.symbol,
            mentions: volume,
            avg_score: score,
            avg_confidence: item.confidence_score || 0.8,
            used_score: score * volume,
            pos: Math.max(0, Math.round(score * volume)),
            neu: Math.round(volume * 0.2),
            neg: Math.max(0, Math.round(-score * volume)),
            sentiment: score > 0.1 ? 'Bullish' : score < -0.1 ? 'Bearish' : 'Neutral',
            stocktwits_score: score,
            stocktwits_mentions: volume,
            sources: ['stocktwits'],
            consensus: 'single',
          });
        }
      });

      const processed = Array.from(symbolMap.values());
      console.log('📊 Merged data:', processed.length, 'unique symbols');
      setSentimentData(processed);
      
      if (processed.length === 0) {
        toast({
          title: 'No Data Found',
          description: `No sentiment data available for ${formatDate(filters.date)} with current filters.`,
        });
      }
    } catch (error) {
      console.error('❌ Error fetching sentiment data:', error);
      setSentimentData([]);
      toast({
        title: 'Data Fetch Error',
        description: 'Failed to load sentiment data. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const fetchSparklineData = async () => {
    console.log('📈 Fetching sparkline data...');
    try {
      // Get top 10 symbols by mentions for sparklines
      const topSymbols = sentimentData
        .slice(0, 10)
        .map(item => item.symbol);

      if (topSymbols.length === 0) return;

      const endDate = new Date(filters.date);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6); // 7 days total

      const { data, error } = await supabase
        .from('v_reddit_daily_signals')
        .select('symbol, trade_date, avg_score')
        .in('symbol', topSymbols)
        .gte('trade_date', format(startDate, 'yyyy-MM-dd'))
        .lte('trade_date', format(endDate, 'yyyy-MM-dd'))
        .order('trade_date', { ascending: true });

      if (error) {
        console.error('❌ Sparkline data query error:', error);
        return;
      }

      console.log('📈 Sparkline data received:', data?.length || 0, 'items');

      if (data) {
        const sparklines = topSymbols.map(symbol => ({
          symbol,
          data: data
            .filter(item => item.symbol === symbol)
            .map(item => ({
              date: item.trade_date,
              score: item.avg_score || 0,
            }))
        }));

        setSparklineData(sparklines);
      }
    } catch (error) {
      console.error('❌ Error fetching sparkline data:', error);
    }
  };

  const fetchAllData = async () => {
    setIsLoading(true);
    await fetchSentimentData();
    setIsLoading(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAllData();
    setIsRefreshing(false);
    toast({
      title: 'Data Refreshed',
      description: `Updated for ${formatDate(filters.date)}`,
    });
  };

  const toggleCardExpansion = (symbol: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(symbol)) {
      newExpanded.delete(symbol);
    } else {
      newExpanded.add(symbol);
    }
    setExpandedCards(newExpanded);
  };

  const handleSort = (column: 'mentions' | 'score') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Effects
  useEffect(() => {
    const initialize = async () => {
      // Load available options first
      await fetchAvailableOptions();
      
      // Set up initial defaults
      await updateFiltersWithDefaults('ALL', 'ALL');
      
      // Then initialize date
      const latestDate = await fetchLatestAvailableDate();
      if (latestDate) {
        setFilters(prev => ({ ...prev, date: latestDate }));
      } else {
        fetchAllData();
      }
    };
    
    initialize();
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [filters.date, filters.minPosts, filters.minScore, filters.minConfidence, filters.contentType, filters.sourceFilter]);

  useEffect(() => {
    if (sentimentData.length > 0) {
      fetchSparklineData();
    }
  }, [sentimentData]);

  // Update defaults when symbol/horizon changes
  useEffect(() => {
    updateFiltersWithDefaults(filters.selectedSymbol, filters.selectedHorizon);
  }, [filters.selectedSymbol, filters.selectedHorizon]);

  // Computed values
  const bullishLeaders = sentimentData
    .filter(item => item.sentiment === 'Bullish')
    .sort((a, b) => Math.abs(b.used_score) - Math.abs(a.used_score))
    .slice(0, 5);

  const bearishLeaders = sentimentData
    .filter(item => item.sentiment === 'Bearish')
    .sort((a, b) => Math.abs(b.used_score) - Math.abs(a.used_score))
    .slice(0, 5);

  const tableData = showLeadersOnly 
    ? [...bullishLeaders, ...bearishLeaders]
    : sentimentData
        .sort((a, b) => {
          const aVal = sortBy === 'mentions' ? a.mentions : Math.abs(a.avg_score);
          const bVal = sortBy === 'mentions' ? b.mentions : Math.abs(b.avg_score);
          return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });

  // Recharts sparkline component
  const RechartsSparkline = ({ data, symbol }: { data: { date: string; score: number }[]; symbol: string }) => {
    if (data.length === 0) return <Skeleton className="w-24 h-8" />;
    
    const latestScore = data[data.length - 1]?.score || 0;
    const strokeColor = latestScore > 0 ? '#10b981' : latestScore < 0 ? '#ef4444' : '#64748b';
    
    return (
      <div className="w-24 h-8 cursor-pointer" onClick={() => navigate(`/sentiment?tab=history&symbol=${symbol}`)}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line 
              type="monotone" 
              dataKey="score" 
              stroke={strokeColor}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Today's Sentiment</h1>
          <p className="text-muted-foreground">
            Multi-source sentiment analysis with consensus tracking
          </p>
        </div>
        <div className="flex items-center gap-4">
          <SourceFilter 
            selected={filters.sourceFilter} 
            onChange={(source) => setFilters(prev => ({ ...prev, sourceFilter: source }))}
          />
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-8 gap-4 items-end">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !filters.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDate(filters.date)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.date}
                    onSelect={(date) => date && setFilters(prev => ({ ...prev, date }))}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Symbol Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Symbol</Label>
              <Select 
                value={filters.selectedSymbol} 
                onValueChange={(value) => 
                  setFilters(prev => ({ ...prev, selectedSymbol: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSymbols.map(symbol => (
                    <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Horizon Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Horizon</Label>
              <Select 
                value={filters.selectedHorizon} 
                onValueChange={(value) => 
                  setFilters(prev => ({ ...prev, selectedHorizon: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableHorizons.map(horizon => (
                    <SelectItem key={horizon} value={horizon}>{horizon}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Content Type</Label>
              <Select 
                value={filters.contentType} 
                onValueChange={(value: 'all' | 'comments' | 'posts') => 
                  setFilters(prev => ({ ...prev, contentType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="comments">Comments</SelectItem>
                  <SelectItem value="posts">Posts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Posts */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Min Posts ({filters.minPosts})
                {isLoadingDefaults && <span className="text-xs text-muted-foreground ml-1">(updating...)</span>}
              </Label>
              <Slider
                value={[filters.minPosts]}
                onValueChange={([value]) => setFilters(prev => ({ ...prev, minPosts: value }))}
                max={100}
                min={1}
                step={1}
                className="w-full"
                disabled={isLoadingDefaults}
              />
            </div>

            {/* Min Score */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Min |Score| ({filters.minScore.toFixed(2)})
                {isLoadingDefaults && <span className="text-xs text-muted-foreground ml-1">(updating...)</span>}
              </Label>
              <Slider
                value={[filters.minScore]}
                onValueChange={([value]) => setFilters(prev => ({ ...prev, minScore: value }))}
                max={1}
                min={0}
                step={0.01}
                className="w-full"
                disabled={isLoadingDefaults}
              />
            </div>

            {/* Min Confidence */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Min Confidence ({formatPercent(filters.minConfidence)})
                {isLoadingDefaults && <span className="text-xs text-muted-foreground ml-1">(updating...)</span>}
              </Label>
              <Slider
                value={[filters.minConfidence]}
                onValueChange={([value]) => setFilters(prev => ({ ...prev, minConfidence: value }))}
                max={1}
                min={0}
                step={0.05}
                className="w-full"
                disabled={isLoadingDefaults}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Leaders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bullish Leaders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Bullish Leaders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : bullishLeaders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No bullish leaders found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bullishLeaders.map((item) => {
                  const sparkline = sparklineData.find(s => s.symbol === item.symbol);
                  const RedditIcon = getSourceIcon('reddit');
                  const StockTwitsIcon = getSourceIcon('stocktwits');
                  
                  return (
                    <div key={item.symbol} className="p-3 border rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg">{item.symbol}</span>
                          <Badge variant={getSentimentBadge(item.sentiment)}>
                            {item.sentiment}
                          </Badge>
                          {item.consensus === 'agreement' && (
                            <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Agreement
                            </Badge>
                          )}
                          {item.consensus === 'divergence' && (
                            <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-600 border-orange-300">
                              <AlertTriangle className="w-3 h-3" />
                              Divergence
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {sparkline && <RechartsSparkline data={sparkline.data} symbol={item.symbol} />}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/sentiment?tab=history&symbol=${item.symbol}`)}
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Multi-source breakdown */}
                      {item.sources.length > 1 ? (
                        <div className="space-y-2 mb-2">
                          {item.reddit_score !== undefined && (
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <RedditIcon className="w-4 h-4 text-blue-500" />
                                <span className="text-muted-foreground">Reddit:</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={item.reddit_score > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {item.reddit_score > 0 ? '🟢' : '🔴'} {item.reddit_score.toFixed(3)}
                                </span>
                                <span className="text-muted-foreground">({item.reddit_mentions})</span>
                              </div>
                            </div>
                          )}
                          {item.stocktwits_score !== undefined && (
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <StockTwitsIcon className="w-4 h-4 text-green-500" />
                                <span className="text-muted-foreground">StockTwits:</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={item.stocktwits_score > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {item.stocktwits_score > 0 ? '🟢' : '🔴'} {item.stocktwits_score.toFixed(3)}
                                </span>
                                <span className="text-muted-foreground">({item.stocktwits_mentions})</span>
                              </div>
                            </div>
                          )}
                          <div className="border-t pt-2 flex items-center justify-between text-sm font-medium">
                            <span>Combined:</span>
                            <span className={item.combined_score! > 0 ? 'text-green-600' : 'text-red-600'}>
                              {item.combined_score!.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {item.sources.includes('reddit') && <RedditIcon className="w-4 h-4 text-blue-500" />}
                            {item.sources.includes('stocktwits') && <StockTwitsIcon className="w-4 h-4 text-green-500" />}
                            Mentions: {item.mentions}
                          </div>
                          <div>Score: {item.avg_score.toFixed(3)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bearish Leaders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-600" />
              Bearish Leaders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : bearishLeaders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingDown className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No bearish leaders found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bearishLeaders.map((item) => {
                  const sparkline = sparklineData.find(s => s.symbol === item.symbol);
                  const RedditIcon = getSourceIcon('reddit');
                  const StockTwitsIcon = getSourceIcon('stocktwits');
                  
                  return (
                    <div key={item.symbol} className="p-3 border rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg">{item.symbol}</span>
                          <Badge variant={getSentimentBadge(item.sentiment)}>
                            {item.sentiment}
                          </Badge>
                          {item.consensus === 'agreement' && (
                            <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Agreement
                            </Badge>
                          )}
                          {item.consensus === 'divergence' && (
                            <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-600 border-orange-300">
                              <AlertTriangle className="w-3 h-3" />
                              Divergence
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {sparkline && <RechartsSparkline data={sparkline.data} symbol={item.symbol} />}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/sentiment?tab=history&symbol=${item.symbol}`)}
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Multi-source breakdown */}
                      {item.sources.length > 1 ? (
                        <div className="space-y-2 mb-2">
                          {item.reddit_score !== undefined && (
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <RedditIcon className="w-4 h-4 text-blue-500" />
                                <span className="text-muted-foreground">Reddit:</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={item.reddit_score > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {item.reddit_score > 0 ? '🟢' : '🔴'} {item.reddit_score.toFixed(3)}
                                </span>
                                <span className="text-muted-foreground">({item.reddit_mentions})</span>
                              </div>
                            </div>
                          )}
                          {item.stocktwits_score !== undefined && (
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <StockTwitsIcon className="w-4 h-4 text-green-500" />
                                <span className="text-muted-foreground">StockTwits:</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={item.stocktwits_score > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {item.stocktwits_score > 0 ? '🟢' : '🔴'} {item.stocktwits_score.toFixed(3)}
                                </span>
                                <span className="text-muted-foreground">({item.stocktwits_mentions})</span>
                              </div>
                            </div>
                          )}
                          <div className="border-t pt-2 flex items-center justify-between text-sm font-medium">
                            <span>Combined:</span>
                            <span className={item.combined_score! > 0 ? 'text-green-600' : 'text-red-600'}>
                              {item.combined_score!.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {item.sources.includes('reddit') && <RedditIcon className="w-4 h-4 text-blue-500" />}
                            {item.sources.includes('stocktwits') && <StockTwitsIcon className="w-4 h-4 text-green-500" />}
                            Mentions: {item.mentions}
                          </div>
                          <div>Score: {item.avg_score.toFixed(3)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Signal Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Signal Table
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="leaders-only"
                  checked={showLeadersOnly}
                  onCheckedChange={setShowLeadersOnly}
                />
                <Label htmlFor="leaders-only" className="text-sm">
                  Leaders Only
                </Label>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        className="h-8 p-0 font-medium"
                        onClick={() => handleSort('mentions')}
                      >
                        Mentions
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        className="h-8 p-0 font-medium"
                        onClick={() => handleSort('score')}
                      >
                        Score
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead>7-Day Trend</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableData.map((item) => {
                    const sparkline = sparklineData.find(s => s.symbol === item.symbol);
                    return (
                      <TableRow key={item.symbol}>
                        <TableCell className="font-bold">{item.symbol}</TableCell>
                        <TableCell>{item.mentions}</TableCell>
                        <TableCell className={cn(
                          "font-mono",
                          item.avg_score > 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {item.avg_score.toFixed(3)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getSentimentBadge(item.sentiment)}>
                            {item.sentiment}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {sparkline ? (
                            <RechartsSparkline data={sparkline.data} symbol={item.symbol} />
                          ) : (
                            <Skeleton className="w-24 h-8" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/sentiment?tab=history&symbol=${item.symbol}`)}
                          >
                            <History className="w-4 h-4 mr-1" />
                            History
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TodaysSentiment;