import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Calendar, DollarSign, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface DailyPnLData {
  mark_date: string;
  mode: string;
  open_positions: number;
  closed_positions: number;
  open_exposure: number;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  total_pnl: number;
}

const DailyPnLWidget = () => {
  const [pnlData, setPnlData] = useState<Record<string, DailyPnLData>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState('paper');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchPnLData = async (date: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_daily_pnl_rollups' as any)
        .select('*')
        .eq('mark_date', date);

      if (error) throw error;

      // Convert array to map by mode
      const dataMap: Record<string, DailyPnLData> = {};
      data?.forEach((row: any) => {
        dataMap[row.mode.toLowerCase()] = row;
      });

      setPnlData(dataMap);
    } catch (error: any) {
      console.error('Error fetching PnL data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch PnL data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPnLData(selectedDate);
  }, [selectedDate]);

  const getCurrentData = () => {
    const key = activeTab === 'all' ? 'all' : activeTab;
    return pnlData[key];
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const currentData = getCurrentData();
  const hasData = currentData !== undefined;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Daily P&L
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-auto"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchPnLData(selectedDate)}
              disabled={isLoading}
            >
              <Calendar className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="paper">Paper</TabsTrigger>
            <TabsTrigger value="real">Real</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="mt-4 space-y-4">
            {!hasData ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No marks yet for {formatDate(selectedDate)}</p>
              </div>
            ) : (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">
                      {currentData.open_positions}
                    </div>
                    <div className="text-sm text-muted-foreground">Open Positions</div>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">
                      {currentData.closed_positions}
                    </div>
                    <div className="text-sm text-muted-foreground">Closed Positions</div>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">
                      {formatCurrency(currentData.open_exposure)}
                    </div>
                    <div className="text-sm text-muted-foreground">Open Exposure</div>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className={`text-2xl font-bold ${
                      currentData.total_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {formatCurrency(currentData.total_pnl)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total P&L</div>
                  </div>
                </div>

                {/* Detailed P&L Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className={`w-4 h-4 ${
                        currentData.total_realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`} />
                      <span className="font-medium">Realized P&L</span>
                    </div>
                    <div className={`text-xl font-bold ${
                      currentData.total_realized_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {formatCurrency(currentData.total_realized_pnl)}
                    </div>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className={`w-4 h-4 ${
                        currentData.total_unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`} />
                      <span className="font-medium">Unrealized P&L</span>
                    </div>
                    <div className={`text-xl font-bold ${
                      currentData.total_unrealized_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {formatCurrency(currentData.total_unrealized_pnl)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DailyPnLWidget;