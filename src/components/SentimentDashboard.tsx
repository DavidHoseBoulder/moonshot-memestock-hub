import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, MessageCircle, Users, Zap } from "lucide-react";

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
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            🧠 AI Sentiment Analysis
            <Zap className="w-6 h-6 ml-3 text-accent" />
          </h2>
          <p className="text-muted-foreground">Real-time social media sentiment tracking</p>
        </div>
        <Badge className="bg-gradient-primary text-primary-foreground">
          Live Data
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockSentimentData.map((data) => (
          <SentimentCard key={data.symbol} data={data} />
        ))}
      </div>

      <Card className="p-4 bg-gradient-card border-border">
        <h3 className="font-bold text-lg mb-3 flex items-center">
          🔥 Real-time Alerts
          <span className="ml-2 w-2 h-2 bg-success rounded-full animate-pulse"></span>
        </h3>
        <div className="space-y-2">
          <div className="flex items-center space-x-3 p-2 bg-success/10 rounded-lg border border-success/20">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-sm">DOGE sentiment spiking +47% in last hour - viral TikTok detected</span>
          </div>
          <div className="flex items-center space-x-3 p-2 bg-primary/10 rounded-lg border border-primary/20">
            <MessageCircle className="w-4 h-4 text-primary" />
            <span className="text-sm">GME: Ryan Cohen mentioned "power to the players" - engagement +234%</span>
          </div>
          <div className="flex items-center space-x-3 p-2 bg-destructive/10 rounded-lg border border-destructive/20">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-sm">AMC: Paper hands ratio increasing - community mood shifting</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SentimentDashboard;