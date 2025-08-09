import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

interface ImportStats {
  symbols_with_data: number;
  total_data_points: number;
  latest_symbol?: string;
  earliest_date?: string;
  latest_date?: string;
  last_updated?: string;
  distinct_dates?: number;
}

const ImportProgressMonitor = () => {
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();

  const fetchStats = async () => {
    try {
      setIsRefreshing(true);

      // Run core queries in parallel (no invalid distinct syntax)
      const [
        { count: totalCount, error: countError },
        { data: detailStats, error: detailError },
        { data: earliestRow, error: earliestError },
        { data: latestRow, error: latestError },
      ] = await Promise.all([
        supabase.from('enhanced_market_data').select('*', { count: 'exact', head: true }),
        supabase.from('enhanced_market_data').select('symbol, data_date, created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('enhanced_market_data').select('data_date').order('data_date', { ascending: true }).limit(1),
        supabase.from('enhanced_market_data').select('data_date').order('data_date', { ascending: false }).limit(1),
      ]);

      if (countError) throw countError;
      if (earliestError) throw earliestError;
      if (latestError) throw latestError;

      const detailedInfo = (!detailError && detailStats && detailStats.length > 0)
        ? { latest_symbol: detailStats[0].symbol, last_updated: detailStats[0].created_at }
        : {};

      const earliest_date = earliestRow && earliestRow.length > 0 ? earliestRow[0].data_date : undefined;
      const latest_date = latestRow && latestRow.length > 0 ? latestRow[0].data_date : undefined;

      // Estimate trading days (approx 5/7 of calendar days)
      let estimatedTradingDays = 0;
      if (earliest_date && latest_date) {
        const diffMs = new Date(latest_date).getTime() - new Date(earliest_date).getTime();
        const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
        estimatedTradingDays = Math.max(1, Math.round((diffDays * 5) / 7));
      }

      // Estimate symbols processed from total rows / trading days (cap at 98)
      const estimatedSymbols = totalCount && estimatedTradingDays
        ? Math.min(98, Math.ceil(totalCount / estimatedTradingDays))
        : 0;

      setStats({
        symbols_with_data: estimatedSymbols,
        total_data_points: totalCount || 0,
        earliest_date,
        latest_date,
        ...detailedInfo,
      });

    } catch (error) {
      console.error('Error fetching stats:', error);
      toast({
        title: "Error",
        description: "Failed to fetch import progress",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchStats, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const progressPercentage = stats ? Math.min(100, (stats.symbols_with_data / 98) * 100) : 0;
  const estimatedTradingDays = stats?.earliest_date && stats?.latest_date
    ? Math.max(1, Math.round((((new Date(stats.latest_date).getTime() - new Date(stats.earliest_date).getTime()) / (1000 * 60 * 60 * 24)) + 1) * 5 / 7))
    : 0;
  const estimatedDataPoints = estimatedTradingDays * 98;
  const dataProgressPercentage = stats && estimatedDataPoints > 0 ? Math.min(100, (stats.total_data_points / estimatedDataPoints) * 100) : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Yahoo Market Data Import Progress</CardTitle>
            <CardDescription>Monitoring Yahoo data import for 98 symbols</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStats()}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {stats ? (
          <>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Symbols Processed</span>
                <span>{stats.symbols_with_data} / 98</span>
              </div>
              <Progress value={progressPercentage} className="w-full" />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Data Points Collected</span>
                <span>{stats.total_data_points.toLocaleString()} / {estimatedDataPoints.toLocaleString()}</span>
              </div>
              <Progress value={dataProgressPercentage} className="w-full" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">Latest Symbol:</p>
                <p className="text-muted-foreground">{stats.latest_symbol || 'None yet'}</p>
              </div>
              <div>
                <p className="font-medium">Date Range:</p>
                <p className="text-muted-foreground">
                  {stats.earliest_date && stats.latest_date 
                    ? `${stats.earliest_date} to ${stats.latest_date}`
                    : 'No data yet'
                  }
                </p>
              </div>
            </div>

            {stats.last_updated && (
              <div className="text-xs text-muted-foreground">
                Last updated: {new Date(stats.last_updated).toLocaleString()}
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="autoRefresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="autoRefresh" className="text-sm">
                Auto-refresh every 10 seconds
              </label>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading import progress...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportProgressMonitor;