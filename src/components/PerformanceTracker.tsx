import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Target, Calendar, BarChart3 } from "lucide-react";

interface PerformanceMetrics {
  totalSignals: number;
  winRate: number;
  avgReturn: number;
  avgHoldingDays: number;
  bestPerformer: any;
  worstPerformer: any;
  byConfidence: {
    high: { count: number; winRate: number; avgReturn: number };
    medium: { count: number; winRate: number; avgReturn: number };
    low: { count: number; winRate: number; avgReturn: number };
  };
  bySignalType: {
    BUY: { count: number; winRate: number; avgReturn: number };
    SELL: { count: number; winRate: number; avgReturn: number };
  };
}

const PerformanceTracker = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [pendingSignals, setPendingSignals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const fetchPerformanceMetrics = async () => {
    setIsLoading(true);
    try {
      // Fetch all completed signals for analysis
      const { data: signals, error } = await supabase
        .from('trading_signals')
        .select('*')
        .in('outcome', ['WIN', 'LOSS'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!signals || signals.length === 0) {
        setMetrics({
          totalSignals: 0,
          winRate: 0,
          avgReturn: 0,
          avgHoldingDays: 0,
          bestPerformer: null,
          worstPerformer: null,
          byConfidence: {
            high: { count: 0, winRate: 0, avgReturn: 0 },
            medium: { count: 0, winRate: 0, avgReturn: 0 },
            low: { count: 0, winRate: 0, avgReturn: 0 }
          },
          bySignalType: {
            BUY: { count: 0, winRate: 0, avgReturn: 0 },
            SELL: { count: 0, winRate: 0, avgReturn: 0 }
          }
        });
        return;
      }

      // Calculate overall metrics
      const totalSignals = signals.length;
      const wins = signals.filter(s => s.outcome === 'WIN').length;
      const winRate = (wins / totalSignals) * 100;
      const avgReturn = signals.reduce((sum, s) => sum + (s.actual_return || 0), 0) / totalSignals;
      const avgHoldingDays = signals.reduce((sum, s) => sum + (s.days_held || 0), 0) / totalSignals;

      // Find best and worst performers
      const bestPerformer = signals.reduce((best, current) => 
        (current.actual_return || 0) > (best?.actual_return || -Infinity) ? current : best, null);
      const worstPerformer = signals.reduce((worst, current) => 
        (current.actual_return || 0) < (worst?.actual_return || Infinity) ? current : worst, null);

      // Performance by confidence level
      const highConf = signals.filter(s => s.confidence >= 80);
      const mediumConf = signals.filter(s => s.confidence >= 60 && s.confidence < 80);
      const lowConf = signals.filter(s => s.confidence < 60);

      const calcStats = (arr: any[]) => ({
        count: arr.length,
        winRate: arr.length ? (arr.filter(s => s.outcome === 'WIN').length / arr.length) * 100 : 0,
        avgReturn: arr.length ? arr.reduce((sum, s) => sum + (s.actual_return || 0), 0) / arr.length : 0
      });

      // Performance by signal type
      const buySignals = signals.filter(s => s.signal_type === 'BUY');
      const sellSignals = signals.filter(s => s.signal_type === 'SELL');

      setMetrics({
        totalSignals,
        winRate,
        avgReturn,
        avgHoldingDays,
        bestPerformer,
        worstPerformer,
        byConfidence: {
          high: calcStats(highConf),
          medium: calcStats(mediumConf),
          low: calcStats(lowConf)
        },
        bySignalType: {
          BUY: calcStats(buySignals),
          SELL: calcStats(sellSignals)
        }
      });

    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      toast({
        title: "Error",
        description: "Failed to fetch performance metrics",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingSignals = async () => {
    try {
      const { data: pending, error } = await supabase
        .from('trading_signals')
        .select('*')
        .eq('outcome', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setPendingSignals(pending || []);
    } catch (error) {
      console.error('Error fetching pending signals:', error);
    }
  };

  const updateSignalOutcome = async (signalId: string, exitPrice: number, outcome: 'WIN' | 'LOSS') => {
    setIsUpdating(true);
    try {
      const signal = pendingSignals.find(s => s.id === signalId);
      if (!signal) return;

      const actualReturn = ((exitPrice - signal.entry_price) / signal.entry_price) * 100;
      const daysHeld = Math.floor((Date.now() - new Date(signal.created_at).getTime()) / (1000 * 60 * 60 * 24));

      const { error } = await supabase
        .from('trading_signals')
        .update({
          exit_price: exitPrice,
          actual_return: actualReturn,
          days_held: daysHeld,
          outcome: outcome
        })
        .eq('id', signalId);

      if (error) throw error;

      toast({
        title: "Signal Updated",
        description: `${signal.ticker} marked as ${outcome} with ${actualReturn.toFixed(2)}% return`,
        variant: outcome === 'WIN' ? "default" : "destructive"
      });

      // Refresh data
      await Promise.all([fetchPerformanceMetrics(), fetchPendingSignals()]);

    } catch (error) {
      console.error('Error updating signal:', error);
      toast({
        title: "Error",
        description: "Failed to update signal outcome",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchPerformanceMetrics();
    fetchPendingSignals();
  }, []);

  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const getReturnColor = (value: number) => value >= 0 ? 'text-green-600' : 'text-red-600';

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Tracker</CardTitle>
          <CardDescription>Loading performance metrics...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Performance Metrics */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Performance Overview
            </CardTitle>
            <CardDescription>
              Historical performance of trading signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{metrics.totalSignals}</div>
                <div className="text-sm text-gray-600">Total Signals</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{metrics.winRate.toFixed(1)}%</div>
                <div className="text-sm text-gray-600">Win Rate</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg">
                <div className={`text-2xl font-bold ${getReturnColor(metrics.avgReturn)}`}>
                  {formatPercent(metrics.avgReturn)}
                </div>
                <div className="text-sm text-gray-600">Avg Return</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{metrics.avgHoldingDays.toFixed(1)}</div>
                <div className="text-sm text-gray-600">Avg Hold Days</div>
              </div>
            </div>

            {/* Performance by Confidence Level */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Performance by Confidence Level</h3>
              <div className="space-y-2">
                {Object.entries(metrics.byConfidence).map(([level, stats]) => (
                  <div key={level} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant={level === 'high' ? 'default' : level === 'medium' ? 'secondary' : 'outline'}>
                        {level.charAt(0).toUpperCase() + level.slice(1)} Confidence
                      </Badge>
                      <span className="text-sm text-gray-600">{stats.count} signals</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm">Win Rate: {stats.winRate.toFixed(1)}%</span>
                      <span className={`text-sm font-medium ${getReturnColor(stats.avgReturn)}`}>
                        {formatPercent(stats.avgReturn)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Best/Worst Performers */}
            {(metrics.bestPerformer || metrics.worstPerformer) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {metrics.bestPerformer && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-green-800">Best Performer</span>
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      {metrics.bestPerformer.ticker} {formatPercent(metrics.bestPerformer.actual_return)}
                    </div>
                    <div className="text-sm text-green-700">
                      {metrics.bestPerformer.days_held} days, {metrics.bestPerformer.confidence}% confidence
                    </div>
                  </div>
                )}
                {metrics.worstPerformer && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-red-600" />
                      <span className="font-medium text-red-800">Worst Performer</span>
                    </div>
                    <div className="text-lg font-bold text-red-600">
                      {metrics.worstPerformer.ticker} {formatPercent(metrics.worstPerformer.actual_return)}
                    </div>
                    <div className="text-sm text-red-700">
                      {metrics.worstPerformer.days_held} days, {metrics.worstPerformer.confidence}% confidence
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending Signals for Manual Update */}
      {pendingSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Pending Signals ({pendingSignals.length})
            </CardTitle>
            <CardDescription>
              Update outcomes for active signals to track performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingSignals.map((signal) => (
                <div key={signal.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{signal.ticker}</Badge>
                    <span className="text-sm text-gray-600">
                      Entry: ${signal.entry_price?.toFixed(2)} | {signal.confidence}% confidence
                    </span>
                    <span className="text-xs text-gray-500">
                      {Math.floor((Date.now() - new Date(signal.created_at).getTime()) / (1000 * 60 * 60 * 24))} days ago
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const exitPrice = prompt(`Enter exit price for ${signal.ticker}:`);
                        if (exitPrice && !isNaN(Number(exitPrice))) {
                          const price = Number(exitPrice);
                          const isWin = signal.signal_type === 'BUY' ? price > signal.entry_price : price < signal.entry_price;
                          updateSignalOutcome(signal.id, price, isWin ? 'WIN' : 'LOSS');
                        }
                      }}
                      disabled={isUpdating}
                    >
                      Close Position
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PerformanceTracker;