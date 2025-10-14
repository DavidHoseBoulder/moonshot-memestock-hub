import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2,
  XCircle,
  Info
} from 'lucide-react';

interface HVVSymbol {
  symbol: string;
  data_date: string;
  price_close: number;
  adv30: number;
  vol: number;
  vol70: number;
  is_hvv: boolean;
}

interface HVVMetrics {
  total_symbols: number;
  avg_sharpe: number;
  avg_win_rate: number;
  total_candidates: number;
}

interface FallenSymbol {
  symbol: string;
  last_hvv_date: string;
  current_price: number;
  current_adv30: number;
  fail_reason: string;
}

const HVVMonitoring = () => {
  const [loading, setLoading] = useState(true);
  const [currentHVV, setCurrentHVV] = useState<HVVSymbol[]>([]);
  const [metrics90d, setMetrics90d] = useState<HVVMetrics | null>(null);
  const [fallenSymbols, setFallenSymbols] = useState<FallenSymbol[]>([]);
  const [failedRecos, setFailedRecos] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchHVVData();
  }, []);

  const fetchHVVData = async () => {
    setLoading(true);
    try {
      // Current HVV universe - use type assertion since hvv_universe_daily exists but isn't in generated types
      const { data: hvvData, error: hvvError } = await supabase
        .from('hvv_universe_daily' as any)
        .select('*')
        .eq('is_hvv', true)
        .order('data_date', { ascending: false })
        .limit(100) as { data: HVVSymbol[] | null; error: any };

      if (hvvError) throw hvvError;

      // Get most recent date
      const latestDate = hvvData && hvvData.length > 0 
        ? hvvData[0].data_date 
        : null;

      // Filter to most recent date only
      const currentData = hvvData?.filter(d => d.data_date === latestDate) || [];
      setCurrentHVV(currentData);

      // 90-day metrics from backtest_sweep_grid
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: metricsData, error: metricsError } = await supabase
        .from('backtest_sweep_grid')
        .select('trades, sharpe, win_rate')
        .gte('end_date', ninetyDaysAgo.toISOString().split('T')[0])
        .not('sharpe', 'is', null);

      if (metricsError) throw metricsError;

      if (metricsData && metricsData.length > 0) {
        const totalTrades = metricsData.reduce((sum, m) => sum + (m.trades || 0), 0);
        const avgSharpe = metricsData.reduce((sum, m) => sum + (m.sharpe || 0), 0) / metricsData.length;
        const avgWinRate = metricsData.reduce((sum, m) => sum + (m.win_rate || 0), 0) / metricsData.length;

        setMetrics90d({
          total_symbols: currentData.length,
          avg_sharpe: avgSharpe,
          avg_win_rate: avgWinRate,
          total_candidates: totalTrades
        });
      }

      // Symbols that recently fell out (were HVV 7-30 days ago, not now)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentHVV, error: recentError } = await supabase
        .from('hvv_universe_daily' as any)
        .select('symbol, data_date, price_close, adv30, is_hvv')
        .eq('is_hvv', true)
        .gte('data_date', thirtyDaysAgo.toISOString().split('T')[0])
        .lte('data_date', sevenDaysAgo.toISOString().split('T')[0]) as { 
          data: Array<{
            symbol: string;
            data_date: string;
            price_close: number;
            adv30: number;
            is_hvv: boolean;
          }> | null; 
          error: any 
        };

      if (recentError) throw recentError;

      // Check which of these are NOT in current HVV
      const currentSymbols = new Set(currentData.map(d => d.symbol));
      const fallen = recentHVV
        ?.filter(d => !currentSymbols.has(d.symbol))
        .reduce((acc, d) => {
          const existing = acc.find(f => f.symbol === d.symbol);
          if (!existing || new Date(d.data_date) > new Date(existing.last_hvv_date)) {
            return [
              ...acc.filter(f => f.symbol !== d.symbol),
              {
                symbol: d.symbol,
                last_hvv_date: d.data_date,
                current_price: d.price_close,
                current_adv30: d.adv30,
                fail_reason: d.price_close < 10 ? 'Price < $10' : 
                           d.adv30 < 200 ? 'ADV30 < $200M' : 'Vol percentile < 70th'
              }
            ];
          }
          return acc;
        }, [] as FallenSymbol[]) || [];

      setFallenSymbols(fallen);

      // Current recommendations that fail HVV (from v_recommended_trades_today_conf)
      const { data: recosData, error: recosError } = await supabase.rpc(
        'fn_recommended_trades_conf',
        { p_date: latestDate }
      );

      if (recosError) throw recosError;

      // Check which recommendations are NOT in HVV
      const failed = recosData
        ?.filter((r: any) => !currentSymbols.has(r.symbol))
        .map((r: any) => ({
          ...r,
          fail_reason: 'Not in HVV universe'
        })) || [];

      setFailedRecos(failed);

    } catch (error) {
      console.error('Error fetching HVV data:', error);
      toast({
        title: 'Error loading HVV data',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number | null) => 
    val !== null ? `$${val.toFixed(2)}` : 'N/A';

  const formatPercent = (val: number | null, decimals = 1) =>
    val !== null ? `${(val * 100).toFixed(decimals)}%` : 'N/A';

  const formatMillions = (val: number | null) =>
    val !== null ? `$${(val / 1e6).toFixed(0)}M` : 'N/A';

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">HVV Symbols</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentHVV.length}</div>
            <p className="text-xs text-muted-foreground">
              Qualify for High-Volume Volatility
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">90d Avg Sharpe</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics90d?.avg_sharpe.toFixed(2) || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Valid window performance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">90d Win Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPercent(metrics90d?.avg_win_rate || null)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all HVV candidates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fallen Symbols</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fallenSymbols.length}</div>
            <p className="text-xs text-muted-foreground">
              No longer qualify (7-30d ago)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="current" className="space-y-4">
        <TabsList>
          <TabsTrigger value="current">Current HVV Universe</TabsTrigger>
          <TabsTrigger value="fallen">Fallen Symbols</TabsTrigger>
          <TabsTrigger value="failed">Failed Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Current HVV Qualifying Symbols
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Symbols meeting: Price &gt; $10, ADV30 ≥ $200M, Vol ≥ 70th percentile
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">Symbol</th>
                      <th className="text-right py-2 px-4">Price</th>
                      <th className="text-right py-2 px-4">ADV30</th>
                      <th className="text-right py-2 px-4">Vol %ile</th>
                      <th className="text-right py-2 px-4">Daily Vol</th>
                      <th className="text-center py-2 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentHVV.map((sym) => (
                      <tr key={sym.symbol} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-4 font-mono font-semibold">{sym.symbol}</td>
                        <td className="text-right py-2 px-4">{formatCurrency(sym.price_close)}</td>
                        <td className="text-right py-2 px-4">{formatMillions(sym.adv30)}</td>
                        <td className="text-right py-2 px-4">
                          {sym.vol70 ? `${(sym.vol70 * 100).toFixed(0)}%` : 'N/A'}
                        </td>
                        <td className="text-right py-2 px-4">
                          {sym.vol ? `${(sym.vol * 100).toFixed(1)}%` : 'N/A'}
                        </td>
                        <td className="text-center py-2 px-4">
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Qualified
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fallen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Symbols That Recently Fell Out
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Were HVV-qualified 7-30 days ago, no longer meet criteria
              </p>
            </CardHeader>
            <CardContent>
              {fallenSymbols.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No symbols have fallen out of HVV in the past 7-30 days
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4">Symbol</th>
                        <th className="text-right py-2 px-4">Last HVV Date</th>
                        <th className="text-right py-2 px-4">Current Price</th>
                        <th className="text-right py-2 px-4">Current ADV30</th>
                        <th className="text-left py-2 px-4">Fail Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fallenSymbols.map((sym) => (
                        <tr key={sym.symbol} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-4 font-mono font-semibold">{sym.symbol}</td>
                          <td className="text-right py-2 px-4">{sym.last_hvv_date}</td>
                          <td className="text-right py-2 px-4">{formatCurrency(sym.current_price)}</td>
                          <td className="text-right py-2 px-4">{formatMillions(sym.current_adv30)}</td>
                          <td className="py-2 px-4">
                            <Badge variant="destructive">{sym.fail_reason}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Recommendations That Fail HVV
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Current recommendations that don't meet HVV screening criteria
              </p>
            </CardHeader>
            <CardContent>
              {failedRecos.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  All current recommendations meet HVV criteria
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4">Symbol</th>
                        <th className="text-center py-2 px-4">Side</th>
                        <th className="text-center py-2 px-4">Horizon</th>
                        <th className="text-right py-2 px-4">Confidence</th>
                        <th className="text-right py-2 px-4">Sharpe</th>
                        <th className="text-left py-2 px-4">Fail Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedRecos.map((reco, idx) => (
                        <tr key={`${reco.symbol}-${idx}`} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-4 font-mono font-semibold">{reco.symbol}</td>
                          <td className="text-center py-2 px-4">
                            <Badge variant={reco.side === 'LONG' ? 'default' : 'secondary'}>
                              {reco.side}
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-4">{reco.horizon}</td>
                          <td className="text-right py-2 px-4">{reco.confidence_score}%</td>
                          <td className="text-right py-2 px-4">
                            {reco.sharpe?.toFixed(2) || 'N/A'}
                          </td>
                          <td className="py-2 px-4">
                            <Badge variant="outline">{reco.fail_reason}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HVVMonitoring;
