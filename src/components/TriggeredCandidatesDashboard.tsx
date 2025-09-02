import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TrendingUp, Calendar, Target, BarChart3, Filter, Search, SortAsc } from 'lucide-react';

// Types
interface TriggeredCandidate {
  symbol: string;
  horizon: string;
  side: string;
  grade: 'Strong' | 'Moderate';
  trades: number;
  sharpe: number;
  avg_ret: number;
  win_rate: number;
  rule_threshold: number;
  mentions: number;
  min_mentions: number;
  hold_days: number;
  entry_date: string;
  exit_date: string;
  grade_explain: string;
}

// Form schema for trade creation
const newTradeSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['LONG', 'SHORT']),
  horizon: z.enum(['1d', '3d', '5d', '10d']),
  mode: z.enum(['paper', 'live']).default('paper'),
  trade_date: z.string(),
  entry_price: z.string().optional(),
  qty: z.string().default('1'),
  fees_bps: z.string().default('0'),
  slippage_bps: z.string().default('0'),
  notes: z.string().optional(),
});

type NewTradeFormData = z.infer<typeof newTradeSchema>;

const TriggeredCandidatesDashboard: React.FC = () => {
  const [candidates, setCandidates] = useState<TriggeredCandidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<TriggeredCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState<string[]>(['Strong', 'Moderate']);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [sortBy, setSortBy] = useState('sharpe');
  const [newTradeDialogOpen, setNewTradeDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<TriggeredCandidate | null>(null);
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);
  
  const { toast } = useToast();
  
  const form = useForm<NewTradeFormData>({
    resolver: zodResolver(newTradeSchema),
    defaultValues: {
      mode: 'paper',
      qty: '1',
      fees_bps: '0',
      slippage_bps: '0',
    },
  });

  const fetchTriggeredCandidates = async () => {
    setIsLoading(true);
    try {
      // Use a resilient query with wildcard select to avoid column mismatches
      const response = await fetch(
        `https://pdgjafywsxesgwukotxh.supabase.co/rest/v1/v_reddit_candidates_today?is_enabled=eq.true&grade=in.("Strong","Moderate")&order=symbol.asc&order=horizon.asc&select=*`,
        {
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
            'Content-Type': 'application/json'
          }
        }
      );

      // If the enriched view columns are unavailable, fall back to last trading day
      let rawData = response.ok ? await response.json() : [];
      if ((!rawData || rawData.length === 0) && !response.ok) {
        const fallback = await fetch(
          `https://pdgjafywsxesgwukotxh.supabase.co/rest/v1/v_reddit_candidates_last_trading_day?is_enabled=eq.true&grade=in.("Strong","Moderate")&order=symbol.asc&order=horizon.asc&select=*`,
          {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
              'Content-Type': 'application/json'
            }
          }
        );
        if (fallback.ok) {
          rawData = await fallback.json();
        }
      }
      
      const formattedCandidates: TriggeredCandidate[] = (rawData || []).map((candidate: any) => ({
        symbol: candidate.symbol || '',
        horizon: candidate.horizon || '',
        side: candidate.side || '',
        grade: candidate.grade as 'Strong' | 'Moderate',
        trades: candidate.trades || 0,
        sharpe: candidate.sharpe_display || 0,
        avg_ret: candidate.avg_ret_display || 0,
        win_rate: candidate.win_rate_display || 0,
        rule_threshold: candidate.rule_threshold || 0,
        mentions: candidate.mentions || 0,
        min_mentions: candidate.min_mentions || 0,
        hold_days: candidate.hold_days || 0,
        entry_date: candidate.entry_date || '',
        exit_date: candidate.exit_date || '',
        grade_explain: candidate.grade_explain || '',
      }));

      setCandidates(formattedCandidates);
    } catch (error: any) {
      console.error('Error fetching triggered candidates:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch triggered candidates',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Apply filters and sorting
  useEffect(() => {
    let filtered = candidates.filter(candidate => {
      const matchesGrade = gradeFilter.includes(candidate.grade);
      const matchesSymbol = searchSymbol === '' || 
        candidate.symbol.toLowerCase().includes(searchSymbol.toLowerCase());
      return matchesGrade && matchesSymbol;
    });

    // Sort candidates
    filtered.sort((a, b) => {
      if (sortBy === 'sharpe') {
        return b.sharpe - a.sharpe;
      } else if (sortBy === 'trades') {
        return b.trades - a.trades;
      } else if (sortBy === 'symbol') {
        return a.symbol.localeCompare(b.symbol);
      }
      return 0;
    });

    setFilteredCandidates(filtered);
  }, [candidates, gradeFilter, searchSymbol, sortBy]);

  const submitNewTrade = async (formData: NewTradeFormData) => {
    if (!selectedCandidate) return;
    
    setIsSubmittingTrade(true);
    try {
      const { error } = await supabase
        .from('trades')
        .insert({
          symbol: formData.symbol.toUpperCase(),
          side: formData.side,
          horizon: formData.horizon,
          mode: formData.mode,
          trade_date: formData.trade_date,
          entry_price: formData.entry_price ? parseFloat(formData.entry_price) : null,
          qty: parseFloat(formData.qty),
          notes: formData.notes || null,
          fees_total: formData.fees_bps ? parseFloat(formData.fees_bps) : 0,
          source: 'triggered_candidate',
          status: 'OPEN',
        });

      if (error) throw error;

      toast({
        title: 'Trade Created',
        description: `New ${formData.mode} trade for ${formData.symbol} created successfully`,
      });

      form.reset();
      setNewTradeDialogOpen(false);
      setSelectedCandidate(null);
    } catch (error: any) {
      console.error('Error creating trade:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create trade',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingTrade(false);
    }
  };

  const openNewTradeDialog = (candidate: TriggeredCandidate) => {
    setSelectedCandidate(candidate);
    
    // Create the complete payload as specified
    const payload = {
      symbol: candidate.symbol,
      side: candidate.side as "LONG" | "SHORT",
      horizon: candidate.horizon as "1d" | "3d" | "5d" | "10d",
      hold_days: candidate.hold_days,
      entry_date: candidate.entry_date,
      exit_date: candidate.exit_date,
      meta: {
        grade: candidate.grade,
        trades: candidate.trades,
        sharpe: candidate.sharpe,
        avg_ret: candidate.avg_ret,
        win_rate: candidate.win_rate,
        rule_threshold: candidate.rule_threshold,
        mentions: candidate.mentions,
        min_mentions: candidate.min_mentions,
        grade_explain: candidate.grade_explain
      }
    };
    
    form.reset({
      symbol: payload.symbol,
      side: payload.side,
      horizon: payload.horizon,
      mode: "paper",
      trade_date: payload.entry_date || new Date().toISOString().split('T')[0],
      qty: "1",
      fees_bps: "0",
      slippage_bps: "0",
    });
    setNewTradeDialogOpen(true);
  };

  const toggleGradeFilter = (grade: string) => {
    setGradeFilter(prev => 
      prev.includes(grade) 
        ? prev.filter(g => g !== grade)
        : [...prev, grade]
    );
  };

  const formatPercent = (value: number, decimals = 1) => {
    const percent = (value * 100).toFixed(decimals);
    return `${value > 0 ? '+' : ''}${percent}%`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '⏳ Waiting for today\'s market data';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  useEffect(() => {
    fetchTriggeredCandidates();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center text-foreground">
            🎯 Triggered Candidates (Today)
            <Target className="w-6 h-6 ml-3 text-accent" />
          </h2>
          <p className="text-muted-foreground">
            Strong and Moderate grade signals ready for trading
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Grade Filter Chips */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Button
            variant={gradeFilter.includes('Strong') ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleGradeFilter('Strong')}
            className="h-8"
          >
            Strong
          </Button>
          <Button
            variant={gradeFilter.includes('Moderate') ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleGradeFilter('Moderate')}
            className="h-8"
          >
            Moderate
          </Button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search symbol..."
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value)}
            className="w-40"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <SortAsc className="w-4 h-4 text-muted-foreground" />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sharpe">Sharpe</SelectItem>
              <SelectItem value="trades">Trades</SelectItem>
              <SelectItem value="symbol">Symbol</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="text-muted-foreground">Loading triggered candidates...</div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredCandidates.length === 0 && (
        <Card className="text-center py-8">
          <CardContent className="space-y-4">
            <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">No Strong/Moderate signals right now</h3>
              <p className="text-muted-foreground">Check back later for new trading opportunities.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Candidates Grid */}
      {!isLoading && filteredCandidates.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCandidates.map((candidate, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold">
                    {candidate.symbol} • {candidate.horizon.toUpperCase()} • {candidate.side}
                  </CardTitle>
                  <Badge 
                    variant={candidate.grade === 'Strong' ? 'default' : 'secondary'}
                    className={candidate.grade === 'Strong' 
                      ? 'bg-green-600 text-white hover:bg-green-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                    }
                  >
                    {candidate.grade}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                {/* Metrics */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mentions:</span>
                    <span>{candidate.mentions} / {candidate.min_mentions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Threshold:</span>
                    <span>{candidate.rule_threshold.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Sharpe:</span>
                    <span className={candidate.sharpe > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {candidate.sharpe.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">AvgRet:</span>
                    <span className={candidate.avg_ret > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {formatPercent(candidate.avg_ret)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Win:</span>
                    <span className={candidate.win_rate > 0.5 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {formatPercent(candidate.win_rate, 0)}
                    </span>
                  </div>
                </div>

                {/* Timeline */}
                <div className="border-t pt-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hold:</span>
                    <span>{candidate.hold_days}d</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry:</span>
                    <span>{formatDate(candidate.entry_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exit:</span>
                    <span>{formatDate(candidate.exit_date)}</span>
                  </div>
                </div>

                {/* Grade Explanation */}
                {candidate.grade_explain && (
                  <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                    {candidate.grade_explain}
                  </div>
                )}

                {/* Action Button */}
                <Button 
                  onClick={() => openNewTradeDialog(candidate)}
                  className="w-full mt-4"
                  size="sm"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  New Trade
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Trade Dialog */}
      <Dialog open={newTradeDialogOpen} onOpenChange={setNewTradeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Trade</DialogTitle>
            <DialogDescription>
              {selectedCandidate && (
                <>Create a new trade for {selectedCandidate.symbol} based on triggered sentiment candidate</>
              )}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(submitNewTrade)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="symbol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Symbol</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. AAPL" 
                          {...field} 
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          disabled={!!selectedCandidate}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="side"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Side</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select side" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="LONG">LONG</SelectItem>
                          <SelectItem value="SHORT">SHORT</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="horizon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horizon</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select horizon" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1d">1 Day</SelectItem>
                          <SelectItem value="3d">3 Days</SelectItem>
                          <SelectItem value="5d">5 Days</SelectItem>
                          <SelectItem value="10d">10 Days</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mode</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="paper">Paper</SelectItem>
                          <SelectItem value="live">Live</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="trade_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trade Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="qty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="1.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="entry_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entry Price (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="Leave empty for market price" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Trade notes or reasoning..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewTradeDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingTrade}>
                  {isSubmittingTrade ? 'Creating...' : 'Create Trade'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TriggeredCandidatesDashboard;