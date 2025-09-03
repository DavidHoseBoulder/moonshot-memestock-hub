import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { todayInDenverDateString } from '@/utils/timezone';
import { 
  RefreshCw, 
  Target, 
  Eye, 
  BarChart3, 
  Beaker,
  TrendingUp, 
  TrendingDown, 
  Activity,
  DollarSign,
  ArrowRight
} from 'lucide-react';

// Types
interface HomeKPIs {
  header_as_of_date: string;
  kpi_as_of_date: string;
  candidates_as_of_date: string;
  signals_as_of_date: string;
  mode: string;
  open_positions: number;
  exposure_usd: number;
  unrealized_usd: number;
  unrealized_pct: number;
  closed_30d: number;
  hit_rate: number;
  realized_30d_usd: number;
  avg_realized_pct: number;
}

interface TriggeredCandidate {
  symbol: string;
  horizon: string;
  side: string;
  grade: 'Strong' | 'Moderate' | 'Weak';
  mentions: number;
  sharpe: number;
  avg_ret: number;
  win_rate: number;
  trades: number;
  start_date: string;
  end_date: string;
  notes: string | null;
  status: 'TRIGGERED' | 'Active' | 'Closed';
  isNew?: boolean;
}

interface MonitoringCandidate {
  symbol: string;
  horizon: string;
  mentions: number;
  score: number;
}

interface RedditSignal {
  symbol: string;
  mentions: number;
  score: number;
  sentiment: 'Bullish' | 'Neutral' | 'Bearish';
}

const RedditSentimentHomescreen = () => {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [tradingMode, setTradingMode] = useState<string>('paper'); // 'paper' | 'real' | 'all'
  const [kpiData, setKpiData] = useState<HomeKPIs | null>(null);
  const [triggeredCandidates, setTriggeredCandidates] = useState<TriggeredCandidate[]>([]);
  const [monitoringCandidates, setMonitoringCandidates] = useState<MonitoringCandidate[]>([]);
  const [redditSignals, setRedditSignals] = useState<RedditSignal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  // Helper functions
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatPercent = (value: number) => 
    `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

  const formatDate = (date: string) => 
    new Date(date + 'T12:00:00').toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

  const getStrengthOrder = (grade: string) => {
    const order = { 'Strong': 1, 'Moderate': 2, 'Weak': 3 };
    return order[grade as keyof typeof order] || 4;
  };

  const getHoldDays = (horizon: string): number => 
    parseInt(horizon.replace(/\D/g, ''), 10);

  // Data fetching functions
  const fetchKPIData = async () => {
    console.log('📊 Fetching KPI data from v_home_kpis...');
    try {
      const { data, error } = await supabase
        .from('v_home_kpis' as any)
        .select('*')
        .eq('mode', tradingMode)
        .maybeSingle();

      if (error) {
        console.error('❌ KPI query error:', error);
        throw error;
      }

      console.log('📊 KPI data received:', data);
      setKpiData(data as unknown as HomeKPIs | null);
    } catch (error) {
      console.error('❌ Error fetching KPI data:', error);
      setKpiData(null);
    }
  };

  const fetchTriggeredCandidates = async () => {
    console.log('🎯 Fetching triggered candidates from v_triggered_with_backtest...');
    try {
      const { data, error } = await supabase
        .from('v_triggered_with_backtest' as any)
        .select('*')
        .order('sharpe', { ascending: false })
        .limit(20);

      if (error) {
        console.error('❌ Triggered candidates query error:', error);
        throw error;
      }

      console.log('🎯 Triggered candidates received:', data?.length || 0, 'items');

      if (!data || data.length === 0) {
        setTriggeredCandidates([]);
        return;
      }

      const processed = data.map((item: any) => {
        let grade: 'Strong' | 'Moderate' | 'Weak' = 'Weak';
        const sharpe = item.sharpe || 0;
        const trades = item.trades || 0;
        
        if (sharpe >= 2.0 && trades >= 6) {
          grade = 'Strong';
        } else if (sharpe >= 1.0 && trades >= 4) {
          grade = 'Moderate';
        }

        return {
          symbol: item.symbol,
          horizon: item.horizon || '',
          side: item.side || 'LONG',
          grade,
          mentions: item.mentions || 0,
          sharpe: sharpe,
          avg_ret: item.avg_ret || 0,
          win_rate: item.win_rate || 0,
          trades: trades,
          start_date: item.start_date || '',
          end_date: item.end_date || '',
          notes: item.notes,
          status: 'TRIGGERED' as 'TRIGGERED' | 'Active' | 'Closed',
          isNew: true,
        };
      });

      setTriggeredCandidates(processed);
      console.log('✅ Triggered candidates processed:', processed.length);
    } catch (error) {
      console.error('❌ Error fetching triggered candidates:', error);
      setTriggeredCandidates([]);
    }
  };

  const fetchMonitoringCandidates = async () => {
    console.log('👀 Fetching monitoring candidates from v_reddit_monitoring_signals...');
    try {
      // Get triggered symbols first
      const { data: triggeredData } = await supabase
        .from('v_triggered_with_backtest' as any)
        .select('symbol');
      
      const triggeredSymbols = triggeredData?.map((item: any) => item.symbol) || [];

      // Get monitoring signals excluding triggered symbols
      let query = supabase
        .from('v_reddit_monitoring_signals' as any)
        .select('*')
        .gte('n_mentions', 3);

      if (triggeredSymbols.length > 0) {
        query = query.not('symbol', 'in', `(${triggeredSymbols.join(',')})`);
      }

      const { data, error } = await query
        .order('sig_score', { ascending: false })
        .limit(8);

      if (error) {
        console.error('❌ Monitoring candidates query error:', error);
        throw error;
      }

      console.log('👀 Monitoring candidates received:', data?.length || 0, 'items');

      if (data) {
        const processed = data.map((item: any) => ({
          symbol: item.symbol,
          horizon: '', // No horizon in monitoring view
          mentions: item.n_mentions || 0,
          score: item.used_score || 0,
        }));

        setMonitoringCandidates(processed);
      } else {
        setMonitoringCandidates([]);
      }
    } catch (error) {
      console.error('❌ Error fetching monitoring candidates:', error);
      setMonitoringCandidates([]);
    }
  };

  const fetchRedditSignals = async () => {
    console.log('📈 Fetching reddit signals from v_reddit_daily_signals...');
    try {
      const { data, error } = await supabase
        .from('v_reddit_daily_signals' as any)
        .select('*')
        .gte('n_mentions', 2)
        .order('avg_score', { ascending: false })
        .limit(20);

      if (error) {
        console.error('❌ Reddit signals query error:', error);
        throw error;
      }

      console.log('📈 Reddit signals received:', data?.length || 0, 'items');

      if (data) {
        const processed = data.map((item: any) => {
          const score = item.avg_score || 0;
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
            mentions: item.n_mentions || 0,
            score: score,
            sentiment: sentiment,
          };
        });

        setRedditSignals(processed);
      } else {
        setRedditSignals([]);
      }
    } catch (error) {
      console.error('❌ Error fetching reddit signals:', error);
      setRedditSignals([]);
    }
  };

  const fetchAllData = async () => {
    setIsLoading(true);
    console.log('🏠 Homescreen: Starting data fetch...');
    
    try {
      const results = await Promise.allSettled([
        fetchKPIData(),
        fetchTriggeredCandidates(),
        fetchMonitoringCandidates(),
        fetchRedditSignals(),
      ]);
      
      // Log which queries succeeded/failed
      const queryNames = ['KPI Data', 'Triggered Candidates', 'Monitoring Candidates', 'Reddit Signals'];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`❌ ${queryNames[index]} failed:`, result.reason);
        } else {
          console.log(`✅ ${queryNames[index]} completed successfully`);
        }
      });
      
    } catch (error) {
      console.error('🏠 Homescreen: Unexpected error in fetchAllData:', error);
    } finally {
      setLastUpdated(new Date());
      setIsLoading(false);
      console.log('🏠 Homescreen: Data fetch completed');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAllData();
    setIsRefreshing(false);
    toast({
      title: 'Data Refreshed',
      description: `Updated at ${lastUpdated.toLocaleTimeString()}`,
    });
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Group triggered candidates by symbol
  const groupedCandidates = triggeredCandidates.reduce((acc, candidate) => {
    if (!acc[candidate.symbol]) {
      acc[candidate.symbol] = [];
    }
    acc[candidate.symbol].push(candidate);
    return acc;
  }, {} as Record<string, TriggeredCandidate[]>);

  // Sort symbols by best grade and sharpe
  const sortedSymbols = Object.keys(groupedCandidates).sort((a, b) => {
    const aGrades = groupedCandidates[a].map(c => getStrengthOrder(c.grade));
    const bGrades = groupedCandidates[b].map(c => getStrengthOrder(c.grade));
    const aBestGrade = Math.min(...aGrades);
    const bBestGrade = Math.min(...bGrades);
    
    if (aBestGrade !== bBestGrade) {
      return aBestGrade - bBestGrade;
    }
    
    const aBestSharpe = Math.max(...groupedCandidates[a].map(c => c.sharpe));
    const bBestSharpe = Math.max(...groupedCandidates[b].map(c => c.sharpe));
    return bBestSharpe - aBestSharpe;
  });

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Meme Trading Homepage</h1>
          <p className="text-muted-foreground">
            Last updated {lastUpdated.toLocaleTimeString()} • Market closed — showing last trading day ({kpiData ? formatDate(kpiData.header_as_of_date) : '...'})
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/trades')}
          title={kpiData ? `KPIs as of ${formatDate(kpiData.kpi_as_of_date)}` : undefined}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Positions</p>
                <div className="flex items-baseline gap-2">
                  {kpiData ? (
                    <>
                      <p className="text-2xl font-bold">{kpiData.open_positions}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(kpiData.exposure_usd)}
                      </p>
                    </>
                  ) : (
                    <Skeleton className="h-8 w-16" />
                  )}
                </div>
              </div>
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/trades')}
          title={kpiData ? `KPIs as of ${formatDate(kpiData.kpi_as_of_date)}` : undefined}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unrealized P&L</p>
                {kpiData ? (
                  <>
                    <p className={`text-2xl font-bold ${
                      kpiData.unrealized_usd >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(kpiData.unrealized_usd)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatPercent(kpiData.unrealized_pct)}
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-8 w-20" />
                )}
              </div>
              <DollarSign className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/trades')}
          title={kpiData ? `KPIs as of ${formatDate(kpiData.kpi_as_of_date)}` : undefined}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Closed (30d)</p>
                <div className="flex items-baseline gap-2">
                  {kpiData ? (
                    <>
                      <p className="text-2xl font-bold">{kpiData.closed_30d}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatPercent(kpiData.hit_rate)} hit
                      </p>
                    </>
                  ) : (
                    <Skeleton className="h-8 w-16" />
                  )}
                </div>
              </div>
              <Target className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/trades')}
          title={kpiData ? `KPIs as of ${formatDate(kpiData.kpi_as_of_date)}` : undefined}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Realized (30d)</p>
                {kpiData ? (
                  <>
                    <p className={`text-2xl font-bold ${
                      kpiData.realized_30d_usd >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(kpiData.realized_30d_usd)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      avg {formatPercent(kpiData.avg_realized_pct)}
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-8 w-20" />
                )}
              </div>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Triggered Candidates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Today's Triggered Candidates
              </CardTitle>
              {kpiData && (
                <p className="text-sm text-muted-foreground mt-1">
                  Candidates as of {formatDate(kpiData.candidates_as_of_date)}
                </p>
              )}
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/triggered-candidates')}
            >
              View All
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : sortedSymbols.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No triggered candidates today</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedSymbols.slice(0, 5).map(symbol => {
                const candidates = groupedCandidates[symbol];
                const bestCandidate = candidates[0];
                
                return (
                  <div key={symbol} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold">{symbol}</h3>
                        <Badge variant={bestCandidate.status === 'TRIGGERED' ? 'default' : 'outline'}>
                          {bestCandidate.status}
                        </Badge>
                        {bestCandidate.isNew && (
                          <Badge variant="secondary" className="text-xs">New</Badge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/sentiment-dashboard?symbol=${symbol}`)}
                      >
                        View
                      </Button>
                    </div>
                    
                    {/* Horizons */}
                    <div className="space-y-2">
                      {candidates.map((candidate, idx) => {
                        const holdDays = getHoldDays(candidate.horizon);
                        
                        return (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{candidate.horizon}</span>
                              <Badge 
                                variant={candidate.grade === 'Strong' ? 'default' : 
                                        candidate.grade === 'Moderate' ? 'outline' : 'secondary'}
                                className="text-xs"
                              >
                                {candidate.grade}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Trades={candidate.trades} • Avg {formatPercent(candidate.avg_ret)} • 
                              Win {formatPercent(candidate.win_rate)} • Sharpe {candidate.sharpe.toFixed(1)} ({formatDate(candidate.start_date)}—{formatDate(candidate.end_date)})
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Notes */}
                    {bestCandidate.notes && bestCandidate.notes.trim().length > 0 && (
                      <div className="mt-3 text-xs text-muted-foreground border-t pt-2">
                        <div className="line-clamp-2">{bestCandidate.notes}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monitoring & Today's Reddit Signals Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monitoring */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Monitoring
              </CardTitle>
              {kpiData && (
                <p className="text-sm text-muted-foreground mt-1">
                  Signals as of {formatDate(kpiData.signals_as_of_date)}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : monitoringCandidates.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No candidates under monitoring</p>
              </div>
            ) : (
              <div className="space-y-3">
                {monitoringCandidates.map((candidate, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded"
                    onClick={() => navigate(`/sentiment-dashboard?symbol=${candidate.symbol}`)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{candidate.symbol}</span>
                      <span className="text-sm text-muted-foreground">{candidate.horizon}</span>
                    </div>
                     <div className="flex items-center gap-2">
                       <span className="text-sm">{candidate.mentions} mentions</span>
                       <span className="text-sm font-medium">{candidate.score.toFixed(2)}</span>
                       <Badge 
                         variant={candidate.score >= 0.15 ? 'default' : 
                                 candidate.score <= -0.15 ? 'destructive' : 'outline'}
                         className="text-xs"
                       >
                         {candidate.score >= 0.15 ? 'Bullish' : 
                          candidate.score <= -0.15 ? 'Bearish' : 'Neutral'}
                       </Badge>
                     </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Reddit Signals */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Today's Reddit Signals
              </CardTitle>
              {kpiData && (
                <p className="text-sm text-muted-foreground mt-1">
                  Signals as of {formatDate(kpiData.signals_as_of_date)}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex-shrink-0 p-3 border rounded-lg w-32">
                    <Skeleton className="h-4 w-12 mb-2" />
                    <Skeleton className="h-3 w-16 mb-1" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {redditSignals.slice(0, 10).map((signal, idx) => (
                  <div 
                    key={idx}
                    className="flex-shrink-0 p-3 border rounded-lg cursor-pointer hover:shadow-md transition-shadow min-w-[120px]"
                    onClick={() => navigate(`/sentiment-dashboard?symbol=${signal.symbol}`)}
                  >
                    <div className="font-medium text-sm">{signal.symbol}</div>
                    <div className="text-xs text-muted-foreground">{signal.mentions} mentions</div>
                    <div className="text-xs font-medium">{signal.score.toFixed(2)}</div>
                    <Badge 
                      variant={signal.sentiment === 'Bullish' ? 'default' : 
                              signal.sentiment === 'Bearish' ? 'destructive' : 'outline'}
                      className="text-xs mt-1"
                    >
                      {signal.sentiment}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Backtesting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beaker className="w-5 h-5" />
            Backtesting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-medium">Run New Backtest</p>
              <p className="text-sm text-muted-foreground">
                Last used: TSLA • 5d horizon
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => navigate('/backtesting')}
              >
                Manual
              </Button>
              <Button onClick={() => navigate('/backtesting')}>
                AI Optimize
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RedditSentimentHomescreen;