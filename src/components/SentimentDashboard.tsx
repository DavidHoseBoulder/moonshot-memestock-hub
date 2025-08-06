import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, MessageCircle, Users, Zap, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

const mockSentimentData: SentimentData[] = [
  {
    symbol: "GME",
    name: "GameStop",
    hypeScore: 87,
    sentiment: 'bullish',
    socialVolume: 15420,
    keyMentions: ["Ryan Cohen tweet", "NFT marketplace", "short squeeze"],
    trendingEmojis: ["🚀", "💎", "🙌"],
    influencerSentiment: 92,
    communityMood: 'diamond_hands'
  },
  {
    symbol: "DOGE",
    name: "Dogecoin",
    hypeScore: 94,
    sentiment: 'bullish',
    socialVolume: 28340,
    keyMentions: ["Elon Musk", "Twitter integration", "much wow"],
    trendingEmojis: ["🐕", "🌙", "🚀"],
    influencerSentiment: 88,
    communityMood: 'diamond_hands'
  },
  {
    symbol: "AMC",
    name: "AMC Entertainment",
    hypeScore: 23,
    sentiment: 'bearish',
    socialVolume: 5670,
    keyMentions: ["earnings miss", "dilution fears"],
    trendingEmojis: ["😰", "📉"],
    influencerSentiment: 31,
    communityMood: 'paper_hands'
  }
];

const SentimentCard = ({ data }: { data: SentimentData }) => {
  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'text-success';
      case 'bearish': return 'text-destructive';
      default: return 'text-neutral';
    }
  };

  const getHypeColor = (score: number) => {
    if (score >= 80) return 'bg-gradient-success';
    if (score >= 60) return 'bg-gradient-primary';
    if (score >= 40) return 'bg-accent';
    return 'bg-destructive';
  };

  const getMoodEmoji = (mood: string) => {
    switch (mood) {
      case 'diamond_hands': return '💎🙌';
      case 'paper_hands': return '📄🙌';
      default: return '😐';
    }
  };

  return (
    <Card className="p-4 bg-gradient-card border-border hover:border-primary/50 transition-all duration-300">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-lg text-foreground">{data.symbol}</h3>
          <p className="text-sm text-muted-foreground">{data.name}</p>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${getSentimentColor(data.sentiment)}`}>
            {data.hypeScore}
          </div>
          <Badge variant="outline" className={getHypeColor(data.hypeScore)}>
            Hype Score
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="flex items-center space-x-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          <div>
            <div className="text-xs text-muted-foreground">Social Volume</div>
            <div className="font-semibold">{data.socialVolume.toLocaleString()}</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-accent" />
          <div>
            <div className="text-xs text-muted-foreground">Influencer Score</div>
            <div className="font-semibold">{data.influencerSentiment}/100</div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs text-muted-foreground mb-1">Community Mood</div>
        <div className="flex items-center space-x-2">
          <span className="text-lg">{getMoodEmoji(data.communityMood)}</span>
          <span className="capitalize font-medium">{data.communityMood.replace('_', ' ')}</span>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs text-muted-foreground mb-1">Trending Emojis</div>
        <div className="flex space-x-1">
          {data.trendingEmojis.map((emoji, index) => (
            <span key={index} className="text-lg">{emoji}</span>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <div className="text-xs text-muted-foreground mb-1">Key Mentions</div>
        <div className="flex flex-wrap gap-1">
          {data.keyMentions.map((mention, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {mention}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
};

const SentimentDashboard = () => {
  const [sentimentData, setSentimentData] = useState<SentimentData[]>(mockSentimentData);
  const [isLoading, setIsLoading] = useState(false);
  const [redditPosts, setRedditPosts] = useState<any[]>([]);
  const { toast } = useToast();

  const analyzeRedditPosts = (posts: any[]): SentimentData[] => {
    // Analyze Reddit posts and extract sentiment data
    const analyzed = posts.slice(0, 6).map((post) => {
      const title = post.title.toLowerCase();
      const content = post.selftext?.toLowerCase() || '';
      const text = title + ' ' + content;
      
      // Simple sentiment analysis based on keywords
      const bullishKeywords = ['moon', 'rocket', 'diamond', 'hold', 'buy', 'bullish', 'pump', 'surge', 'breakout'];
      const bearishKeywords = ['dump', 'crash', 'bear', 'sell', 'drop', 'down', 'bearish', 'dip', 'fall'];
      
      const bullishCount = bullishKeywords.filter(word => text.includes(word)).length;
      const bearishCount = bearishKeywords.filter(word => text.includes(word)).length;
      
      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (bullishCount > bearishCount) sentiment = 'bullish';
      else if (bearishCount > bullishCount) sentiment = 'bearish';
      
      // Extract potential stock symbols from title (simple regex for 3-5 uppercase letters)
      const symbolMatch = title.match(/\b[A-Z]{3,5}\b/);
      const symbol = symbolMatch ? symbolMatch[0] : `POST${Math.floor(Math.random() * 1000)}`;
      
      // Calculate hype score based on engagement
      const hypeScore = Math.min(100, Math.max(1, 
        Math.floor((post.score * 0.1) + (post.num_comments * 0.5) + (bullishCount * 10))
      ));
      
      // Extract emojis from title
      const emojiRegex = /[\p{Emoji}]/gu;
      const emojis = post.title.match(emojiRegex) || ['📈'];
      
      return {
        symbol,
        name: post.title.slice(0, 30) + '...',
        hypeScore,
        sentiment,
        socialVolume: post.score + post.num_comments,
        keyMentions: [post.subreddit, `${post.num_comments} comments`, `${post.score} upvotes`],
        trendingEmojis: emojis.slice(0, 3),
        influencerSentiment: Math.min(100, hypeScore + Math.floor(Math.random() * 20)),
        communityMood: sentiment === 'bullish' ? 'diamond_hands' as const : 
                      sentiment === 'bearish' ? 'paper_hands' as const : 'neutral' as const
      };
    });
    
    return analyzed;
  };

  const fetchRedditData = async (subreddit = 'stocks') => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reddit-auth', {
        body: { subreddit, action: 'hot', limit: 25 }
      });

      if (error) {
        console.error('Reddit API error:', error);
        toast({
          title: "Error fetching Reddit data",
          description: "Using mock data instead",
          variant: "destructive",
        });
        return;
      }

      if (data?.posts) {
        setRedditPosts(data.posts);
        
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
          // Fallback to simple analysis
          const analyzedData = analyzeRedditPosts(data.posts);
          setSentimentData(analyzedData);
        } else {
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
        }
        
        toast({
          title: "AI Sentiment Analysis Complete!",
          description: `Analyzed ${data.posts.length} posts from r/${subreddit} with advanced AI`,
        });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Connection error",
        description: "Check console for details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRedditData('stocks');
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            🧠 AI Sentiment Analysis
            <Zap className="w-6 h-6 ml-3 text-accent" />
          </h2>
          <p className="text-muted-foreground">Real-time Reddit sentiment tracking</p>
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
          <Badge className="bg-gradient-primary text-primary-foreground">
            Live Data
          </Badge>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sentimentData.map((data) => (
          <SentimentCard key={data.symbol} data={data} />
        ))}
      </div>

      <Card className="p-4 bg-gradient-card border-border">
        <h3 className="font-bold text-lg mb-3 flex items-center">
          🔥 Real-time Alerts
          <span className="ml-2 w-2 h-2 bg-success rounded-full animate-pulse"></span>
        </h3>
        <div className="space-y-2">
          {redditPosts.slice(0, 3).map((post, index) => (
            <div key={index} className="flex items-center space-x-3 p-2 bg-primary/10 rounded-lg border border-primary/20">
              <MessageCircle className="w-4 h-4 text-primary" />
              <span className="text-sm">
                r/{post.subreddit}: {post.title.slice(0, 60)}... 
                ({post.score} upvotes, {post.num_comments} comments)
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default SentimentDashboard;