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

      // Run queries in parallel for efficiency
      const [
        { count: totalCount, error: countError },
        { count: distinctSymbolsCount, error: symbolsError },
        { data: detailStats, error: detailError },
        { data: earliestRow, error: earliestError },
        { data: latestRow, error: latestError },
        { count: distinctDatesCount, error: datesError },
      ] = await Promise.all([
        supabase.from('enhanced_market_data').select('*', { count: 'exact', head: true }),
        supabase.from('enhanced_market_data').select('distinct symbol', { count: 'exact', head: true }),
        supabase.from('enhanced_market_data').select('symbol, data_date, created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('enhanced_market_data').select('data_date').order('data_date', { ascending: true }).limit(1),
        supabase.from('enhanced_market_data').select('data_date').order('data_date', { ascending: false }).limit(1),
        supabase.from('enhanced_market_data').select('distinct data_date', { count: 'exact', head: true }),
      ]);

      if (countError) throw countError;
      if (symbolsError) throw symbolsError;
      if (earliestError) throw earliestError;
      if (latestError) throw latestError;
      if (datesError) throw datesError;

      const detailedInfo = (!detailError && detailStats && detailStats.length > 0)
        ? { latest_symbol: detailStats[0].symbol, last_updated: detailStats[0].created_at }
        : {};

      const earliest_date = earliestRow && earliestRow.length > 0 ? earliestRow[0].data_date : undefined;
      const latest_date = latestRow && latestRow.length > 0 ? latestRow[0].data_date : undefined;

      setStats({
        symbols_with_data: distinctSymbolsCount || 0,
        total_data_points: totalCount || 0,
        earliest_date,
        latest_date,
        distinct_dates: distinctDatesCount || 0,
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
  const estimatedDataPoints = stats?.distinct_dates ? stats.distinct_dates * 98 : 0;
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