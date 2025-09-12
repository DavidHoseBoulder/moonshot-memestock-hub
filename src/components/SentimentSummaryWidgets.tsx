import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';

interface TodaySummaryProps {
  selectedSymbol?: string | null;
}

export const TodaySentimentSummary: React.FC<TodaySummaryProps> = ({ selectedSymbol }) => {
  const [topSymbols, setTopSymbols] = useState<Array<{symbol: string, score: number, mentions: number}>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTodaysSentiment = async () => {
      setIsLoading(true);
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('v_reddit_daily_signals')
          .select('symbol, avg_score, n_mentions')
          .eq('trade_date', today)
          .gte('n_mentions', 3)
          .order('n_mentions', { ascending: false })
          .limit(3);

        if (data) {
          setTopSymbols(data.map(item => ({
            symbol: item.symbol,
            score: item.avg_score || 0,
            mentions: item.n_mentions || 0
          })));
        }
      } catch (error) {
        console.error('Error fetching today sentiment:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTodaysSentiment();
  }, []);

  if (isLoading) {
    return <div className="space-y-1"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /></div>;
  }

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="font-medium text-foreground">Top Mentions Today:</div>
      {topSymbols.slice(0, 2).map(item => (
        <div key={item.symbol} className="flex items-center justify-between">
          <span className={selectedSymbol === item.symbol ? "text-primary font-medium" : ""}>{item.symbol}</span>
          <div className="flex items-center gap-1">
            <span>{item.mentions}</span>
            {item.score > 0.1 ? <TrendingUp className="w-3 h-3 text-bull" /> : 
             item.score < -0.1 ? <TrendingDown className="w-3 h-3 text-bear" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
};

export const VelocitySentimentSummary: React.FC<TodaySummaryProps> = () => {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="font-medium text-foreground">Velocity Tracking:</div>
      <div className="flex items-center gap-1">
        <BarChart3 className="w-3 h-3" />
        <span>Requires intraday pipeline</span>
      </div>
      <div>Coming soon...</div>
    </div>
  );
};

export const HistorySentimentSummary: React.FC<TodaySummaryProps> = ({ selectedSymbol }) => {
  const [trendData, setTrendData] = useState<{symbol: string, trend: 'up' | 'down' | 'stable'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedSymbol) return;

    const fetchTrend = async () => {
      setIsLoading(true);
      try {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const { data, error } = await supabase
          .from('v_reddit_daily_signals')
          .select('avg_score, trade_date')
          .eq('symbol', selectedSymbol)
          .gte('trade_date', format(startDate, 'yyyy-MM-dd'))
          .lte('trade_date', format(endDate, 'yyyy-MM-dd'))
          .order('trade_date', { ascending: true });

        if (data && data.length >= 2) {
          const first = data[0].avg_score || 0;
          const last = data[data.length - 1].avg_score || 0;
          const diff = last - first;
          
          setTrendData({
            symbol: selectedSymbol,
            trend: diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : 'stable'
          });
        }
      } catch (error) {
        console.error('Error fetching trend:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrend();
  }, [selectedSymbol]);

  if (isLoading) {
    return <div className="space-y-1"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>;
  }

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="font-medium text-foreground">7-Day Trend:</div>
      {selectedSymbol && trendData ? (
        <div className="flex items-center gap-1">
          <span className="font-medium">{selectedSymbol}</span>
          {trendData.trend === 'up' ? <TrendingUp className="w-3 h-3 text-bull" /> :
           trendData.trend === 'down' ? <TrendingDown className="w-3 h-3 text-bear" /> :
           <span className="text-neutral">→</span>}
          <Badge variant="outline" className="text-xs">{trendData.trend}</Badge>
        </div>
      ) : (
        <div>Select a symbol to see trend</div>
      )}
    </div>
  );
};