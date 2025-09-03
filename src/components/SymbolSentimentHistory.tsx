import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine } from 'recharts';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp } from 'lucide-react';

interface SymbolSentimentHistoryProps {
  symbol: string;
  days?: number;
  withVelocity?: boolean;
}

interface DateRange {
  start_date: string | null;
  end_date: string | null;
}

interface SentimentHistoryData {
  data_date: string;
  symbol: string;
  avg_score: number;
  used_score: number;
  n_mentions: number;
  z_score_score?: number;
  delta_mentions?: number;
}

const SymbolSentimentHistory: React.FC<SymbolSentimentHistoryProps> = ({
  symbol,
  days = 30,
  withVelocity = false
}) => {
  const [dateRange, setDateRange] = useState<DateRange>({ start_date: null, end_date: null });
  const [historyData, setHistoryData] = useState<SentimentHistoryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [symbol, days, withVelocity]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get max date from sentiment history for date range calculation
      const { data: maxDateData } = await supabase
        .from('v_sentiment_history' as any)
        .select('data_date')
        .order('data_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!(maxDateData as any)?.data_date) {
        setHistoryData([]);
        return;
      }

      const endDate = (maxDateData as any).data_date;
      const endDateObj = new Date(endDate);
      const startDateObj = new Date(endDateObj);
      startDateObj.setDate(startDateObj.getDate() - (days - 1));
      const startDate = startDateObj.toISOString().split('T')[0];

      setDateRange({
        start_date: startDate,
        end_date: endDate
      });

      // Query sentiment history data
      const { data: historyData, error: historyError } = await supabase
        .from('v_sentiment_history' as any)
        .select('*')
        .ilike('symbol', symbol)
        .gte('data_date', startDate)
        .lte('data_date', endDate)
        .order('data_date', { ascending: true });

      if (historyError) throw historyError;

      let velocityData: any[] = [];
      
      if (withVelocity) {
        // Query velocity data separately
        const { data: velocityResults } = await supabase
          .from('v_sentiment_velocity_lite' as any)
          .select('*')
          .ilike('symbol', symbol)
          .gte('data_date', startDate)
          .lte('data_date', endDate);
        
        velocityData = velocityResults || [];
      }

      // Transform and merge the data
      const transformedData = (historyData || []).map((item: any) => {
        const velocityItem = velocityData.find(v => 
          v.data_date === item.data_date && 
          v.symbol.toLowerCase() === item.symbol.toLowerCase()
        );

        return {
          data_date: item.data_date,
          symbol: item.symbol,
          avg_score: item.avg_score,
          used_score: item.used_score || item.avg_score,
          n_mentions: item.n_mentions,
          z_score_score: withVelocity ? velocityItem?.z_score_score : undefined,
          delta_mentions: withVelocity ? velocityItem?.delta_mentions : undefined
        };
      });

      setHistoryData(transformedData as SentimentHistoryData[]);
    } catch (error) {
      console.error('Error fetching sentiment history:', error);
      setError('Failed to load sentiment history data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  };

  const formatTooltipDate = (dateStr: string) => {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0]?.payload;
    if (!data) return null;

    const isSpike = withVelocity && (
      (data.z_score_score && data.z_score_score >= 1.5) ||
      (data.delta_mentions && data.delta_mentions >= 5)
    );

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-card-foreground">{formatTooltipDate(label)}</p>
        <div className="space-y-1 mt-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Score:</span>{' '}
            <span className="font-medium">{data.avg_score?.toFixed(2) || '0.00'}</span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Mentions:</span>{' '}
            <span className="font-medium">{data.n_mentions || 0}</span>
          </p>
          {withVelocity && (data.z_score_score !== null || data.delta_mentions !== null) && (
            <div className="space-y-1 pt-1 border-t border-border">
              {data.z_score_score !== null && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Δscore z:</span>{' '}
                  <span className="font-medium">{data.z_score_score.toFixed(1)}σ</span>
                </p>
              )}
              {data.delta_mentions !== null && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Δmentions:</span>{' '}
                  <span className="font-medium">{data.delta_mentions}</span>
                </p>
              )}
              {isSpike && (
                <Badge variant="secondary" className="text-xs mt-1">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Spike
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSpikeDots = () => {
    if (!withVelocity) return null;

    return historyData
      .filter(d => 
        (d.z_score_score && d.z_score_score >= 1.5) ||
        (d.delta_mentions && d.delta_mentions >= 5)
      )
      .map((spike, index) => (
        <ReferenceLine
          key={`spike-${index}`}
          x={spike.data_date}
          yAxisId="sentiment"
          stroke="hsl(var(--destructive))"
          strokeDasharray="2 2"
          strokeWidth={1}
        />
      ));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading {symbol.toUpperCase()} Sentiment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{symbol.toUpperCase()} Sentiment History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <p className="text-muted-foreground">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (historyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{symbol.toUpperCase()} Sentiment History</CardTitle>
          {dateRange.start_date && dateRange.end_date && (
            <p className="text-sm text-muted-foreground">
              {formatDate(dateRange.start_date)} → {formatDate(dateRange.end_date)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <p className="text-muted-foreground">
              No sentiment data for {symbol.toUpperCase()} in the last {days} trading days.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {symbol.toUpperCase()} Sentiment History
          {withVelocity && (
            <Badge variant="outline" className="text-xs">
              With Velocity
            </Badge>
          )}
        </CardTitle>
        {dateRange.start_date && dateRange.end_date && (
          <p className="text-sm text-muted-foreground">
            {formatDate(dateRange.start_date)} → {formatDate(dateRange.end_date)}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={historyData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="data_date"
                tickFormatter={formatDate}
                className="text-xs"
              />
              <YAxis 
                yAxisId="sentiment"
                orientation="left"
                domain={[-1, 1]}
                className="text-xs"
              />
              <YAxis 
                yAxisId="mentions"
                orientation="right"
                className="text-xs"
              />
              <Tooltip content={<CustomTooltip />} />
              
              <Bar
                yAxisId="mentions"
                dataKey="n_mentions"
                fill="hsl(var(--muted))"
                opacity={0.6}
                name="Mentions"
              />
              
              <Line
                yAxisId="sentiment"
                type="monotone"
                dataKey="avg_score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                name="Sentiment Score"
              />
              
              {renderSpikeDots()}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default SymbolSentimentHistory;