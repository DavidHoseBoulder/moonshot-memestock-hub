import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CohortData {
  bucket: string;
  horizon: string;
  week_start: string;
  weekly_trades: number;
  cum_trades: number;
  cum_return: number;
}

const SentimentCohortsDashboard: React.FC = () => {
  const [data, setData] = useState<CohortData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHorizon, setSelectedHorizon] = useState<string>('all');
  const { toast } = useToast();

  const fetchCohortData = async () => {
    setLoading(true);
    try {
      const { data: cohortData, error } = await supabase
        .from('v_sentiment_cohort_weekly')
        .select('*')
        .order('week_start', { ascending: true });

      if (error) throw error;

      setData(cohortData || []);
    } catch (error) {
      console.error('Error fetching cohort data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch cohort data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCohortData();
  }, []);

  const filteredData = selectedHorizon === 'all' 
    ? data 
    : data.filter(d => d.horizon === selectedHorizon);

  // Prepare chart data
  const chartData = React.useMemo(() => {
    const grouped: Record<string, any> = {};
    
    filteredData.forEach(row => {
      const key = row.week_start;
      if (!grouped[key]) {
        grouped[key] = { week_start: row.week_start };
      }
      const label = selectedHorizon === 'all' 
        ? `${row.bucket}_${row.horizon}`
        : row.bucket;
      grouped[key][label] = (row.cum_return * 100).toFixed(2);
    });

    return Object.values(grouped);
  }, [filteredData, selectedHorizon]);

  // Get unique buckets and horizons that actually have data
  const uniqueBuckets = Array.from(new Set(filteredData.map(d => d.bucket)));
  const uniqueHorizons = Array.from(new Set(data.map(d => d.horizon))).sort();
  
  // Get combinations that actually have data
  const availableCombinations = React.useMemo(() => {
    const combos = new Set<string>();
    filteredData.forEach(row => {
      combos.add(`${row.bucket}_${row.horizon}`);
    });
    return combos;
  }, [filteredData]);

  const colors = {
    base_strong: '#8b5cf6',
    extra_strong: '#ec4899',
  };

  const getLineColor = (bucket: string) => colors[bucket as keyof typeof colors] || '#6366f1';

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="h-8 w-8" />
            Sentiment Cohorts
          </h1>
          <p className="text-muted-foreground mt-1">
            Weekly cumulative performance by sentiment strength cohort
          </p>
        </div>
        <Button onClick={fetchCohortData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      <Tabs value={selectedHorizon} onValueChange={setSelectedHorizon}>
        <TabsList>
          <TabsTrigger value="all">All Horizons</TabsTrigger>
          {uniqueHorizons.map(h => (
            <TabsTrigger key={h} value={h}>{h}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedHorizon} className="space-y-6">
          {/* Chart Card */}
          <Card>
            <CardHeader>
              <CardTitle>Cumulative Return by Cohort</CardTitle>
              <CardDescription>
                {selectedHorizon === 'all' 
                  ? 'All holding periods shown'
                  : `${selectedHorizon} holding period`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[400px] flex items-center justify-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="week_start" 
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      label={{ value: 'Cumulative Return (%)', angle: -90, position: 'insideLeft' }}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip 
                      formatter={(value: any) => `${value}%`}
                      labelStyle={{ color: '#000' }}
                    />
                    <Legend />
                    {selectedHorizon === 'all' ? (
                      // Show only bucket+horizon combinations that have data
                      uniqueBuckets.flatMap(bucket =>
                        uniqueHorizons
                          .filter(horizon => availableCombinations.has(`${bucket}_${horizon}`))
                          .map(horizon => (
                            <Line
                              key={`${bucket}_${horizon}`}
                              type="monotone"
                              dataKey={`${bucket}_${horizon}`}
                              name={`${bucket} (${horizon})`}
                              stroke={getLineColor(bucket)}
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              connectNulls
                            />
                          ))
                      )
                    ) : (
                      // Show just buckets for selected horizon
                      uniqueBuckets.map(bucket => (
                        <Line
                          key={bucket}
                          type="monotone"
                          dataKey={bucket}
                          name={bucket}
                          stroke={getLineColor(bucket)}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          connectNulls
                        />
                      ))
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data Table Card */}
          <Card>
            <CardHeader>
              <CardTitle>Raw Data</CardTitle>
              <CardDescription>
                Weekly trade counts and cumulative metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week Start</TableHead>
                      <TableHead>Bucket</TableHead>
                      <TableHead>Horizon</TableHead>
                      <TableHead className="text-right">Weekly Trades</TableHead>
                      <TableHead className="text-right">Cum. Trades</TableHead>
                      <TableHead className="text-right">Cum. Return</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredData.length > 0 ? (
                      filteredData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.week_start}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary">
                              {row.bucket}
                            </span>
                          </TableCell>
                          <TableCell>{row.horizon}</TableCell>
                          <TableCell className="text-right">{row.weekly_trades}</TableCell>
                          <TableCell className="text-right">{row.cum_trades}</TableCell>
                          <TableCell className="text-right font-medium">
                            <span className={row.cum_return >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {(row.cum_return * 100).toFixed(2)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SentimentCohortsDashboard;
