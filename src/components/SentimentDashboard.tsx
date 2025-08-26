import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Target, Zap, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RedditDailySignal {
  data_date: string;
  symbol: string;
  n_mentions: number;
  avg_score: number;
  used_score: number;
}

interface RedditCandidate {
  trade_date: string;
  symbol: string;
  horizon: string;
  min_mentions: number;
  pos_thresh: number;
  used_score: number;
  n_mentions: number;
  triggered: boolean;
  use_weighted?: boolean;
  side?: string;
  reference_date?: string;
}

interface FallbackSignal extends RedditDailySignal {
  reference_date?: string;
}

interface BacktestResult {
  symbol: string;
  horizon: string;
  avg_ret: number;
  median_ret: number;
  win_rate?: number;
  hit_rate?: number;
  sharpe: number;
  trades: number;
  composite_score?: number;
}

interface LiveEntry {
  symbol: string;
  horizon: string;
  d: string;
  triggered: boolean;
  n_mentions: number;
  used_score: number;
  pos_thresh: number;
  min_mentions: number;
}

const RedditSignalCard = ({ signal }: { signal: RedditDailySignal }) => {
  const getSentimentColor = (score: number) => {
    if (score > 0.1) return 'text-green-500';
    if (score < -0.1) return 'text-red-500';
    return 'text-yellow-500';
  };

  const getSentimentLabel = (score: number) => {
    if (score > 0.1) return 'Bullish';
    if (score < -0.1) return 'Bearish';
    return 'Neutral';
  };

  return (
    <Card className="p-4 hover:shadow-lg transition-shadow border bg-card">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">{signal.symbol}</h3>
          <p className="text-sm text-muted-foreground">Reddit Daily Signal</p>
        </div>
        <Badge className={`${getSentimentColor(signal.avg_score)} bg-transparent border`}>
          {getSentimentLabel(signal.avg_score)}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-xl font-bold text-foreground">{signal.n_mentions}</div>
          <div className="text-xs text-muted-foreground">Mentions</div>
        </div>
        <div>
          <div className={`text-xl font-bold ${getSentimentColor(signal.avg_score)}`}>
            {signal.avg_score.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">Avg Score</div>
        </div>
        <div>
          <div className={`text-xl font-bold ${getSentimentColor(signal.used_score)}`}>
            {signal.used_score.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">Used Score</div>
        </div>
      </div>
    </Card>
  );
};

const CandidateCard = ({ candidate, backtest }: { candidate: RedditCandidate; backtest?: BacktestResult }) => {
  return (
    <Card className={`p-4 hover:shadow-lg transition-shadow border ${candidate.triggered ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'bg-card'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">{candidate.symbol}</h3>
          <p className="text-sm text-muted-foreground">{candidate.horizon} • {candidate.side}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={candidate.triggered ? "default" : "outline"}>
            {candidate.triggered ? "🎯 TRIGGERED" : "Monitoring"}
          </Badge>
          {candidate.triggered && <Target className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-sm text-muted-foreground">Mentions</div>
          <div className="text-base font-semibold">{candidate.n_mentions} / {candidate.min_mentions}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Score</div>
          <div className="text-base font-semibold">{candidate.used_score.toFixed(2)} / {candidate.pos_thresh.toFixed(2)}</div>
        </div>
      </div>

      {backtest && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-sm text-muted-foreground mb-2">Historical Performance</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="font-medium">{(backtest.avg_ret * 100).toFixed(1)}%</div>
              <div className="text-muted-foreground">Avg Return</div>
            </div>
            <div>
              <div className="font-medium">{((backtest.win_rate || backtest.hit_rate || 0) * 100).toFixed(0)}%</div>
              <div className="text-muted-foreground">Win Rate</div>
            </div>
            <div>
              <div className="font-medium">{backtest.trades}</div>
              <div className="text-muted-foreground">Trades</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

const SentimentDashboard = () => {
  const [redditSignals, setRedditSignals] = useState<RedditDailySignal[]>([]);
  const [candidates, setCandidates] = useState<RedditCandidate[]>([]);
  const [backtests, setBacktests] = useState<BacktestResult[]>([]);
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [fallbackDate, setFallbackDate] = useState<string | null>(null);
  
  const { toast } = useToast();

  const fetchRedditData = async () => {
    setIsLoading(true);
    
    try {
      // 1. Try to fetch today's v_reddit_daily_signals first
      const { data: todaySignals, error: todaySignalsError } = await supabase
        .from('v_reddit_daily_signals')
        .select('*')
        .order('trade_date', { ascending: false })
        .limit(20);

      let signalsData = todaySignals;
      let isUsingFallback = false;
      let referenceDate = null;

      // If no data for today, try fallback
      if (!todaySignals || todaySignals.length === 0) {
        const { data: fallbackSignals, error: fallbackSignalsError } = await supabase
          .from('v_reddit_daily_signals_last_trading_day')
          .select('*')
          .limit(20);

        if (!fallbackSignalsError && fallbackSignals && fallbackSignals.length > 0) {
          signalsData = fallbackSignals;
          isUsingFallback = true;
          referenceDate = fallbackSignals[0]?.reference_date;
        }
      }

      if (signalsData) {
        const signals = signalsData.map(item => ({
          data_date: item.trade_date,
          symbol: item.symbol,
          n_mentions: item.n_mentions || 0,
          avg_score: item.avg_score || 0,
          used_score: item.used_score || 0
        }));
        setRedditSignals(signals);
      }

      setUsingFallback(isUsingFallback);
      setFallbackDate(referenceDate);

      // 2. Try to fetch today's candidates, fallback if needed
      let { data: candidatesData, error: candidatesError } = await supabase
        .from('v_reddit_candidates_today')
        .select('*')
        .order('triggered', { ascending: false });

      // If no candidates for today and we're using fallback, get last trading day candidates
      if ((!candidatesData || candidatesData.length === 0) && isUsingFallback) {
        const { data: fallbackCandidates, error: fallbackCandidatesError } = await supabase
          .from('v_reddit_candidates_last_trading_day')
          .select('*')
          .order('triggered', { ascending: false });

        if (!fallbackCandidatesError) {
          candidatesData = fallbackCandidates;
        }
      }

      setCandidates(candidatesData || []);

      // 3. Fetch v_reddit_backtest_lookup (unchanged)
      const { data: backtestData, error: backtestError } = await supabase
        .from('v_reddit_backtest_lookup')
        .select('*')
        .order('sharpe', { ascending: false })
        .limit(100);

      if (!backtestError) {
        setBacktests(backtestData || []);
      }

      // 4. Fetch v_today_live_entries (unchanged)
      const { data: liveData, error: liveError } = await supabase
        .from('v_today_live_entries')
        .select('*')
        .order('triggered', { ascending: false });

      if (!liveError) {
        setLiveEntries(liveData || []);
      }

      setLastUpdate(new Date());
      toast({
        title: "Reddit Data Updated",
        description: `Loaded ${signalsData?.length || 0} signals, ${candidatesData?.length || 0} candidates${isUsingFallback ? ' (using last trading day)' : ''}`,
      });

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Connection error",
        description: "Failed to fetch Reddit sentiment data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRedditData();
  }, []);

  // Helper to find backtest data for a candidate
  const getBacktestForCandidate = (candidate: RedditCandidate): BacktestResult | undefined => {
    return backtests.find(bt => 
      bt.symbol === candidate.symbol &&
      bt.horizon === candidate.horizon
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            🧠 Reddit Sentiment Dashboard
            <Zap className="w-6 h-6 ml-3 text-accent" />
          </h2>
          <p className="text-muted-foreground">
            Live Reddit sentiment signals and trading candidates
          </p>
          {lastUpdate && (
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchRedditData}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Badge className="bg-gradient-primary text-primary-foreground">
            Reddit-only MVP
          </Badge>
        </div>
      </div>

      {/* Market State Banner */}
      {usingFallback && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Market closed</strong> — Live Reddit signals paused. Showing last trading day data 
              {fallbackDate && ` (${new Date(fallbackDate).toLocaleDateString()})`}. 
              Mentions will be 0 until next session.
            </p>
          </div>
        </div>
      )}

      {!usingFallback && redditSignals.length === 0 && candidates.length === 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Still warming up</strong> — Reddit sentiment pipeline is processing today's data.
            </p>
          </div>
        </div>
      )}

      {/* Today's Triggered Candidates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center">
          🎯 Today's Triggered Candidates
        </h3>
        {candidates.filter(c => c.triggered).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.filter(c => c.triggered).map((candidate, index) => (
              <CandidateCard 
                key={index} 
                candidate={candidate} 
                backtest={getBacktestForCandidate(candidate)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No triggered candidates today
          </div>
        )}
      </div>

      {/* Monitoring Candidates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center">
          👀 Monitoring
        </h3>
        {candidates.filter(c => !c.triggered).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.filter(c => !c.triggered).slice(0, 6).map((candidate, index) => (
              <CandidateCard 
                key={index} 
                candidate={candidate} 
                backtest={getBacktestForCandidate(candidate)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No candidates being monitored
          </div>
        )}
      </div>

      {/* Daily Signals */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center">
          📊 Today's Reddit Signals
        </h3>
        {redditSignals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {redditSignals.map((signal, index) => (
              <RedditSignalCard key={index} signal={signal} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              {isLoading ? 'Loading Reddit signals...' : 'No Reddit signals available for today'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SentimentDashboard;