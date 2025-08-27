import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Calendar, DollarSign, TrendingUp, TrendingDown, Activity, ArrowUpDown, ExternalLink } from 'lucide-react';

interface DailyPnLRollup {
  mark_date: string;
  mode: string;
  n_open: number;
  n_closed: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
}

interface DailyPnLBySymbol {
  mark_date: string;
  mode: string;
  symbol: string;
  n_open: number;
  n_closed: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
}

interface TradeDetail {
  trade_id: string;
  symbol: string;
  status_on_mark: string;
  entry_price: number;
  mark_price?: number;
  exit_price?: number;
  qty: number;
  realized_pnl?: number;
  unrealized_pnl?: number;
}

const DailyPnLWidget = () => {
  const [rollupData, setRollupData] = useState<DailyPnLRollup[]>([]);
  const [symbolData, setSymbolData] = useState<DailyPnLBySymbol[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [latestDate, setLatestDate] = useState('');
  const [activeTab, setActiveTab] = useState('paper');
  const [isLoading, setIsLoading] = useState(false);
  const [sortByRealized, setSortByRealized] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [tradeDetails, setTradeDetails] = useState<TradeDetail[]>([]);
  const { toast } = useToast();

  // Helper function to safely convert to number
  const toNumber = (value: any): number => {
    return Number(value ?? 0) || 0;
  };

  const fetchLatestDate = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('v_daily_pnl_rollups')
        .select('mark_date')
        .order('mark_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      const latest = data?.mark_date || new Date().toISOString().split('T')[0];
      setLatestDate(latest);
      if (!selectedDate) {
        setSelectedDate(latest);
      }
    } catch (error: any) {
      console.error('Error fetching latest date:', error);
      const fallback = new Date().toISOString().split('T')[0];
      setLatestDate(fallback);
      if (!selectedDate) {
        setSelectedDate(fallback);
      }
    }
  };

  const fetchPnLData = async (date: string) => {
    setIsLoading(true);
    try {
      // Fetch rollup data
      const { data: rollupData, error: rollupError } = await (supabase as any)
        .from('v_daily_pnl_rollups')
        .select('*')
        .eq('mark_date', date);

      if (rollupError) throw rollupError;

      // Fetch symbol data
      const { data: symbolData, error: symbolError } = await (supabase as any)
        .from('v_daily_pnl_by_symbol')
        .select('*')
        .eq('mark_date', date);

      if (symbolError) throw symbolError;

      // Convert numeric strings to numbers and set data
      const processedRollupData = (rollupData || []).map((row: any) => ({
        ...row,
        n_open: toNumber(row.n_open),
        n_closed: toNumber(row.n_closed),
        realized_pnl: toNumber(row.realized_pnl),
        unrealized_pnl: toNumber(row.unrealized_pnl),
        total_pnl: toNumber(row.total_pnl),
      }));

      const processedSymbolData = (symbolData || []).map((row: any) => ({
        ...row,
        n_open: toNumber(row.n_open),
        n_closed: toNumber(row.n_closed),
        realized_pnl: toNumber(row.realized_pnl),
        unrealized_pnl: toNumber(row.unrealized_pnl),
        total_pnl: toNumber(row.total_pnl),
      }));

      setRollupData(processedRollupData);
      setSymbolData(processedSymbolData);

    } catch (error: any) {
      console.error('Error fetching PnL data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch PnL data',
        variant: 'destructive',
      });
      setRollupData([]);
      setSymbolData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTradeDetails = async (symbol: string, date: string, mode: string) => {
    try {
      let query = (supabase as any)
        .from('daily_trade_marks')
        .select('*')
        .eq('symbol', symbol)
        .eq('mark_date', date);

      // Filter by mode if not 'all'
      if (mode !== 'all') {
        query = query.eq('mode', mode);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Convert the data to match our interface
      const details: TradeDetail[] = (data || []).map((row: any) => ({
        trade_id: row.trade_id,
        symbol: row.symbol,
        status_on_mark: row.status_on_mark,
        entry_price: toNumber(row.entry_price),
        mark_price: row.mark_price ? toNumber(row.mark_price) : undefined,
        exit_price: row.exit_price ? toNumber(row.exit_price) : undefined,
        qty: toNumber(row.qty),
        realized_pnl: row.realized_pnl ? toNumber(row.realized_pnl) : undefined,
        unrealized_pnl: row.unrealized_pnl ? toNumber(row.unrealized_pnl) : undefined,
      }));
      
      setTradeDetails(details);
    } catch (error: any) {
      console.error('Error fetching trade details:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch trade details',
        variant: 'destructive',
      });
      setTradeDetails([]);
    }
  };

  useEffect(() => {
    fetchLatestDate();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchPnLData(selectedDate);
    }
  }, [selectedDate, latestDate]);

  const getAggregatedData = () => {
    if (activeTab === 'all') {
      // Aggregate across all modes
      const aggregated = rollupData.reduce((acc, row) => {
        return {
          n_open: acc.n_open + toNumber(row.n_open),
          n_closed: acc.n_closed + toNumber(row.n_closed),
          realized_pnl: acc.realized_pnl + toNumber(row.realized_pnl),
          unrealized_pnl: acc.unrealized_pnl + toNumber(row.unrealized_pnl),
          total_pnl: acc.total_pnl + toNumber(row.total_pnl),
        };
      }, {
        n_open: 0,
        n_closed: 0,
        realized_pnl: 0,
        unrealized_pnl: 0,
        total_pnl: 0,
      });
      return aggregated;
    } else {
      // Filter by mode
      const modeData = rollupData.find(row => row.mode.toLowerCase() === activeTab);
      if (!modeData) {
        return {
          n_open: 0,
          n_closed: 0,
          realized_pnl: 0,
          unrealized_pnl: 0,
          total_pnl: 0,
        };
      }
      return {
        n_open: toNumber(modeData.n_open),
        n_closed: toNumber(modeData.n_closed),
        realized_pnl: toNumber(modeData.realized_pnl),
        unrealized_pnl: toNumber(modeData.unrealized_pnl),
        total_pnl: toNumber(modeData.total_pnl),
      };
    }
  };

  const getFilteredSymbolData = () => {
    let filtered = symbolData;
    
    if (activeTab !== 'all') {
      filtered = symbolData.filter(row => row.mode.toLowerCase() === activeTab);
    }

    if (activeTab === 'all') {
      // Aggregate by symbol across modes
      const aggregated = filtered.reduce((acc, row) => {
        const key = row.symbol;
        if (!acc[key]) {
          acc[key] = {
            symbol: row.symbol,
            n_open: 0,
            n_closed: 0,
            realized_pnl: 0,
            unrealized_pnl: 0,
            total_pnl: 0,
          };
        }
        acc[key].n_open += toNumber(row.n_open);
        acc[key].n_closed += toNumber(row.n_closed);
        acc[key].realized_pnl += toNumber(row.realized_pnl);
        acc[key].unrealized_pnl += toNumber(row.unrealized_pnl);
        acc[key].total_pnl += toNumber(row.total_pnl);
        return acc;
      }, {} as Record<string, any>);
      
      filtered = Object.values(aggregated);
    }

    // Sort by total_pnl or realized_pnl
    return filtered.sort((a, b) => {
      const sortKey = sortByRealized ? 'realized_pnl' : 'total_pnl';
      return Math.abs(toNumber(b[sortKey])) - Math.abs(toNumber(a[sortKey]));
    });
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

  const currentData = getAggregatedData();
  const hasData = rollupData.length > 0;
  const filteredSymbolData = getFilteredSymbolData();

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Daily P&L — {formatDate(selectedDate)}
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
                      {currentData.n_open}
                    </div>
                    <div className="text-sm text-muted-foreground">Open Positions</div>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">
                      {currentData.n_closed}
                    </div>
                    <div className="text-sm text-muted-foreground">Closed Positions</div>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className={`text-2xl font-bold ${
                      currentData.unrealized_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {formatCurrency(currentData.unrealized_pnl)}
                    </div>
                    <div className="text-sm text-muted-foreground">Unrealized P&L</div>
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

                {/* Realized P&L Card */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className={`w-4 h-4 ${
                      currentData.realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    }`} />
                    <span className="font-medium">Realized P&L</span>
                  </div>
                  <div className={`text-xl font-bold ${
                    currentData.realized_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatCurrency(currentData.realized_pnl)}
                  </div>
                </div>

                {/* Symbol Breakdown Table */}
                {filteredSymbolData.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">By Symbol</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSortByRealized(!sortByRealized)}
                      >
                        <ArrowUpDown className="w-4 h-4 mr-2" />
                        Sort by {sortByRealized ? 'Total' : 'Realized'} P&L
                      </Button>
                    </div>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Symbol</TableHead>
                            <TableHead className="text-center">Open</TableHead>
                            <TableHead className="text-center">Closed</TableHead>
                            <TableHead className="text-right">Realized P&L</TableHead>
                            <TableHead className="text-right">Unrealized P&L</TableHead>
                            <TableHead className="text-right">Total P&L</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSymbolData.map((row) => (
                            <Sheet key={row.symbol}>
                              <SheetTrigger asChild>
                                <TableRow 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => {
                                    setSelectedSymbol(row.symbol);
                                    fetchTradeDetails(row.symbol, selectedDate, activeTab);
                                  }}
                                >
                                  <TableCell className="font-medium">{row.symbol}</TableCell>
                                  <TableCell className="text-center">{toNumber(row.n_open)}</TableCell>
                                  <TableCell className="text-center">{toNumber(row.n_closed)}</TableCell>
                                  <TableCell className={`text-right ${
                                    toNumber(row.realized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {formatCurrency(toNumber(row.realized_pnl))}
                                  </TableCell>
                                  <TableCell className={`text-right ${
                                    toNumber(row.unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {formatCurrency(toNumber(row.unrealized_pnl))}
                                  </TableCell>
                                  <TableCell className={`text-right font-medium ${
                                    toNumber(row.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {formatCurrency(toNumber(row.total_pnl))}
                                  </TableCell>
                                  <TableCell>
                                    <ExternalLink className="w-4 h-4" />
                                  </TableCell>
                                </TableRow>
                              </SheetTrigger>
                              <SheetContent className="w-full sm:max-w-lg">
                                <SheetHeader>
                                  <SheetTitle>{selectedSymbol} Trade Details</SheetTitle>
                                </SheetHeader>
                                <div className="mt-4 space-y-4">
                                  {tradeDetails.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                      <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                      <p>No trade details found</p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {tradeDetails.map((trade) => (
                                        <div key={trade.trade_id} className="p-3 border rounded-lg">
                                          <div className="flex justify-between items-start mb-2">
                                            <span className="font-medium">{trade.status_on_mark}</span>
                                            <span className="text-sm text-muted-foreground">
                                              Qty: {toNumber(trade.qty)}
                                            </span>
                                          </div>
                                          <div className="text-sm space-y-1">
                                            <div>Entry: {formatCurrency(toNumber(trade.entry_price))}</div>
                                            {trade.mark_price && (
                                              <div>Mark: {formatCurrency(toNumber(trade.mark_price))}</div>
                                            )}
                                            {trade.exit_price && (
                                              <div>Exit: {formatCurrency(toNumber(trade.exit_price))}</div>
                                            )}
                                            {trade.realized_pnl !== undefined && trade.realized_pnl !== null && (
                                              <div className={`font-medium ${
                                                toNumber(trade.realized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                                              }`}>
                                                Realized: {formatCurrency(toNumber(trade.realized_pnl))}
                                              </div>
                                            )}
                                            {trade.unrealized_pnl !== undefined && trade.unrealized_pnl !== null && (
                                              <div className={`font-medium ${
                                                toNumber(trade.unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                                              }`}>
                                                Unrealized: {formatCurrency(toNumber(trade.unrealized_pnl))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </SheetContent>
                            </Sheet>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DailyPnLWidget;