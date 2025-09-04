import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { History, RefreshCw, TrendingUp, TrendingDown, Check, ChevronsUpDown } from 'lucide-react';
import { format, subDays } from 'date-fns';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot
} from 'recharts';

// Types
interface SentimentHistoryData {
  data_date: string;
  symbol: string;
  avg_score: number;
  used_score: number;
  n_mentions: number;
  z_score_score?: number;
  delta_mentions?: number;
}

const SentimentHistoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSymbol, setSelectedSymbol] = useState(searchParams.get('symbol') || 'TSLA');
  const [days, setDays] = useState(30);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [historyData, setHistoryData] = useState<SentimentHistoryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [chartMode, setChartMode] = useState<'both' | 'score' | 'mentions'>('both');

  const { toast } = useToast();

  // Update URL when symbol changes
  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    setSearchParams({ symbol, tab: 'history' });
  };

  // Fetch available symbols from multiple sources
  const fetchAvailableSymbols = async () => {
    try {
      // Get symbols from ticker_universe (more comprehensive)
      const { data: tickerData, error: tickerError } = await supabase
        .from('ticker_universe')
        .select('symbol')
        .eq('active', true)
        .order('symbol');

      // Also get symbols that have recent sentiment data
      const { data: sentimentData, error: sentimentError } = await supabase
        .from('v_reddit_daily_signals')
        .select('symbol')
        .order('symbol');

      if (tickerError && sentimentError) {
        throw new Error('Failed to fetch symbols from both sources');
      }

      // Combine both sources and remove duplicates
      const tickerSymbols = tickerData?.map(item => item.symbol) || [];
      const sentimentSymbols = sentimentData?.map(item => item.symbol) || [];
      const allSymbols = [...new Set([...tickerSymbols, ...sentimentSymbols])];
      
      setAvailableSymbols(allSymbols.sort());
    } catch (error) {
      console.error('Error fetching symbols:', error);
    }
  };

  // Fetch sentiment history data
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      setDateRange({
        start: startDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        }),
        end: endDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        })
      });

      console.log('📊 Fetching sentiment history for:', selectedSymbol, 'from', startDateStr, 'to', endDateStr);

      // Fetch base sentiment data
      const { data: sentimentData, error: sentimentError } = await supabase
        .from('v_reddit_daily_signals')
        .select('trade_date, symbol, avg_score, used_score, n_mentions')
        .eq('symbol', selectedSymbol)
        .gte('trade_date', startDateStr)
        .lte('trade_date', endDateStr)
        .order('trade_date', { ascending: true });

      if (sentimentError) throw sentimentError;

      // Fetch velocity data (optional) - skip for now as table doesn't exist
      // const { data: velocityData, error: velocityError } = await supabase
      //   .from('v_today_velocity_ranked')
      //   .select('symbol, z_score_score, delta_mentions, rank')
      //   .eq('symbol', selectedSymbol)
      //   .order('rank', { ascending: true });

      // Velocity errors are non-fatal
      // if (velocityError) {
      //   console.warn('⚠️ Velocity data not available:', velocityError);
      // }

      // Merge the data (without velocity for now)
      const processedData = (sentimentData || []).map(item => {
        return {
          data_date: item.trade_date,
          symbol: item.symbol,
          avg_score: item.avg_score || 0,
          used_score: item.used_score || 0,
          n_mentions: item.n_mentions || 0,
          z_score_score: null, // velocity?.z_score_score || null,
          delta_mentions: null, // velocity?.delta_mentions || null,
        };
      });

      console.log('📊 Processed data points:', processedData.length);
      console.log('📊 Sample data:', processedData.slice(0, 3));
      console.log('📊 Chart mode:', chartMode);
      setHistoryData(processedData);

      if (processedData.length === 0) {
        setError(`No sentiment data found for ${selectedSymbol} in the last ${days} days.`);
      }
    } catch (error) {
      console.error('❌ Error fetching sentiment history:', error);
      setError('Failed to load sentiment history. Please try again.');
      toast({
        title: 'Data Fetch Error',
        description: 'Failed to load sentiment history. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    fetchAvailableSymbols();
  }, []);

  useEffect(() => {
    if (selectedSymbol) {
      fetchData();
    }
  }, [selectedSymbol, days]);

  // Helper functions
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTooltipDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const hasSpike = data.z_score_score && Math.abs(data.z_score_score) > 2;

      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{formatTooltipDate(label)}</p>
          <div className="space-y-1 mt-2">
            <p className="text-sm">
              <span className="font-medium">Score:</span> {data.avg_score?.toFixed(3) || 'N/A'}
            </p>
            <p className="text-sm">
              <span className="font-medium">Mentions:</span> {data.n_mentions?.toLocaleString() || 'N/A'}
            </p>
            {data.z_score_score && (
              <p className="text-sm">
                <span className="font-medium">Z-Score:</span> {data.z_score_score.toFixed(2)}
              </p>
            )}
            {data.delta_mentions && (
              <p className="text-sm">
                <span className="font-medium">Δ Mentions:</span> {data.delta_mentions > 0 ? '+' : ''}{data.delta_mentions.toLocaleString()}
              </p>
            )}
            {hasSpike && (
              <Badge variant="destructive" className="text-xs">
                Velocity Spike
              </Badge>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Render spike dots for significant velocity changes
  const renderSpikeDots = () => {
    if (!historyData) return null;

    return historyData
      .filter(item => item.z_score_score && Math.abs(item.z_score_score) > 2)
      .map((item, index) => (
        <ReferenceDot
          key={`spike-${index}`}
          x={item.data_date}
          y={item.avg_score}
          r={4}
          fill="#ef4444"
          stroke="#ffffff"
          strokeWidth={2}
        />
      ));
  };

  // Calculate summary stats
  const summaryStats = React.useMemo(() => {
    if (historyData.length === 0) return null;

    const totalMentions = historyData.reduce((sum, item) => sum + item.n_mentions, 0);
    const avgScore = historyData.reduce((sum, item) => sum + item.avg_score, 0) / historyData.length;
    const positiveCount = historyData.filter(item => item.avg_score > 0).length;
    const negativeCount = historyData.filter(item => item.avg_score < 0).length;
    const neutralCount = historyData.length - positiveCount - negativeCount;

    return {
      totalMentions,
      avgScore,
      positiveCount,
      negativeCount,
      neutralCount,
      totalDays: historyData.length
    };
  }, [historyData]);

  const handleRefresh = () => {
    fetchData();
    toast({
      title: 'Data Refreshed',
      description: `Updated sentiment history for ${selectedSymbol}`,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sentiment History</h1>
          <p className="text-muted-foreground">
            {dateRange.start && dateRange.end ? `${dateRange.start} → ${dateRange.end}` : 'Historical sentiment analysis'}
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Symbol Picker with Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Symbol</label>
              <Popover open={symbolSearchOpen} onOpenChange={setSymbolSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={symbolSearchOpen}
                    className="w-full justify-between"
                  >
                    {selectedSymbol || "Select symbol..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                  <Command>
                    <CommandInput placeholder="Search symbol..." />
                    <CommandList>
                      <CommandEmpty>No symbol found.</CommandEmpty>
                      <CommandGroup>
                        {availableSymbols.map((symbol) => (
                          <CommandItem
                            key={symbol}
                            value={symbol}
                            onSelect={(currentValue) => {
                              handleSymbolChange(currentValue.toUpperCase());
                              setSymbolSearchOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedSymbol === symbol ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            {symbol}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Time Window */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Window</label>
              <Select value={days.toString()} onValueChange={(value) => setDays(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Chart Display Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Chart Display</label>
              <Select value={chartMode} onValueChange={(value: 'both' | 'score' | 'mentions') => setChartMode(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Score + Mentions</SelectItem>
                  <SelectItem value="score">Score Only</SelectItem>
                  <SelectItem value="mentions">Mentions Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Summary Stats */}
            {summaryStats && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Summary</label>
                <div className="text-sm text-muted-foreground">
                  {summaryStats.totalMentions.toLocaleString()} mentions over {summaryStats.totalDays} days
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            {selectedSymbol} Sentiment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-96 flex items-center justify-center">
              <div className="text-center space-y-4">
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-64 w-full" />
              </div>
            </div>
          ) : error ? (
            <div className="h-96 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                  <History className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-medium">No Data Available</h3>
                  <p className="text-muted-foreground">{error}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={historyData}
                  margin={{ top: 20, right: chartMode === 'both' ? 30 : 20, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="data_date" 
                    tickFormatter={formatDate}
                    className="text-xs"
                  />
                  
                  {/* Score Y-Axis (left) */}
                  {(chartMode === 'both' || chartMode === 'score') && (
                    <YAxis 
                      yAxisId="score"
                      orientation="left"
                      domain={[-1, 1]}
                      className="text-xs"
                      label={{ value: 'Sentiment Score', angle: -90, position: 'insideLeft' }}
                    />
                  )}
                  
                  {/* Mentions Y-Axis (right) */}
                  {(chartMode === 'both' || chartMode === 'mentions') && (
                    <YAxis 
                      yAxisId="mentions"
                      orientation={chartMode === 'both' ? 'right' : 'left'}
                      className="text-xs"
                      label={{ value: 'Mentions', angle: 90, position: chartMode === 'both' ? 'insideRight' : 'insideLeft' }}
                    />
                  )}
                  
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* Zero line for sentiment score */}
                  {(chartMode === 'both' || chartMode === 'score') && (
                    <ReferenceLine y={0} yAxisId="score" stroke="#64748b" strokeDasharray="2 2" />
                  )}
                  
                  {/* Mention bars */}
                  {(chartMode === 'both' || chartMode === 'mentions') && (
                    <Bar
                      yAxisId="mentions"
                      dataKey="n_mentions"
                      fill="#8884d8"
                      fillOpacity={chartMode === 'mentions' ? 0.8 : 0.3}
                      radius={[2, 2, 0, 0]}
                      name="Mentions"
                    />
                  )}
                  
                  {/* Sentiment score line */}
                  {(chartMode === 'both' || chartMode === 'score') && (
                    <Line
                      yAxisId="score"
                      type="monotone"
                      dataKey="avg_score"
                      stroke="#82ca9d"
                      strokeWidth={chartMode === 'score' ? 3 : 2}
                      dot={{ fill: '#82ca9d', strokeWidth: 2, r: chartMode === 'score' ? 4 : 3 }}
                      activeDot={{ r: 6, stroke: '#82ca9d', strokeWidth: 2 }}
                      name="Sentiment Score"
                    />
                  )}
                  
                  {/* Velocity spike indicators */}
                  {renderSpikeDots()}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats Card */}
      {summaryStats && (
        <Card>
          <CardHeader>
            <CardTitle>Period Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{summaryStats.totalMentions.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Mentions</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${summaryStats.avgScore > 0 ? 'text-green-600' : summaryStats.avgScore < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {summaryStats.avgScore.toFixed(3)}
                </div>
                <div className="text-sm text-muted-foreground">Avg Score</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{summaryStats.positiveCount}</div>
                <div className="text-sm text-muted-foreground">Bullish Days</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{summaryStats.negativeCount}</div>
                <div className="text-sm text-muted-foreground">Bearish Days</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-muted-foreground">{summaryStats.neutralCount}</div>
                <div className="text-sm text-muted-foreground">Neutral Days</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SentimentHistoryPage;