import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Target, Zap, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RedditSignal {
  symbol: string;
  trade_date: string;
  avg_score: number;
  used_score: number;
  n_mentions: number;
}

interface RedditCandidate {
  symbol: string;
  trade_date: string;
  horizon: string;
  n_mentions: number;
  used_score: number;
  min_mentions: number;
  pos_thresh: number;
  use_weighted: boolean;
  triggered: boolean;
  priority: number | null;
  side: string;
}

interface BacktestResult {
  symbol: string;
  horizon: string;
  avg_ret: number;
  median_ret: number;
  win_rate: number;
  sharpe: number;
  trades: number;
  composite_score: number;
}

const RedditSignalCard = ({ signal }: { signal: RedditSignal }) => {
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
          <div className="text-base font-semibold">{candidate.used_score?.toFixed(2) || 'N/A'} / {candidate.pos_thresh?.toFixed(2) || 'N/A'}</div>
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
              <div className="font-medium">{(backtest.win_rate * 100).toFixed(0)}%</div>
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
  const [redditSignals, setRedditSignals] = useState<RedditSignal[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [backtests, setBacktests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  const { toast } = useToast();

  const fetchRedditData = async () => {
    setIsLoading(true);
    
    try {
      // Use standardized views for Reddit data
      const { data: dailyScores, error: scoresError } = await supabase
        .from('v_daily_scores')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(50);

      if (scoresError) {
        console.error('Error fetching daily scores:', scoresError);
      } else {
        // Convert to signals format
        const signals = (dailyScores || []).map(item => ({
          symbol: item.symbol,
          trade_date: item.data_date,
          avg_score: item.avg_score,
          used_score: item.used_score,
          n_mentions: item.n_mentions
        })).slice(0, 12);
        setRedditSignals(signals);
      }

      // Use v_today_candidates for candidate data
      const { data: candidatesData, error: candidatesError } = await supabase
        .from('v_today_candidates')
        .select('*')
        .order('triggered', { ascending: false })
        .limit(20);

      if (candidatesError) {
        console.error('Error fetching candidates:', candidatesError);
      } else {
        setCandidates(candidatesData || []);
      }

      // Get backtest results from v_backtest_summary
      const { data: backtestData, error: backtestError } = await supabase
        .from('v_backtest_summary')
        .select('*')
        .order('sharpe', { ascending: false })
        .limit(50);

      if (backtestError) {
        console.error('Error fetching backtest data:', backtestError);
      } else {
        setBacktests(backtestData || []);
      }

      setLastUpdate(new Date());
      toast({
        title: "Data Updated",
        description: `Loaded ${dailyScores?.length || 0} signals and ${candidatesData?.length || 0} candidates`,
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
  const getBacktestForCandidate = (candidate: any): any => {
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
            Reddit MVP
          </Badge>
        </div>
      </div>

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