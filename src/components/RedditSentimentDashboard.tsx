import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, RefreshCw, BarChart3 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface RedditSentimentData {
  symbol: string;
  doc_type: string;
  day: string;
  n_scored: number;
  avg_score: number;
  avg_confidence: number;
  n_pos: number;
  n_neg: number;
  n_neu: number;
}

interface SymbolDetailData extends RedditSentimentData {
  // Used for sparkline data over time
}

const RedditSentimentDashboard = () => {
  const [docType, setDocType] = useState<'all' | 'comment' | 'post'>('all');
  const [minNScored, setMinNScored] = useState([5]);
  const [minAbsScore, setMinAbsScore] = useState([0.15]);
  const [minConf, setMinConf] = useState([0.70]);
  const [bullishLeaders, setBullishLeaders] = useState<RedditSentimentData[]>([]);
  const [bearishLeaders, setBearishLeaders] = useState<RedditSentimentData[]>([]);
  const [symbolDetail, setSymbolDetail] = useState<SymbolDetailData[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchDailyLeaders = async () => {
    setLoading(true);
    try {
      // Fetch bullish leaders
      const { data: bullishData, error: bullishError } = await supabase
        .from('reddit_daily_sentiment_v1')
        .select('*')
        .eq('doc_type', docType === 'all' ? 'all' : docType)
        .gte('day', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .gte('n_scored', minNScored[0])
        .gte('avg_confidence', minConf[0])
        .gte('avg_score', minAbsScore[0])
        .order('avg_score', { ascending: false })
        .order('n_scored', { ascending: false })
        .limit(10);

      if (bullishError) throw bullishError;

      // Fetch bearish leaders
      const { data: bearishData, error: bearishError } = await supabase
        .from('reddit_daily_sentiment_v1')
        .select('*')
        .eq('doc_type', docType === 'all' ? 'all' : docType)
        .gte('day', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .gte('n_scored', minNScored[0])
        .gte('avg_confidence', minConf[0])
        .lte('avg_score', -minAbsScore[0])
        .order('avg_score', { ascending: true })
        .order('n_scored', { ascending: false })
        .limit(10);

      if (bearishError) throw bearishError;

      setBullishLeaders(bullishData || []);
      setBearishLeaders(bearishData || []);

      toast({
        title: "Data Updated",
        description: `Found ${bullishData?.length || 0} bullish and ${bearishData?.length || 0} bearish leaders`,
      });

    } catch (error: any) {
      console.error('Error fetching Reddit sentiment data:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch Reddit sentiment data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSymbolDetail = async (symbol: string) => {
    try {
      const { data, error } = await supabase
        .from('reddit_daily_sentiment_v1')
        .select('*')
        .eq('symbol', symbol)
        .eq('doc_type', docType === 'all' ? 'all' : docType)
        .gte('day', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('day', { ascending: true });

      if (error) throw error;
      setSymbolDetail(data || []);
    } catch (error: any) {
      console.error('Error fetching symbol detail:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch symbol detail",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchDailyLeaders();
  }, [docType, minNScored, minAbsScore, minConf]);

  const getSentimentColor = (score: number) => {
    if (score > 0) return 'text-green-600 dark:text-green-400';
    if (score < 0) return 'text-red-600 dark:text-red-400';
    return 'text-muted-foreground';
  };

  const getSentimentBadgeVariant = (score: number) => {
    if (score > 0) return 'default';
    if (score < 0) return 'destructive';
    return 'outline';
  };

  const SentimentCard = ({ data, isBullish }: { data: RedditSentimentData; isBullish: boolean }) => (
    <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer" 
          onClick={() => {
            setSelectedSymbol(data.symbol);
            fetchSymbolDetail(data.symbol);
          }}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">{data.symbol}</h3>
          <p className="text-sm text-muted-foreground">
            {data.day} • {data.doc_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isBullish ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-600" />
          )}
          <Badge variant={getSentimentBadgeVariant(data.avg_score)}>
            {data.avg_score.toFixed(3)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-muted-foreground">Posts Scored</div>
          <div className="font-semibold text-foreground">{data.n_scored}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Confidence</div>
          <div className="font-semibold text-foreground">{(data.avg_confidence * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-muted-foreground">Pos/Neu/Neg</div>
          <div className="font-semibold text-foreground">
            {data.n_pos}/{data.n_neu}/{data.n_neg}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Score</div>
          <div className={`font-semibold ${getSentimentColor(data.avg_score)}`}>
            {data.avg_score.toFixed(3)}
          </div>
        </div>
      </div>
    </Card>
  );

  const SymbolDetailPanel = () => {
    if (!selectedSymbol || symbolDetail.length === 0) {
      return (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            Select a symbol to view detailed sentiment history
          </div>
        </Card>
      );
    }

    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-foreground">
            {selectedSymbol} • {docType.toUpperCase()} • 14-Day History
          </h3>
          <Button 
            variant="outline" 
            onClick={() => setSelectedSymbol(null)}
            size="sm"
          >
            Close
          </Button>
        </div>
        
        <div className="space-y-3">
          {symbolDetail.map((item, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="text-sm font-medium text-foreground">
                  {new Date(item.day).toLocaleDateString()}
                </div>
                <Badge variant={getSentimentBadgeVariant(item.avg_score)}>
                  {item.avg_score.toFixed(3)}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Scored: </span>
                  <span className="font-medium text-foreground">{item.n_scored}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Conf: </span>
                  <span className="font-medium text-foreground">{(item.avg_confidence * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">+/-/=: </span>
                  <span className="font-medium text-foreground">
                    {item.n_pos}/{item.n_neg}/{item.n_neu}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reddit Sentiment Analysis</h1>
          <p className="text-muted-foreground">
            Daily sentiment leaders with configurable thresholds
          </p>
        </div>
        <Button onClick={fetchDailyLeaders} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Controls */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Doc Type Toggle */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Content Type
            </label>
            <Tabs value={docType} onValueChange={(value) => setDocType(value as 'all' | 'comment' | 'post')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="comment">Comments</TabsTrigger>
                <TabsTrigger value="post">Posts</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Min N Scored Slider */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Min Posts Scored: {minNScored[0]}
            </label>
            <Slider
              value={minNScored}
              onValueChange={setMinNScored}
              max={50}
              min={1}
              step={1}
              className="w-full"
            />
          </div>

          {/* Min Abs Score Slider */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Min |Score|: {minAbsScore[0]}
            </label>
            <Slider
              value={minAbsScore}
              onValueChange={setMinAbsScore}
              max={1}
              min={0.01}
              step={0.01}
              className="w-full"
            />
          </div>

          {/* Min Confidence Slider */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Min Confidence: {(minConf[0] * 100).toFixed(0)}%
            </label>
            <Slider
              value={minConf}
              onValueChange={setMinConf}
              max={1}
              min={0.1}
              step={0.05}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      {/* Symbol Detail Panel */}
      {selectedSymbol && <SymbolDetailPanel />}

      {/* Daily Leaders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bullish Leaders */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <TrendingUp className="w-5 h-5" />
              Daily Leaders (Bullish)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-3">
              {bullishLeaders.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No bullish leaders found with current filters
                </div>
              ) : (
                bullishLeaders.map((data, index) => (
                  <SentimentCard key={index} data={data} isBullish={true} />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bearish Leaders */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <TrendingDown className="w-5 h-5" />
              Daily Leaders (Bearish)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-3">
              {bearishLeaders.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No bearish leaders found with current filters
                </div>
              ) : (
                bearishLeaders.map((data, index) => (
                  <SentimentCard key={index} data={data} isBullish={false} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* No Data Message */}
      {bullishLeaders.length === 0 && bearishLeaders.length === 0 && !loading && (
        <Card className="p-8">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Data Found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your filters or check if the Reddit sentiment view needs to be refreshed.
            </p>
            <Button onClick={fetchDailyLeaders} variant="outline">
              Refresh Data
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default RedditSentimentDashboard;