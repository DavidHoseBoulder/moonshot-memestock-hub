import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TrendingUp, Calendar, Target, BarChart3, Filter, Search, SortAsc, ChevronDown, ChevronUp } from 'lucide-react';

// Types
interface TriggeredCandidate {
  model_version: string;
  symbol: string;
  horizon: string;
  side: string;
  grade: 'Strong' | 'Moderate' | 'Weak';
  mentions: number;
  min_mentions: number;
  score: number;
  rule_threshold: number;
  trades: number;
  avg_ret: number;
  win_rate: number;
  sharpe: number;
  start_date: string;
  end_date: string;
  priority: number;
  grade_explain: string;
  notes: string | null;
}

// Formatting helpers
const pct = (x: number | null): string => x === null ? "—" : (x * 100).toFixed(1) + '%';
const signedPct = (x: number | null): string => {
  if (x === null) return "—";
  const formatted = (x * 100).toFixed(1) + '%';
  return x > 0 ? '+' + formatted : formatted;
};
const fmt2 = (x: number | null): string => x === null ? "—" : Number(x).toFixed(2);
const splitNotes = (notes: string | null): string[] => notes?.split('|').map(s => s.trim()).filter(Boolean) ?? [];

// Extract strength from grade_explain (split on ':' and take first part)
const getStrength = (gradeExplain: string): string => gradeExplain.split(':')[0].trim();

// Extract hold days from horizon (remove non-digits and parse)
const getHoldDays = (horizon: string): number => parseInt(horizon.replace(/\D/g, ''), 10);

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
  const [gradeFilter, setGradeFilter] = useState('All');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [sortBy, setSortBy] = useState('sharpe');
  const [newTradeDialogOpen, setNewTradeDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<TriggeredCandidate | null>(null);
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  
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
      const response = await fetch(
        `https://pdgjafywsxesgwukotxh.supabase.co/rest/v1/v_triggered_with_backtest?select=*&order=grade.asc,priority.asc,symbol.asc`,
        {
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      
      const data = await response.json();

      const formattedCandidates: TriggeredCandidate[] = (data || []).map((candidate: any) => ({
        model_version: candidate.model_version || '',
        symbol: candidate.symbol || '',
        horizon: candidate.horizon || '',
        side: candidate.side || '',
        grade: candidate.grade as 'Strong' | 'Moderate' | 'Weak',
        mentions: candidate.mentions || 0,
        min_mentions: candidate.min_mentions || 0,
        score: candidate.score || 0,
        rule_threshold: candidate.rule_threshold || 0,
        trades: candidate.trades || 0,
        avg_ret: candidate.avg_ret || 0,
        win_rate: candidate.win_rate || 0,
        sharpe: candidate.sharpe || 0,
        start_date: candidate.start_date || '',
        end_date: candidate.end_date || '',
        priority: candidate.priority || 0,
        grade_explain: candidate.grade_explain || '',
        notes: candidate.notes || null,
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
      const matchesGrade = gradeFilter === 'All' || candidate.grade === gradeFilter;
      const matchesSymbol = searchSymbol === '' || 
        candidate.symbol.toLowerCase().includes(searchSymbol.toLowerCase());
      return matchesGrade && matchesSymbol;
    });

    // Sort candidates
    filtered.sort((a, b) => {
      if (sortBy === 'strength') {
        // Sort by strength first, then by sharpe
        const strengthOrder = { 'Strong': 1, 'Moderate': 2, 'Weak': 3 };
        const strengthA = strengthOrder[a.grade as keyof typeof strengthOrder] || 4;
        const strengthB = strengthOrder[b.grade as keyof typeof strengthOrder] || 4;
        
        if (strengthA !== strengthB) {
          return strengthA - strengthB;
        }
        // If same strength, sort by sharpe descending
        return (b.sharpe || 0) - (a.sharpe || 0);
      } else if (sortBy === 'sharpe') {
        return (b.sharpe || 0) - (a.sharpe || 0);
      } else if (sortBy === 'trades') {
        return (b.trades || 0) - (a.trades || 0);
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
    
    form.reset({
      symbol: candidate.symbol,
      side: candidate.side as "LONG" | "SHORT",
      horizon: candidate.horizon as "1d" | "3d" | "5d" | "10d",
      mode: "paper",
      trade_date: candidate.start_date || new Date().toISOString().split('T')[0],
      qty: "1",
      fees_bps: "0",
      slippage_bps: "0",
    });
    setNewTradeDialogOpen(true);
  };

  const toggleNotesExpansion = (candidateKey: string) => {
    setExpandedNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(candidateKey)) {
        newSet.delete(candidateKey);
      } else {
        newSet.add(candidateKey);
      }
      return newSet;
    });
  };


  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
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
            🎯 Triggered Candidates
            <Target className="w-6 h-6 ml-3 text-accent" />
          </h2>
          <p className="text-muted-foreground">
            Backtest-validated trading candidates with grade explanations
          </p>
        </div>
      </div>

      {/* Grade Filter Tabs */}
      <Tabs value={gradeFilter} onValueChange={setGradeFilter} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="All">All</TabsTrigger>
          <TabsTrigger value="Strong">Strong</TabsTrigger>
          <TabsTrigger value="Moderate">Moderate</TabsTrigger>
          <TabsTrigger value="Weak">Weak</TabsTrigger>
        </TabsList>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
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
                    <SelectItem value="strength">Strength</SelectItem>
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
                <h3 className="text-lg font-semibold">No Strong/Moderate candidates right now</h3>
                <p className="text-muted-foreground">When a rule triggers, it'll appear here with backtest context.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Candidates Grid */}
        {!isLoading && filteredCandidates.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCandidates.map((candidate, index) => {
              const candidateKey = `${candidate.symbol}-${candidate.horizon}-${candidate.side}`;
              const notesArray = splitNotes(candidate.notes);
              const isNotesExpanded = expandedNotes.has(candidateKey);
              
              return (
                <Card key={candidateKey} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-bold">
                        {candidate.symbol} • {candidate.horizon.toUpperCase()}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={candidate.side === 'LONG' ? 'default' : 'destructive'} className="text-xs">
                          {candidate.side}
                        </Badge>
                        <Badge 
                          variant={candidate.grade === 'Strong' ? 'default' : candidate.grade === 'Moderate' ? 'outline' : 'secondary'}
                          className={
                            candidate.grade === 'Strong' 
                              ? 'bg-green-600 text-white hover:bg-green-700' 
                              : candidate.grade === 'Moderate'
                              ? 'border-blue-500 text-blue-600 hover:bg-blue-50'
                              : 'bg-gray-300 text-gray-600'
                          }
                        >
                          {candidate.grade}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mentions:</span>
                        <span>{candidate.mentions}/{candidate.min_mentions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Threshold:</span>
                        <span>{fmt2(candidate.rule_threshold)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sharpe:</span>
                        <span className={candidate.sharpe && candidate.sharpe > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {fmt2(candidate.sharpe)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">AvgRet:</span>
                        <span className={candidate.avg_ret && candidate.avg_ret > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {signedPct(candidate.avg_ret)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Win:</span>
                        <span className={candidate.win_rate && candidate.win_rate > 0.5 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {pct(candidate.win_rate)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Hold:</span>
                        <span>{candidate.horizon}</span>
                      </div>
                    </div>

                    {/* Grade Explanation */}
                    {candidate.grade_explain && (
                      <div className="text-xs text-muted-foreground border-t pt-2">
                        <span className="font-medium">Grade:</span> {candidate.grade_explain}
                      </div>
                    )}

                    {/* Notes Section */}
                    {candidate.notes && candidate.notes.trim() && (
                      <div className="text-xs text-muted-foreground border-t pt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">Notes:</span>
                          {candidate.notes.length > 100 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => toggleNotesExpansion(candidateKey)}
                            >
                              {isNotesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </Button>
                          )}
                        </div>
                        
                        {notesArray.length > 1 ? (
                          <div className="flex flex-wrap gap-1">
                            {notesArray.map((note, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] py-0 px-1">
                                {note}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className={`${isNotesExpanded ? '' : 'line-clamp-2'} text-xs`}>
                            {candidate.notes}
                          </div>
                        )}
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
              );
            })}
          </div>
        )}
      </Tabs>

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