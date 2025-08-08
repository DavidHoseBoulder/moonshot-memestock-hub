import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, MessageCircle, Users, Zap, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import DataSourceIndicator from "@/components/DataSourceIndicator";

interface SentimentData {
  symbol: string;
  name: string;
  hypeScore: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  socialVolume: number;
  keyMentions: string[];
  trendingEmojis: string[];
  influencerSentiment: number;
  communityMood: 'diamond_hands' | 'paper_hands' | 'neutral';
}

const SentimentCard = ({ data }: { data: SentimentData }) => {
  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'text-green-500';
      case 'bearish': return 'text-red-500';
      default: return 'text-yellow-500';
    }
  };

  const getHypeColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getMoodEmoji = (mood: string) => {
    switch (mood) {
      case 'diamond_hands': return '💎🙌';
      case 'paper_hands': return '📄🙌';
      default: return '😐';
    }
  };

  return (
    <Card className="p-6 hover:shadow-lg transition-shadow border bg-card">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-foreground">{data.symbol}</h3>
          <p className="text-sm text-muted-foreground">{data.name}</p>
        </div>
        <Badge className={`${getSentimentColor(data.sentiment)} bg-transparent`}>
          {data.sentiment}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className={`text-2xl font-bold ${getHypeColor(data.hypeScore)}`}>
            {data.hypeScore}
          </div>
          <div className="text-xs text-muted-foreground">Hype Score</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground">{data.socialVolume}</div>
          <div className="text-xs text-muted-foreground">Social Volume</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-muted-foreground">Influencer Score</span>
          <span className="text-sm font-semibold text-foreground">{data.influencerSentiment}/100</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all" 
            style={{ width: `${data.influencerSentiment}%` }}
          ></div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground">Community Mood</span>
          <span className="text-lg">{getMoodEmoji(data.communityMood)}</span>
          <span className="text-sm font-medium text-foreground">{data.communityMood.replace('_', ' ')}</span>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm text-muted-foreground mb-1">Trending Emojis</div>
        <div className="flex gap-1">
          {data.trendingEmojis.map((emoji, index) => (
            <span key={index} className="text-lg">{emoji}</span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-2">Key Mentions</div>
        <div className="flex flex-wrap gap-1">
          {data.keyMentions.slice(0, 3).map((mention, index) => (
            <Badge key={index} variant="outline" className="text-xs">
              {mention}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
};

const SentimentDashboard = () => {
  const [sentimentData, setSentimentData] = useState<SentimentData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [redditPosts, setRedditPosts] = useState<any[]>([]);
  const [dataSourceStatus, setDataSourceStatus] = useState({
    reddit: { status: 'unavailable' as 'unavailable' | 'live' | 'cached' | 'fallback', lastUpdate: undefined as Date | undefined },
    stocktwits: { status: 'unavailable' as 'unavailable' | 'live' | 'cached' | 'fallback', lastUpdate: undefined as Date | undefined },
    news: { status: 'unavailable' as 'unavailable' | 'live' | 'cached' | 'fallback', lastUpdate: undefined as Date | undefined },
    youtube: { status: 'unavailable' as 'unavailable' | 'live' | 'cached' | 'fallback', lastUpdate: undefined as Date | undefined },
    trends: { status: 'unavailable' as 'unavailable' | 'live' | 'cached' | 'fallback', lastUpdate: undefined as Date | undefined },
    twitter: { status: 'unavailable' as 'unavailable' | 'live' | 'cached' | 'fallback', lastUpdate: undefined as Date | undefined }
  });
  
  const { toast } = useToast();

  const analyzeRedditPosts = (posts: any[]) => {
    // Group posts by symbols mentioned (simplified analysis)
    const symbolMap = new Map();
    
    posts.forEach(post => {
      const symbols = post.symbols_mentioned || [];
      symbols.forEach((symbol: string) => {
        if (!symbolMap.has(symbol)) {
          symbolMap.set(symbol, {
            symbol,
            name: `${symbol} Discussion`,
            posts: [],
            totalScore: 0,
            totalComments: 0,
            sentimentSum: 0
          });
        }
        
        const entry = symbolMap.get(symbol);
        entry.posts.push(post);
        entry.totalScore += post.score || 0;
        entry.totalComments += post.num_comments || 0;
        entry.sentimentSum += post.overall_sentiment || 0;
      });
    });
    
    // Convert to SentimentData format
    return Array.from(symbolMap.values()).slice(0, 6).map(entry => ({
      symbol: entry.symbol,
      name: entry.name,
      hypeScore: Math.min(100, Math.max(0, Math.round((entry.sentimentSum / entry.posts.length + 1) * 50))),
      sentiment: entry.sentimentSum > 0.1 ? 'bullish' as const : 
                entry.sentimentSum < -0.1 ? 'bearish' as const : 'neutral' as const,
      socialVolume: entry.totalScore + entry.totalComments,
      keyMentions: entry.posts.slice(0, 3).map((p: any) => p.key_themes?.[0] || 'discussion').filter(Boolean),
      trendingEmojis: entry.sentimentSum > 0 ? ['📈', '🚀'] : 
                     entry.sentimentSum < 0 ? ['📉', '😰'] : ['📊'],
      influencerSentiment: Math.round(Math.min(100, Math.max(0, (entry.sentimentSum + 1) * 50))),
      communityMood: entry.sentimentSum > 0.2 ? 'diamond_hands' as const :
                    entry.sentimentSum < -0.2 ? 'paper_hands' as const : 'neutral' as const
    }));
  };

  const fetchRedditData = async (subreddit = 'stocks') => {
    setIsLoading(true);
    
    // Reset data source status
    setDataSourceStatus({
      reddit: { status: 'unavailable', lastUpdate: undefined },
      stocktwits: { status: 'unavailable', lastUpdate: undefined },
      news: { status: 'unavailable', lastUpdate: undefined },
      youtube: { status: 'unavailable', lastUpdate: undefined },
      trends: { status: 'unavailable', lastUpdate: undefined },
      twitter: { status: 'unavailable', lastUpdate: undefined }
    });

    try {
      const { data, error } = await supabase.functions.invoke('reddit-auth', {
        body: { subreddit, action: 'hot', limit: 25 }
      });

      if (error) {
        console.error('Reddit API error:', error);
        setDataSourceStatus(prev => ({
          ...prev,
          reddit: { status: 'unavailable', lastUpdate: undefined }
        }));
        toast({
          title: "Reddit API unavailable",
          description: "No fallback data will be shown",
          variant: "destructive",
        });
        setSentimentData([]);
        return;
      }

      if (data?.posts) {
        setRedditPosts(data.posts);
        setDataSourceStatus(prev => ({
          ...prev,
          reddit: { status: 'live', lastUpdate: new Date() }
        }));
        
        // Send posts to AI sentiment analysis
        console.log('Sending posts for AI sentiment analysis...');
        const { data: aiData, error: aiError } = await supabase.functions.invoke('ai-sentiment-analysis', {
          body: { posts: data.posts }
        });
        
        if (aiError) {
          console.error('AI sentiment analysis error:', aiError);
        } else {
          console.log('AI analysis completed:', aiData);
        }
        
        // Fetch stored sentiment data from database
        const { data: sentimentData, error: sentimentError } = await supabase
          .from('sentiment_analysis')
          .select('*')
          .eq('subreddit', subreddit)
          .order('post_created_at', { ascending: false })
          .limit(6);
          
        if (sentimentError) {
          console.error('Error fetching sentiment data:', sentimentError);
          // Only use simple analysis as absolute fallback
          const analyzedData = analyzeRedditPosts(data.posts);
          setSentimentData(analyzedData);
        } else if (sentimentData && sentimentData.length > 0) {
          // Convert database sentiment data to display format
          const displayData = sentimentData.map(item => ({
            symbol: item.symbols_mentioned?.[0] || `POST${item.id.slice(0,3)}`,
            name: item.title.slice(0, 30) + '...',
            hypeScore: Math.round((item.overall_sentiment + 1) * 50), // Convert -1 to 1 range to 0-100
            sentiment: item.sentiment_label === 'bullish' || item.sentiment_label === 'very_bullish' ? 'bullish' as const :
                      item.sentiment_label === 'bearish' || item.sentiment_label === 'very_bearish' ? 'bearish' as const : 'neutral' as const,
            socialVolume: item.score + item.num_comments,
            keyMentions: item.key_themes || [item.subreddit],
            trendingEmojis: item.investment_signals?.includes('buy_signal') ? ['🚀', '💎'] : 
                           item.investment_signals?.includes('sell_signal') ? ['📉', '😰'] : ['📈'],
            influencerSentiment: Math.round(item.confidence_score * 100),
            communityMood: item.sentiment_label === 'bullish' || item.sentiment_label === 'very_bullish' ? 'diamond_hands' as const :
                          item.sentiment_label === 'bearish' || item.sentiment_label === 'very_bearish' ? 'paper_hands' as const : 'neutral' as const
          }));
          
          setSentimentData(displayData);
        } else {
          setSentimentData([]);
        }
        
        toast({
          title: "Reddit Data Fetched",
          description: `Analyzed ${data.posts.length} posts from r/${subreddit}`,
        });
      } else {
        setSentimentData([]);
      }
    } catch (error) {
      console.error('Error:', error);
      setSentimentData([]);
      toast({
        title: "Connection error",
        description: "Check console for details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Removed auto-fetch to prevent unnecessary API calls on page load
  // Users can manually refresh data using the refresh button
  // useEffect(() => {
  //   fetchRedditData();
  // }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            🧠 AI Sentiment Analysis
            <Zap className="w-6 h-6 ml-3 text-accent" />
          </h2>
          <p className="text-muted-foreground">Real-time Reddit sentiment tracking</p>
          <div className="flex flex-wrap gap-4 mt-2">
            <DataSourceIndicator 
              source="Reddit" 
              status={dataSourceStatus.reddit.status} 
              lastUpdate={dataSourceStatus.reddit.lastUpdate}
            />
            <DataSourceIndicator 
              source="StockTwits" 
              status={dataSourceStatus.stocktwits.status} 
              lastUpdate={dataSourceStatus.stocktwits.lastUpdate}
            />
            <DataSourceIndicator 
              source="News" 
              status={dataSourceStatus.news.status} 
              lastUpdate={dataSourceStatus.news.lastUpdate}
            />
            <DataSourceIndicator 
              source="YouTube" 
              status={dataSourceStatus.youtube.status} 
              lastUpdate={dataSourceStatus.youtube.lastUpdate}
            />
            <DataSourceIndicator 
              source="Trends" 
              status={dataSourceStatus.trends.status} 
              lastUpdate={dataSourceStatus.trends.lastUpdate}
            />
            <DataSourceIndicator 
              source="Twitter" 
              status={dataSourceStatus.twitter.status} 
              lastUpdate={dataSourceStatus.twitter.lastUpdate}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchRedditData('stocks')}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {dataSourceStatus.reddit.status === 'live' && (
            <Badge className="bg-gradient-primary text-primary-foreground">
              Live Data
            </Badge>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Badge variant="outline">Live Data</Badge>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchRedditData('stocks')}
          disabled={isLoading}
        >
          r/stocks
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchRedditData('investing')}
          disabled={isLoading}
        >
          r/investing
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchRedditData('wallstreetbets')}
          disabled={isLoading}
        >
          r/wallstreetbets
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchRedditData('SecurityAnalysis')}
          disabled={isLoading}
        >
          r/SecurityAnalysis
        </Button>
      </div>

      {sentimentData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sentimentData.map((data, index) => (
            <SentimentCard key={index} data={data} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {isLoading ? 'Loading sentiment data...' : 'No sentiment data available - Reddit API may be down'}
          </p>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          🔥 Real-time Alerts
        </h3>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {redditPosts.slice(0, 3).map((post, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <span className="font-medium">r/{post.subreddit || 'stocks'}: </span>
                <span className="text-muted-foreground">{post.title?.slice(0, 50)}... </span>
                <span className="text-sm text-muted-foreground">
                  ({post.score || 0} upvotes, {post.num_comments || 0} comments)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SentimentDashboard;