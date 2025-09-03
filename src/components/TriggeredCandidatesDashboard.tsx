import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { todayInDenverDateString } from '@/utils/timezone';
import { cn } from '@/lib/utils';
import { 
  RefreshCw, 
  Target, 
  TrendingUp, 
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BarChart3,
  Activity
} from 'lucide-react';

interface TriggeredCandidate {
  symbol: string;
  horizon: string;
  side: string;
  grade: 'Strong' | 'Moderate' | 'Weak';
  mentions: number;
  min_mentions: number;
  pos_thresh: number;
  sharpe: number;
  avg_ret: number;
  win_rate: number;
  trades: number;
  start_date: string;
  end_date: string;
  notes: string | null;
  is_enabled: boolean;
  priority: number;
}

interface SummaryKPIs {
  totalCandidates: number;
  strongCandidates: number;
  averageSharpe: number;
  averageWinRate: number;
}

const TriggeredCandidatesDashboard = () => {
  const [candidates, setCandidates] = useState<TriggeredCandidate[]>([]);
  const [summaryKPIs, setSummaryKPIs] = useState<SummaryKPIs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeGradeFilter, setActiveGradeFilter] = useState<'all' | 'strong' | 'moderate' | 'weak'>('all');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [tradingDate] = useState<string>(todayInDenverDateString());

  const { toast } = useToast();
  const navigate = useNavigate();

  // Helper functions
  const formatPercent = (value: number) => 
    `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

  const formatDate = (date: string) => 
    new Date(date + 'T12:00:00').toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

  const getGradeVariant = (grade: string) => {
    switch (grade) {
      case 'Strong': return 'default';
      case 'Moderate': return 'secondary';
      case 'Weak': return 'outline';
      default: return 'outline';
    }
  };

  const getGradeOrder = (grade: string) => {
    const order = { 'Strong': 1, 'Moderate': 2, 'Weak': 3 };
    return order[grade as keyof typeof order] || 4;
  };

  // Data fetching
  const fetchTriggeredCandidates = async () => {
    console.log('🎯 Fetching triggered candidates...');
    try {
      const { data, error } = await supabase
        .from('live_sentiment_entry_rules')
        .select('*')
        .eq('is_enabled', true)
        .order('priority', { ascending: true });

      if (error) {
        console.error('❌ Triggered candidates query error:', error);
        throw error;
      }

      console.log('🎯 Triggered candidates received:', data?.length || 0, 'items');

      if (data) {
        const processed = data.map((item: any) => {
          let grade: 'Strong' | 'Moderate' | 'Weak' = 'Weak';
          
          if (item.sharpe >= 2.0 && item.trades >= 6) {
            grade = 'Strong';
          } else if (item.sharpe >= 1.0 && item.trades >= 4) {
            grade = 'Moderate';
          }

          return {
            symbol: item.symbol,
            horizon: item.horizon,
            side: item.side,
            grade,
            mentions: item.min_mentions || 0, // Current mentions placeholder
            min_mentions: item.min_mentions || 0,
            pos_thresh: item.pos_thresh || 0,
            sharpe: item.sharpe || 0,
            avg_ret: item.avg_ret || 0,
            win_rate: item.win_rate || 0,
            trades: item.trades || 0,
            start_date: item.start_date || '',
            end_date: item.end_date || '',
            notes: item.notes || '',
            is_enabled: item.is_enabled,
            priority: item.priority || 100,
          };
        });

        setCandidates(processed);

        // Calculate summary KPIs
        const strongCount = processed.filter(c => c.grade === 'Strong').length;
        const avgSharpe = processed.reduce((sum, c) => sum + c.sharpe, 0) / processed.length;
        const avgWinRate = processed.reduce((sum, c) => sum + c.win_rate, 0) / processed.length;

        setSummaryKPIs({
          totalCandidates: processed.length,
          strongCandidates: strongCount,
          averageSharpe: avgSharpe || 0,
          averageWinRate: avgWinRate || 0,
        });
      } else {
        setCandidates([]);
        setSummaryKPIs(null);
      }
    } catch (error) {
      console.error('❌ Error fetching triggered candidates:', error);
      setCandidates([]);
      setSummaryKPIs(null);
      toast({
        title: 'Data Fetch Error',
        description: 'Failed to load triggered candidates. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTriggeredCandidates();
    setIsRefreshing(false);
    toast({
      title: 'Data Refreshed',
      description: `Updated at ${new Date().toLocaleTimeString()}`,
    });
  };

  useEffect(() => {
    setIsLoading(true);
    fetchTriggeredCandidates().finally(() => setIsLoading(false));
  }, []);

  // Filter and group data
  const filteredCandidates = candidates.filter(candidate => {
    const gradeMatch = activeGradeFilter === 'all' || 
                     candidate.grade.toLowerCase() === activeGradeFilter;
    const symbolMatch = searchSymbol === '' || 
                       candidate.symbol.toLowerCase().includes(searchSymbol.toLowerCase());
    return gradeMatch && symbolMatch;
  });

  // Group by symbol
  const groupedCandidates = filteredCandidates.reduce((acc, candidate) => {
    if (!acc[candidate.symbol]) {
      acc[candidate.symbol] = [];
    }
    acc[candidate.symbol].push(candidate);
    return acc;
  }, {} as Record<string, TriggeredCandidate[]>);

  // Sort symbols by best grade and sharpe
  const sortedSymbols = Object.keys(groupedCandidates).sort((a, b) => {
    const aGrades = groupedCandidates[a].map(c => getGradeOrder(c.grade));
    const bGrades = groupedCandidates[b].map(c => getGradeOrder(c.grade));
    const aBestGrade = Math.min(...aGrades);
    const bBestGrade = Math.min(...bGrades);
    
    if (aBestGrade !== bBestGrade) {
      return aBestGrade - bBestGrade;
    }
    
    const aBestSharpe = Math.max(...groupedCandidates[a].map(c => c.sharpe));
    const bBestSharpe = Math.max(...groupedCandidates[b].map(c => c.sharpe));
    return bBestSharpe - aBestSharpe;
  });

  const toggleNoteExpansion = (key: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedNotes(newExpanded);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Recommended Trades</h1>
          <p className="text-muted-foreground">
            Backtest-validated trading signals triggered on {formatDate(tradingDate)}
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <Tabs value={activeGradeFilter} onValueChange={(value) => setActiveGradeFilter(value as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="strong">Strong</TabsTrigger>
                <TabsTrigger value="moderate">Moderate</TabsTrigger>
                <TabsTrigger value="weak">Weak</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search symbol..."
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Candidates Today</p>
                {summaryKPIs ? (
                  <p className="text-2xl font-bold">{summaryKPIs.totalCandidates}</p>
                ) : (
                  <Skeleton className="h-8 w-12" />
                )}
              </div>
              <Target className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Strong Candidates</p>
                {summaryKPIs ? (
                  <p className="text-2xl font-bold text-green-600">{summaryKPIs.strongCandidates}</p>
                ) : (
                  <Skeleton className="h-8 w-12" />
                )}
              </div>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Sharpe</p>
                {summaryKPIs ? (
                  <p className="text-2xl font-bold">{summaryKPIs.averageSharpe.toFixed(2)}</p>
                ) : (
                  <Skeleton className="h-8 w-16" />
                )}
              </div>
              <BarChart3 className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Win Rate</p>
                {summaryKPIs ? (
                  <p className="text-2xl font-bold">{formatPercent(summaryKPIs.averageWinRate)}</p>
                ) : (
                  <Skeleton className="h-8 w-16" />
                )}
              </div>
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Candidate List */}
      <Card>
        <CardHeader>
          <CardTitle>Candidate Details</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : sortedSymbols.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No triggered candidates found matching your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedSymbols.map(symbol => {
                const symbolCandidates = groupedCandidates[symbol];
                const bestGrade = symbolCandidates.reduce((best, current) => 
                  getGradeOrder(current.grade) < getGradeOrder(best.grade) ? current : best
                );

                return (
                  <div key={symbol} className="border rounded-lg p-4">
                    {/* Symbol Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3 
                          className="text-xl font-bold cursor-pointer hover:text-primary"
                          onClick={() => navigate(`/sentiment?symbol=${symbol}`)}
                        >
                          {symbol}
                        </h3>
                        <Badge variant="outline">{bestGrade.side}</Badge>
                        <Badge variant={getGradeVariant(bestGrade.grade)}>
                          {bestGrade.grade}
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/sentiment?symbol=${symbol}`)}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Sentiment
                      </Button>
                    </div>

                    {/* Horizon Rows */}
                    <div className="space-y-3">
                      {symbolCandidates
                        .sort((a, b) => getGradeOrder(a.grade) - getGradeOrder(b.grade))
                        .map((candidate, idx) => {
                          const noteKey = `${symbol}-${candidate.horizon}`;
                          const isNoteExpanded = expandedNotes.has(noteKey);
                          
                          return (
                            <div key={idx} className="bg-muted/30 rounded-lg p-3">
                              {/* Horizon Data Row */}
                              <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center mb-2">
                                <div>
                                  <span className="font-medium text-sm">{candidate.horizon}</span>
                                </div>
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Mentions:</span> {candidate.mentions}/{candidate.min_mentions}
                                </div>
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Threshold:</span> {candidate.pos_thresh}
                                </div>
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Sharpe:</span> {candidate.sharpe.toFixed(2)}
                                </div>
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Avg Ret:</span> {formatPercent(candidate.avg_ret)}
                                </div>
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Win:</span> {formatPercent(candidate.win_rate)}
                                </div>
                                <div className="flex gap-2">
                                  <Badge variant={getGradeVariant(candidate.grade)} className="text-xs">
                                    {candidate.grade}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    Active
                                  </Badge>
                                </div>
                              </div>

                              {/* Backtest Context */}
                              <div className="text-xs text-muted-foreground mb-2">
                                [{candidate.grade}] Trades={candidate.trades} • Avg {formatPercent(candidate.avg_ret)} • 
                                Win {formatPercent(candidate.win_rate)} • Sharpe {candidate.sharpe.toFixed(1)} ({formatDate(candidate.start_date)}–{formatDate(candidate.end_date)})
                                <Button 
                                  variant="link" 
                                  className="h-auto p-0 ml-2 text-xs"
                                  onClick={() => navigate(`/backtesting?symbol=${symbol}&horizon=${candidate.horizon}`)}
                                >
                                  View Backtest
                                </Button>
                              </div>

                              {/* Notes */}
                              {candidate.notes && candidate.notes.trim().length > 0 && (
                                <div className="mt-2">
                                  <div className={cn(
                                    "text-sm text-muted-foreground",
                                    !isNoteExpanded && "line-clamp-2"
                                  )}>
                                    {candidate.notes}
                                  </div>
                                  {candidate.notes.length > 100 && (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-xs"
                                      onClick={() => toggleNoteExpansion(noteKey)}
                                    >
                                      {isNoteExpanded ? (
                                        <>Show Less <ChevronUp className="w-3 h-3 ml-1" /></>
                                      ) : (
                                        <>Show More <ChevronDown className="w-3 h-3 ml-1" /></>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deep Links */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="outline" 
              onClick={() => navigate('/sentiment-dashboard')}
              className="flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              View sentiment velocity → Velocity Tracker
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/sentiment-dashboard')}
              className="flex items-center gap-2"
            >
              <Activity className="w-4 h-4" />
              View past days → Sentiment History
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TriggeredCandidatesDashboard;