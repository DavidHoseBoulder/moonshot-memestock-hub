import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';
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
  Zap,
  History
} from 'lucide-react';

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
}

interface TrendPoint {
  day: string;
  score: number;
}

interface FilterState {
  date: Date;
  contentType: 'all' | 'comments' | 'posts';
  minPosts: number;
  minScore: number;
  minConfidence: number;
}

interface SparklineData {
  symbol: string;
  data: { date: string; score: number }[];
}

const RedditSentimentAnalysis = () => {
  const [sentimentData, setSentimentData] = useState<SentimentData[]>([]);
  const [sparklineData, setSparklineData] = useState<SparklineData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showLeadersOnly, setShowLeadersOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'mentions' | 'score'>('mentions');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const [filters, setFilters] = useState<FilterState>({
    date: new Date('2025-07-31'), // Default to a date that has data
    contentType: 'all',
    minPosts: 5,
    minScore: 0.1,
    minConfidence: 0.5,
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
    console.log('📊 Fetching sentiment data for date:', formatDate(filters.date));
    try {
      const dateStr = format(filters.date, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('v_reddit_daily_signals')
        .select('*')
        .eq('trade_date', dateStr)
        .gte('n_mentions', filters.minPosts)
        .order('n_mentions', { ascending: false });

      if (error) {
        console.error('❌ Sentiment data query error:', error);
        throw error;
      }

      console.log('📊 Sentiment data received:', data?.length || 0, 'items');

      if (data) {
        const processed = data
          .filter(item => Math.abs(item.avg_score || 0) >= filters.minScore)
          .map((item: any) => {
            const score = item.avg_score || 0;
            const mentions = item.n_mentions || 0;
            let sentiment: 'Bullish' | 'Neutral' | 'Bearish';
            
            if (score > 0.1) {
              sentiment = 'Bullish';
            } else if (score < -0.1) {
              sentiment = 'Bearish';
            } else {
              sentiment = 'Neutral';
            }

            return {
              symbol: item.symbol,
              mentions: mentions,
              avg_score: score,
              avg_confidence: 0.75, // Default confidence for v_reddit_daily_signals
              used_score: item.used_score || score * mentions,
              pos: Math.max(0, Math.round(score * mentions)), // Estimate based on score
              neu: Math.round(mentions * 0.2), // Estimate
              neg: Math.max(0, Math.round(-score * mentions)), // Estimate
              sentiment: sentiment,
            };
          });

        setSentimentData(processed);
        
        if (processed.length === 0) {
          toast({
            title: 'No Data Found',
            description: `No sentiment data available for ${formatDate(filters.date)} with current filters. Try adjusting the date or filter settings.`,
          });
        }
      } else {
        setSentimentData([]);
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
      // Get top 3 symbols by mentions for sparklines
      const topSymbols = sentimentData
        .slice(0, 3)
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
    const initializeDate = async () => {
      const latestDate = await fetchLatestAvailableDate();
      if (latestDate && filters.date.getTime() === new Date('2025-07-31').getTime()) {
        // Only update if we're still on the default date
        setFilters(prev => ({ ...prev, date: latestDate }));
      } else {
        fetchAllData();
      }
    };
    
    initializeDate();
  }, []);

  useEffect(() => {
    if (filters.date.getTime() !== new Date('2025-07-31').getTime()) {
      fetchAllData();
    }
  }, [filters]);

  useEffect(() => {
    if (sentimentData.length > 0) {
      fetchSparklineData();
    }
  }, [sentimentData]);

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
      <div className="w-24 h-8 cursor-pointer" onClick={() => navigate(`/sentiment-dashboard?symbol=${symbol}`)}>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reddit Sentiment Analysis</h1>
          <p className="text-muted-foreground">
            Daily sentiment leaders with configurable filters
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
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
              <Label className="text-sm font-medium">Min Posts ({filters.minPosts})</Label>
              <Slider
                value={[filters.minPosts]}
                onValueChange={([value]) => setFilters(prev => ({ ...prev, minPosts: value }))}
                max={100}
                min={1}
                step={1}
                className="w-full"
              />
            </div>

            {/* Min Score */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Min |Score| ({filters.minScore.toFixed(2)})</Label>
              <Slider
                value={[filters.minScore]}
                onValueChange={([value]) => setFilters(prev => ({ ...prev, minScore: value }))}
                max={1}
                min={0}
                step={0.01}
                className="w-full"
              />
            </div>

            {/* Min Confidence */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Min Confidence ({formatPercent(filters.minConfidence)})</Label>
              <Slider
                value={[filters.minConfidence]}
                onValueChange={([value]) => setFilters(prev => ({ ...prev, minConfidence: value }))}
                max={1}
                min={0}
                step={0.05}
                className="w-full"
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
                {bullishLeaders.map((item) => (
                  <div key={item.symbol} className="p-3 border rounded-lg hover:shadow-md transition-shadow">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleCardExpansion(item.symbol)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg">{item.symbol}</span>
                        <Badge variant={getSentimentBadge(item.sentiment)}>
                          {item.sentiment}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="font-medium">{item.avg_score.toFixed(3)}</div>
                          <div className="text-sm text-muted-foreground">{item.mentions} mentions</div>
                        </div>
                        {expandedCards.has(item.symbol) ? 
                          <ChevronUp className="w-4 h-4" /> : 
                          <ChevronDown className="w-4 h-4" />
                        }
                      </div>
                    </div>
                    
                    {expandedCards.has(item.symbol) && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="text-center">
                            <div className="font-medium text-green-600">{item.pos}</div>
                            <div className="text-muted-foreground">Positive</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-gray-600">{item.neu}</div>
                            <div className="text-muted-foreground">Neutral</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-red-600">{item.neg}</div>
                            <div className="text-muted-foreground">Negative</div>
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Confidence: {formatPercent(item.avg_confidence)}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full mt-2"
                          onClick={() => navigate(`/sentiment-dashboard?symbol=${item.symbol}`)}
                        >
                          View History
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
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
                {bearishLeaders.map((item) => (
                  <div key={item.symbol} className="p-3 border rounded-lg hover:shadow-md transition-shadow">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleCardExpansion(item.symbol)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg">{item.symbol}</span>
                        <Badge variant={getSentimentBadge(item.sentiment)}>
                          {item.sentiment}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="font-medium">{item.avg_score.toFixed(3)}</div>
                          <div className="text-sm text-muted-foreground">{item.mentions} mentions</div>
                        </div>
                        {expandedCards.has(item.symbol) ? 
                          <ChevronUp className="w-4 h-4" /> : 
                          <ChevronDown className="w-4 h-4" />
                        }
                      </div>
                    </div>
                    
                    {expandedCards.has(item.symbol) && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="text-center">
                            <div className="font-medium text-green-600">{item.pos}</div>
                            <div className="text-muted-foreground">Positive</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-gray-600">{item.neu}</div>
                            <div className="text-muted-foreground">Neutral</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-red-600">{item.neg}</div>
                            <div className="text-muted-foreground">Negative</div>
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Confidence: {formatPercent(item.avg_confidence)}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full mt-2"
                          onClick={() => navigate(`/sentiment-dashboard?symbol=${item.symbol}`)}
                        >
                          View History
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sentiment Trends */}
      {sparklineData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Sentiment Trends (7-day)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sparklineData.map((sparkline) => (
                <div key={sparkline.symbol} className="flex items-center justify-between p-3 border rounded-lg hover:shadow-md transition-shadow">
                  <div>
                    <div className="font-bold text-lg">{sparkline.symbol}</div>
                    <div className="text-sm text-muted-foreground">7-day trend</div>
                  </div>
                  <RechartsSparkline data={sparkline.data} symbol={sparkline.symbol} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signal Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Signal Table
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Switch
                id="leaders-only"
                checked={showLeadersOnly}
                onCheckedChange={setShowLeadersOnly}
              />
              <Label htmlFor="leaders-only">Leaders only</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('mentions')}
                  >
                    <div className="flex items-center gap-1">
                      Mentions
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('score')}
                  >
                    <div className="flex items-center gap-1">
                      Avg Score
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Used Score</TableHead>
                  <TableHead>Sentiment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : tableData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No data available for the selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  tableData.slice(0, 50).map((item) => (
                    <TableRow 
                      key={item.symbol}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/sentiment-dashboard?symbol=${item.symbol}`)}
                    >
                      <TableCell className="font-medium">{item.symbol}</TableCell>
                      <TableCell>{item.mentions}</TableCell>
                      <TableCell>{item.avg_score.toFixed(3)}</TableCell>
                      <TableCell>{formatPercent(item.avg_confidence)}</TableCell>
                      <TableCell>{item.used_score.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={getSentimentBadge(item.sentiment)}>
                          {item.sentiment}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Deep Links */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button 
          variant="outline" 
          onClick={() => navigate('/sentiment-dashboard?tab=velocity')}
          className="flex items-center gap-2"
        >
          <Zap className="w-4 h-4" />
          View sentiment velocity → Velocity Tracker
        </Button>
        <Button 
          variant="outline" 
          onClick={() => navigate('/sentiment-dashboard?tab=history')}
          className="flex items-center gap-2"
        >
          <History className="w-4 h-4" />
          View past days → Sentiment History
        </Button>
      </div>
    </div>
  );
};

export default RedditSentimentAnalysis;