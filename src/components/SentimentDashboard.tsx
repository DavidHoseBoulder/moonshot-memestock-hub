import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Target, Zap, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RedditDailySignal {
  trade_date: string;
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
  used_score: number | null;
  n_mentions: number;
  triggered: boolean;
  use_weighted?: boolean;
  side?: string;
  avg_ret?: number;
  win_rate?: number;
  trades?: number;
  sharpe?: number;
}

const RedditSignalCard = ({ signal }: { signal: RedditDailySignal }) => {
  const getSentimentColor = (score: number) => {
    if (score > 0.1) return 'text-green-600 dark:text-green-400';
    if (score < -0.1) return 'text-red-600 dark:text-red-400';
    return 'text-yellow-600 dark:text-yellow-400';
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

const CandidateCard = ({ candidate }: { candidate: RedditCandidate }) => {
  const side = candidate.side || 'LONG';
  
  // Get sentiment colors and labels for monitoring candidates
  const getSentimentColor = (score: number | null) => {
    if (score === null) return 'text-muted-foreground';
    if (score > 0.05) return 'text-green-600 dark:text-green-400';
    if (score < -0.05) return 'text-red-600 dark:text-red-400';
    return 'text-yellow-600 dark:text-yellow-400';
  };

  const getSentimentLabel = (score: number | null, triggered: boolean) => {
    if (triggered) return "🎯 TRIGGERED";
    if (score === null) return "Monitoring";
    if (score > 0.05) return "Bullish (Monitoring)";
    if (score < -0.05) return "Bearish (Monitoring)";
    return "Neutral (Monitoring)";
  };

  const getSentimentBadgeVariant = (score: number | null, triggered: boolean) => {
    if (triggered) return "default";
    if (score === null) return "outline";
    if (score > 0.05) return "secondary"; // Use secondary for bullish monitoring
    if (score < -0.05) return "destructive"; // Use destructive for bearish monitoring
    return "outline"; // Use outline for neutral monitoring
  };
  
  return (
    <Card className={`p-4 hover:shadow-lg transition-shadow border bg-card ${candidate.triggered ? 'border-success/60 ring-1 ring-success/30 shadow-success' : ''}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            {candidate.symbol} • {candidate.horizon} • <Badge variant="outline" className="text-foreground">{side}</Badge>
          </h3>
        </div>
        <div className="flex gap-2">
          <Badge 
            variant={getSentimentBadgeVariant(candidate.used_score, candidate.triggered)} 
            className={candidate.triggered ? "text-foreground" : getSentimentColor(candidate.used_score)}
          >
            {getSentimentLabel(candidate.used_score, candidate.triggered)}
          </Badge>
          {candidate.triggered && <Target className="w-4 h-4 text-green-600 dark:text-green-400" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-sm text-muted-foreground">Mentions</div>
          <div className="text-base font-semibold text-foreground">{candidate.n_mentions} / {candidate.min_mentions}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Score</div>
          <div className={`text-base font-semibold ${getSentimentColor(candidate.used_score)}`}>
            {candidate.used_score !== null ? candidate.used_score.toFixed(2) : 'N/A'} / {candidate.pos_thresh.toFixed(2)}
          </div>
        </div>
      </div>

      {(candidate.avg_ret !== undefined || candidate.win_rate !== undefined || candidate.trades !== undefined) && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-sm text-muted-foreground mb-2">Historical Performance</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {candidate.avg_ret !== undefined && (
              <div>
                <div className="font-medium text-foreground">{(candidate.avg_ret * 100).toFixed(1)}%</div>
                <div className="text-muted-foreground">Avg Return</div>
              </div>
            )}
            {candidate.win_rate !== undefined && (
              <div>
                <div className="font-medium text-foreground">{(candidate.win_rate * 100).toFixed(0)}%</div>
                <div className="text-muted-foreground">Win Rate</div>
              </div>
            )}
            {candidate.trades !== undefined && (
              <div>
                <div className="font-medium text-foreground">{candidate.trades}</div>
                <div className="text-muted-foreground">Trades</div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

const SentimentDashboard = () => {
  const [redditSignals, setRedditSignals] = useState<RedditDailySignal[]>([]);
  const [candidates, setCandidates] = useState<RedditCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isToday, setIsToday] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [asOfDate, setAsOfDate] = useState<Date | null>(null);
  
  const { toast } = useToast();

  const fetchRedditData = async () => {
    setIsLoading(true);
    
    try {
      let usedFallback = false;
      let dataDate: Date | null = null;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

      // 1. Try today's signals first, fallback if empty
      let { data: signalsData } = await supabase
        .from('v_reddit_daily_signals')
        .select('*')
        .order('trade_date', { ascending: false })
        .limit(20);

      if (!signalsData || signalsData.length === 0) {
        const { data: fallbackSignals } = await supabase
          .from('v_reddit_daily_signals_last_trading_day')
          .select('*')
          .limit(20);

        if (fallbackSignals && fallbackSignals.length > 0) {
          signalsData = fallbackSignals;
          usedFallback = true;
        }
      }

      // Extract date string from signals data (avoid timezone issues)
      let dataDateString: string | null = null;
      if (signalsData && signalsData.length > 0) {
        dataDateString = signalsData[0].trade_date;
      }

      setRedditSignals(signalsData || []);

      // 2. Try today's candidates first, fallback if empty
      let { data: candidatesData } = await supabase
        .from('v_reddit_candidates_today')
        .select('*')
        .order('used_score', { ascending: false, nullsFirst: false })
        .order('symbol', { ascending: true })
        .order('horizon', { ascending: true });

      if (!candidatesData || candidatesData.length === 0) {
        const { data: fallbackCandidates } = await supabase
          .from('v_reddit_candidates_last_trading_day')
          .select('*')
          .order('used_score', { ascending: false, nullsFirst: false })
          .order('symbol', { ascending: true })
          .order('horizon', { ascending: true });

        if (fallbackCandidates && fallbackCandidates.length > 0) {
          candidatesData = fallbackCandidates;
          usedFallback = true;
          // If we didn't get a date from signals, get it from candidates
          if (!dataDateString && fallbackCandidates.length > 0) {
            dataDateString = fallbackCandidates[0].trade_date;
          }
        }
      } else if (candidatesData.length > 0) {
        // Check if candidates are for today
        const candidateDate = candidatesData[0].trade_date;
        
        // If candidate date matches today, we're not using fallback
        if (candidateDate === today) {
          usedFallback = false;
        } else {
          // Data exists but it's not for today, so it's essentially fallback
          usedFallback = true;
        }
        
        // If we didn't get date from signals, use candidate date
        if (!dataDateString) {
          dataDateString = candidateDate;
        }
      }

      // Convert to display format (MM/DD/YYYY)
      dataDate = dataDateString ? new Date(dataDateString + 'T12:00:00') : null;

      setCandidates(candidatesData || []);
      setIsFallback(usedFallback);
      setIsToday(!usedFallback);
      setAsOfDate(dataDate);
      setLastUpdate(new Date());
      
      toast({
        title: "Reddit Data Updated",
        description: `Loaded ${signalsData?.length || 0} signals, ${candidatesData?.length || 0} candidates${usedFallback ? ' (last trading day)' : ''}`,
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

  console.log('SentimentDashboard rendering - signals:', redditSignals.length, 'candidates:', candidates.length, 'loading:', isLoading, 'fallback:', isFallback);

  // Helper function to get banner message
  const getBannerMessage = () => {
    if (isFallback && asOfDate) {
      return `Market closed — Showing last trading day data (as of ${asOfDate.toLocaleDateString()}).`;
    }
    if (isToday && asOfDate) {
      return `Live Reddit signals for ${asOfDate.toLocaleDateString()}.`;
    }
    return null;
  };

  const bannerMessage = getBannerMessage();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center text-foreground">
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

      {/* Global Status Banner */}
      {bannerMessage && (
        <div className={`border rounded-lg p-4 ${isFallback ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isFallback ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
            <p className={`text-sm ${isFallback ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200'}`}>
              {bannerMessage}
            </p>
          </div>
        </div>
      )}
      
      {/* Today's Triggered Candidates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center justify-between text-foreground">
          <span>🎯 Today's Triggered Candidates</span>
          {isFallback && <span className="text-sm text-muted-foreground font-normal">As of last trading day</span>}
        </h3>
        {candidates.filter(c => c.triggered).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.filter(c => c.triggered).map((candidate, index) => (
              <CandidateCard 
                key={`triggered-${candidate.symbol}-${candidate.horizon}-${index}`} 
                candidate={candidate}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No triggered candidates
          </div>
        )}
      </div>

      {/* Monitoring Candidates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center justify-between text-foreground">
          <span>👀 Monitoring</span>
          {isFallback && <span className="text-sm text-muted-foreground font-normal">As of last trading day</span>}
        </h3>
        {candidates.filter(c => !c.triggered).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.filter(c => !c.triggered).slice(0, 6).map((candidate, index) => (
              <CandidateCard 
                key={`monitoring-${candidate.symbol}-${candidate.horizon}-${index}`} 
                candidate={candidate}
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
        <h3 className="text-lg font-semibold flex items-center justify-between text-foreground">
          <span>📊 Today's Reddit Signals</span>
          {isFallback && <span className="text-sm text-muted-foreground font-normal">As of last trading day</span>}
        </h3>
        {redditSignals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {redditSignals.map((signal, index) => (
              <RedditSignalCard key={`signal-${signal.symbol}-${index}`} signal={signal} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              {isLoading ? 'Loading Reddit signals...' : 'No Reddit signals available'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SentimentDashboard;
