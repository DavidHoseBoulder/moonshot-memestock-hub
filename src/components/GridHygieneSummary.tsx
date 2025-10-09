import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, Cell, Legend } from "recharts";
import { Loader2, TrendingUp, Database } from "lucide-react";

interface GridRow {
  symbol: string;
  horizon: string;
  side: string;
  min_mentions: number;
  pos_thresh: number;
  band?: string;
  trades: number;
  avg_ret: number;
  sharpe: number;
  win_rate: number;
  avg_daily_dollar_volume_30d?: number;
  avg_sentiment_health_score?: number;
  avg_beta_vs_spy?: number;
  avg_rsi_14?: number;
  avg_volume_ratio_avg_20?: number;
  avg_volume_share_20?: number;
  avg_volume_zscore_20?: number;
  baseline_naive_avg_ret?: number;
  baseline_naive_trades?: number;
  baseline_random_avg_ret?: number;
  baseline_random_trades?: number;
  uplift?: number;
  uplift_random?: number;
  start_date?: string;
  end_date?: string;
  model_version?: string;
}

interface PromotedKey {
  symbol: string;
  horizon: string;
  side: string;
  min_mentions: number;
  pos_thresh: number;
}

interface HorizonSummary {
  horizon: string;
  n: number;
  sharpe_avg: number;
  trades_avg: number;
  adv30_avg_bil: number;
  health_avg: number;
}

interface BandSummary {
  band: string;
  count: number;
  mean: number;
  max: number;
}

interface PromotedSummary {
  is_promoted: boolean;
  n: number;
  sharpe_avg: number;
  trades_avg: number;
  adv30_avg_bil: number;
  health_avg: number;
}

const GridHygieneSummary = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [modelVersion, setModelVersion] = useState("gpt-sent-v1");
  const [startDate, setStartDate] = useState("2025-06-01");
  const [endDate, setEndDate] = useState("2025-10-09");
  const [side, setSide] = useState("LONG");
  
  const [gridData, setGridData] = useState<GridRow[]>([]);
  const [promotedKeys, setPromotedKeys] = useState<Set<string>>(new Set());
  const [horizonSummary, setHorizonSummary] = useState<HorizonSummary[]>([]);
  const [bandSummary, setBandSummary] = useState<BandSummary[]>([]);
  const [promotedSummary, setPromotedSummary] = useState<PromotedSummary[]>([]);
  const [topPockets, setTopPockets] = useState<GridRow[]>([]);
  
  const { toast } = useToast();

  const fetchPromotedKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('backtest_sweep_results')
        .select('symbol, horizon, side, min_mentions, pos_thresh')
        .eq('model_version', modelVersion)
        .eq('start_date', startDate)
        .eq('end_date', endDate)
        .eq('side', side);

      if (error) throw error;

      const keySet = new Set<string>();
      data?.forEach(row => {
        const key = `${row.symbol}|${row.horizon}|${row.side}|${row.min_mentions}|${row.pos_thresh}`;
        keySet.add(key);
      });
      setPromotedKeys(keySet);
    } catch (error) {
      console.error('Error fetching promoted keys:', error);
    }
  };

  const fetchGridData = async () => {
    setIsLoading(true);
    try {
      await fetchPromotedKeys();

      const { data, error } = await supabase
        .from('backtest_sweep_grid')
        .select('*')
        .eq('model_version', modelVersion)
        .eq('start_date', startDate)
        .eq('end_date', endDate)
        .eq('side', side);

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: "No data found",
          description: "No grid results for the specified parameters",
          variant: "destructive",
        });
        setGridData([]);
        return;
      }

      setGridData(data as GridRow[]);
      computeSummaries(data as GridRow[]);

      toast({
        title: "Data loaded",
        description: `Found ${data.length} grid results`,
      });
    } catch (error) {
      console.error('Error fetching grid data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch grid data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isPromoted = (row: GridRow): boolean => {
    const key = `${row.symbol}|${row.horizon}|${row.side}|${row.min_mentions}|${row.pos_thresh}`;
    return promotedKeys.has(key);
  };

  const computeSummaries = (data: GridRow[]) => {
    // Horizon Summary
    const horizonMap = new Map<string, { count: number; sharpeSum: number; tradesSum: number; advSum: number; healthSum: number }>();
    data.forEach(row => {
      if (!horizonMap.has(row.horizon)) {
        horizonMap.set(row.horizon, { count: 0, sharpeSum: 0, tradesSum: 0, advSum: 0, healthSum: 0 });
      }
      const h = horizonMap.get(row.horizon)!;
      h.count++;
      h.sharpeSum += row.sharpe || 0;
      h.tradesSum += row.trades || 0;
      h.advSum += row.avg_daily_dollar_volume_30d || 0;
      h.healthSum += row.avg_sentiment_health_score || 0;
    });

    const horizonData: HorizonSummary[] = Array.from(horizonMap.entries()).map(([horizon, stats]) => ({
      horizon,
      n: stats.count,
      sharpe_avg: Number((stats.sharpeSum / stats.count).toFixed(3)),
      trades_avg: Number((stats.tradesSum / stats.count).toFixed(1)),
      adv30_avg_bil: Number(((stats.advSum / stats.count) / 1e9).toFixed(2)),
      health_avg: Number((stats.healthSum / stats.count).toFixed(2)),
    }));
    setHorizonSummary(horizonData);

    // Band Summary
    const bandMap = new Map<string, number[]>();
    data.forEach(row => {
      if (!bandMap.has(row.band)) {
        bandMap.set(row.band, []);
      }
      bandMap.get(row.band)!.push(row.sharpe || 0);
    });

    const bandData: BandSummary[] = Array.from(bandMap.entries()).map(([band, sharpes]) => ({
      band,
      count: sharpes.length,
      mean: Number((sharpes.reduce((a, b) => a + b, 0) / sharpes.length).toFixed(3)),
      max: Number(Math.max(...sharpes).toFixed(3)),
    }));
    setBandSummary(bandData);

    // Promoted vs Others
    const promotedRows = data.filter(row => isPromoted(row));
    const otherRows = data.filter(row => !isPromoted(row));

    const promotedData: PromotedSummary[] = [
      {
        is_promoted: false,
        n: otherRows.length,
        sharpe_avg: Number((otherRows.reduce((sum, r) => sum + (r.sharpe || 0), 0) / otherRows.length).toFixed(3)) || 0,
        trades_avg: Number((otherRows.reduce((sum, r) => sum + (r.trades || 0), 0) / otherRows.length).toFixed(1)) || 0,
        adv30_avg_bil: Number((otherRows.reduce((sum, r) => sum + (r.avg_daily_dollar_volume_30d || 0), 0) / otherRows.length / 1e9).toFixed(2)) || 0,
        health_avg: Number((otherRows.reduce((sum, r) => sum + (r.avg_sentiment_health_score || 0), 0) / otherRows.length).toFixed(2)) || 0,
      },
      {
        is_promoted: true,
        n: promotedRows.length,
        sharpe_avg: Number((promotedRows.reduce((sum, r) => sum + (r.sharpe || 0), 0) / promotedRows.length).toFixed(3)) || 0,
        trades_avg: Number((promotedRows.reduce((sum, r) => sum + (r.trades || 0), 0) / promotedRows.length).toFixed(1)) || 0,
        adv30_avg_bil: Number((promotedRows.reduce((sum, r) => sum + (r.avg_daily_dollar_volume_30d || 0), 0) / promotedRows.length / 1e9).toFixed(2)) || 0,
        health_avg: Number((promotedRows.reduce((sum, r) => sum + (r.avg_sentiment_health_score || 0), 0) / promotedRows.length).toFixed(2)) || 0,
      },
    ];
    setPromotedSummary(promotedData);

    // Top 20 pockets
    const sortedData = [...data].sort((a, b) => (b.sharpe || 0) - (a.sharpe || 0));
    setTopPockets(sortedData.slice(0, 20));
  };

  useEffect(() => {
    fetchGridData();
  }, []);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Database className="w-5 h-5" />
          Grid Hygiene Summary
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <Label htmlFor="model">Model Version</Label>
            <Input 
              id="model"
              value={modelVersion}
              onChange={(e) => setModelVersion(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="start">Start Date</Label>
            <Input 
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="end">End Date</Label>
            <Input 
              id="end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="side">Side</Label>
            <Select value={side} onValueChange={setSide}>
              <SelectTrigger id="side">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LONG">LONG</SelectItem>
                <SelectItem value="SHORT">SHORT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={fetchGridData} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            'Load Summary'
          )}
        </Button>
      </Card>

      {gridData.length > 0 && (
        <>
          {/* Horizon Summary */}
          <Card className="p-6">
            <h4 className="text-md font-bold mb-4">Horizon Summary</h4>
            <div className="mb-6">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={horizonSummary}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="horizon" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sharpe_avg" fill="hsl(var(--primary))" name="Avg Sharpe" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horizon</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Avg Sharpe</TableHead>
                  <TableHead className="text-right">Avg Trades</TableHead>
                  <TableHead className="text-right">ADV30 ($B)</TableHead>
                  <TableHead className="text-right">Health Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {horizonSummary.map(row => (
                  <TableRow key={row.horizon}>
                    <TableCell className="font-medium">{row.horizon}</TableCell>
                    <TableCell className="text-right">{row.n}</TableCell>
                    <TableCell className="text-right">{row.sharpe_avg}</TableCell>
                    <TableCell className="text-right">{row.trades_avg}</TableCell>
                    <TableCell className="text-right">{row.adv30_avg_bil}</TableCell>
                    <TableCell className="text-right">{row.health_avg}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Band Summary */}
          <Card className="p-6">
            <h4 className="text-md font-bold mb-4">Band vs Sharpe</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Band</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Mean Sharpe</TableHead>
                  <TableHead className="text-right">Max Sharpe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bandSummary.map(row => (
                  <TableRow key={row.band}>
                    <TableCell className="font-medium">{row.band}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{row.mean}</TableCell>
                    <TableCell className="text-right">{row.max}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Promoted vs Others */}
          <Card className="p-6">
            <h4 className="text-md font-bold mb-4">Promoted vs Others</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Avg Sharpe</TableHead>
                  <TableHead className="text-right">Avg Trades</TableHead>
                  <TableHead className="text-right">ADV30 ($B)</TableHead>
                  <TableHead className="text-right">Health Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotedSummary.map(row => (
                  <TableRow key={row.is_promoted ? 'promoted' : 'others'}>
                    <TableCell className="font-medium">
                      {row.is_promoted ? '✓ Promoted' : 'Others'}
                    </TableCell>
                    <TableCell className="text-right">{row.n}</TableCell>
                    <TableCell className="text-right">{row.sharpe_avg}</TableCell>
                    <TableCell className="text-right">{row.trades_avg}</TableCell>
                    <TableCell className="text-right">{row.adv30_avg_bil}</TableCell>
                    <TableCell className="text-right">{row.health_avg}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Sharpe vs ADV Scatter */}
          <Card className="p-6">
            <h4 className="text-md font-bold mb-4">Sharpe vs Liquidity (ADV30)</h4>
            <ResponsiveContainer width="100%" height={350}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="avg_daily_dollar_volume_30d" 
                  name="ADV30" 
                  scale="log" 
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => `${(val / 1e9).toFixed(1)}B`}
                />
                <YAxis dataKey="sharpe" name="Sharpe" />
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    if (name === 'ADV30') return `$${(value / 1e9).toFixed(2)}B`;
                    return value.toFixed(3);
                  }}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend />
                <Scatter name="Pockets" data={gridData} fill="hsl(var(--primary))" />
              </ScatterChart>
            </ResponsiveContainer>
          </Card>

          {/* Top Pockets */}
          <Card className="p-6">
            <h4 className="text-md font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top 20 Pockets by Sharpe
            </h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Horizon</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Min Mentions</TableHead>
                    <TableHead className="text-right">Pos Thresh</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead className="text-right">Sharpe</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">ADV30 ($B)</TableHead>
                    <TableHead className="text-right">Health</TableHead>
                    <TableHead className="text-right">Beta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPockets.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.symbol}</TableCell>
                      <TableCell>{row.horizon}</TableCell>
                      <TableCell>{row.side}</TableCell>
                      <TableCell className="text-right">{row.min_mentions}</TableCell>
                      <TableCell className="text-right">{row.pos_thresh}</TableCell>
                      <TableCell>{row.band}</TableCell>
                      <TableCell className="text-right font-semibold">{(row.sharpe || 0).toFixed(3)}</TableCell>
                      <TableCell className="text-right">{row.trades}</TableCell>
                      <TableCell className="text-right">{((row.avg_daily_dollar_volume_30d || 0) / 1e9).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{(row.avg_sentiment_health_score || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{(row.avg_beta_vs_spy || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default GridHygieneSummary;
