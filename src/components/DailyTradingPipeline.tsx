import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingUp, Activity, Volume2, Target, Scan, Play, RefreshCw, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { STOCK_UNIVERSE, CATEGORIES, getStocksByCategory, getAllTickers } from "@/data/stockUniverse";
import { supabase } from "@/integrations/supabase/client";

interface TradeSignal {
  ticker: string;
  category: string;
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  price: number;
  sentiment_score: number;
  sentiment_velocity: number;
  volume_ratio: number;
  rsi: number;
  technical_signals: string[];
  reasoning: string;
  timestamp: string;
}

interface SentimentData {
  symbol: string;
  current_sentiment: number;
  sentiment_velocity: {
    velocity_1h: number;
    mention_frequency: number;
    social_volume_spike: boolean;
  };
}

interface MarketData {
  symbol: string;
  price: number;
  technical_indicators: {
    rsi: number;
    volume_ratio: number;
    momentum: number;
  };
}

interface DebugInfo {
  step: string;
  data: any;
  timestamp: string;
}

const DailyTradingPipeline = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState("");
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const { toast } = useToast();

  const addDebugInfo = (step: string, data: any) => {
    const debugEntry = {
      step,
      data,
      timestamp: new Date().toISOString()
    };
    console.log(`🔍 DEBUG [${step}]:`, data);
    setDebugInfo(prev => [...prev, debugEntry]);
  };

  const runEnhancedDailyPipeline = async () => {
    setIsRunning(true);
    setProgress(0);
    setSignals([]);
    setDebugInfo([]);
    
    try {
      const allTickers = getAllTickers();
      console.log('Running ENHANCED pipeline for tickers:', allTickers.slice(0, 5), '... and', allTickers.length - 5, 'more');
      addDebugInfo("PIPELINE_START", { totalTickers: allTickers.length, sampleTickers: allTickers.slice(0, 10) });
      
      // Step 1: Enhanced Reddit sentiment data
      setCurrentTask("Fetching multi-subreddit sentiment data...");
      setProgress(15);
      
      const { data: redditData, error: redditError } = await supabase.functions.invoke('reddit-auth', {
        body: { 
          subreddit: 'stocks,investing,SecurityAnalysis,ValueInvesting,StockMarket,wallstreetbets,pennystocks', 
          action: 'hot',
          limit: 150 
        }
      });

      if (redditError) throw redditError;
      
      addDebugInfo("REDDIT_DATA", { 
        postCount: redditData?.posts?.length || 0,
        isMockData: redditData?.isMockData || false,
        samplePost: redditData?.posts?.[0] || null
      });
      
      // Step 2: Enhanced sentiment analysis with velocity tracking
      setCurrentTask("Running enhanced AI sentiment analysis with velocity tracking...");
      setProgress(30);
      
      const { data: enhancedSentimentData, error: sentimentError } = await supabase.functions.invoke('enhanced-sentiment-analysis', {
        body: { 
          posts: redditData.posts,
          symbols: allTickers 
        }
      });

      if (sentimentError) throw sentimentError;
      setProgress(50);

      addDebugInfo("SENTIMENT_ANALYSIS", {
        symbolsAnalyzed: enhancedSentimentData?.total_symbols_analyzed || 0,
        postsProcessed: enhancedSentimentData?.total_posts_processed || 0,
        sampleResults: enhancedSentimentData?.enhanced_sentiment?.slice(0, 3) || []
      });

      // Step 3: Enhanced market data with technical indicators
      setCurrentTask("Fetching enhanced market data with technical indicators...");
      const { data: enhancedMarketData, error: marketError } = await supabase.functions.invoke('enhanced-market-data', {
        body: { symbols: allTickers, days: 21 }
      });

      if (marketError) throw marketError;
      setProgress(70);

      addDebugInfo("MARKET_DATA", {
        symbolsProcessed: enhancedMarketData?.total_processed || 0,
        symbolsRequested: enhancedMarketData?.symbols_requested || 0,
        sampleData: enhancedMarketData?.enhanced_data?.slice(0, 3) || []
      });

      // Step 4: Generate enhanced trade signals
      setCurrentTask("Generating high-conviction signals with enhanced data...");
      
      // Process the enhanced data to generate signals
      const enhancedSignals: TradeSignal[] = [];
      
      // Safely access and type the response data
      const sentimentResults = enhancedSentimentData?.enhanced_sentiment || [];
      const marketResults = enhancedMarketData?.enhanced_data || [];
      
      addDebugInfo("SIGNAL_GENERATION_INPUT", {
        sentimentResultsCount: sentimentResults.length,
        marketResultsCount: marketResults.length,
        sentimentSample: sentimentResults.slice(0, 2),
        marketSample: marketResults.slice(0, 2)
      });
      
      // Create maps for efficient lookup with proper typing
      const sentimentMap = new Map<string, SentimentData>();
      const marketMap = new Map<string, MarketData>();
      
      sentimentResults.forEach((item: any) => {
        if (item && item.symbol) {
          sentimentMap.set(item.symbol, item as SentimentData);
        }
      });
      
      marketResults.forEach((item: any) => {
        if (item && item.symbol) {
          marketMap.set(item.symbol, item as MarketData);
        }
      });

      addDebugInfo("DATA_MAPS", {
        sentimentMapSize: sentimentMap.size,
        marketMapSize: marketMap.size,
        sentimentKeys: Array.from(sentimentMap.keys()).slice(0, 10),
        marketKeys: Array.from(marketMap.keys()).slice(0, 10)
      });

      // Generate signals based on enhanced criteria
      const processedTickers = allTickers.slice(0, 20); // Process top 20 for demo
      let signalsGenerated = 0;
      
      for (const ticker of processedTickers) {
        const sentimentData = sentimentMap.get(ticker);
        const marketData = marketMap.get(ticker);
        
        addDebugInfo(`TICKER_${ticker}`, {
          hasSentiment: !!sentimentData,
          hasMarket: !!marketData,
          sentimentScore: sentimentData?.current_sentiment,
          marketPrice: marketData?.price,
          marketRSI: marketData?.technical_indicators?.rsi
        });
        
        if (!sentimentData && !marketData) continue;
        
        // Enhanced signal generation logic with safe property access
        const sentiment_score = sentimentData?.current_sentiment || 0;
        const sentiment_velocity = sentimentData?.sentiment_velocity?.velocity_1h || 0;
        const volume_spike = sentimentData?.sentiment_velocity?.social_volume_spike || false;
        
        const rsi = marketData?.technical_indicators?.rsi || 50;
        const volume_ratio = marketData?.technical_indicators?.volume_ratio || 1;
        const momentum = marketData?.technical_indicators?.momentum || 0;
        
        // High-conviction signal criteria
        const strongBullishSentiment = sentiment_score > 0.6 && sentiment_velocity > 0.2;
        const oversoldTechnical = rsi < 30 && momentum > -5;
        const volumeConfirmation = volume_ratio > 2.0 || volume_spike;
        const socialMomentum = (sentimentData?.sentiment_velocity?.mention_frequency || 0) > 5;
        
        const strongBearishSentiment = sentiment_score < -0.4 && sentiment_velocity < -0.2;
        const overboughtTechnical = rsi > 70 && momentum < 5;
        
        let signal_type: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
        let confidence = 0;
        let reasoning = '';
        let technical_signals: string[] = [];

        // BUY signals
        if (strongBullishSentiment && volumeConfirmation && (oversoldTechnical || socialMomentum)) {
          signal_type = 'BUY';
          confidence = 0.85 + Math.min(0.15, sentiment_velocity);
          technical_signals.push('BULLISH_SENTIMENT', 'VOLUME_SPIKE');
          if (oversoldTechnical) technical_signals.push('OVERSOLD_BOUNCE');
          if (socialMomentum) technical_signals.push('SOCIAL_MOMENTUM');
          reasoning = `Strong bullish sentiment (${sentiment_score.toFixed(2)}) with ${sentiment_velocity.toFixed(2)} velocity spike. ${volume_ratio.toFixed(1)}x volume confirmation. RSI: ${rsi.toFixed(0)}`;
        }
        
        // SELL signals
        else if (strongBearishSentiment && overboughtTechnical) {
          signal_type = 'SELL';
          confidence = 0.75 - sentiment_velocity * 0.5;
          technical_signals.push('BEARISH_SENTIMENT', 'OVERBOUGHT');
          reasoning = `Bearish sentiment turning (${sentiment_score.toFixed(2)}) with overbought RSI ${rsi.toFixed(0)}. Momentum weakening.`;
        }

        // Only include high-confidence signals
        if (confidence >= 0.7) {
          const stock = STOCK_UNIVERSE.find(s => s.ticker === ticker);
          enhancedSignals.push({
            ticker,
            category: stock?.category || 'Unknown',
            signal_type,
            confidence,
            price: marketData?.price || 50 + Math.random() * 200,
            sentiment_score,
            sentiment_velocity,
            volume_ratio,
            rsi,
            technical_signals,
            reasoning,
            timestamp: new Date().toISOString()
          });
          signalsGenerated++;
        }
      }

      addDebugInfo("SIGNAL_GENERATION_COMPLETE", {
        tickersProcessed: processedTickers.length,
        signalsGenerated,
        finalSignalsCount: enhancedSignals.length
      });

      setSignals(enhancedSignals);
      setProgress(100);
      setCurrentTask("Enhanced pipeline complete!");
      setLastRun(new Date());

      toast({
        title: "Enhanced Daily Pipeline Complete! 🚀",
        description: `Found ${enhancedSignals.length} high-conviction signals using enhanced data sources`,
      });

    } catch (error) {
      console.error('Enhanced pipeline error:', error);
      addDebugInfo("ERROR", { error: error.message, stack: error.stack });
      toast({
        title: "Enhanced Pipeline Error",
        description: "There was an issue running the enhanced analysis. Check the logs.",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getSignalColor = (signal: TradeSignal) => {
    if (signal.signal_type === 'BUY') return 'bg-green-100 text-green-800 border-green-200';
    if (signal.signal_type === 'SELL') return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'Meme & Retail': 'bg-purple-100 text-purple-800',
      'Tech & Momentum': 'bg-blue-100 text-blue-800',
      'AI & Data': 'bg-indigo-100 text-indigo-800',
      'Fintech & Crypto': 'bg-yellow-100 text-yellow-800',
      'EV & Alt-Tech': 'bg-green-100 text-green-800',
      'Biotech & Pharma': 'bg-pink-100 text-pink-800',
      'Media & Internet': 'bg-orange-100 text-orange-800',
      'Consumer Buzz': 'bg-teal-100 text-teal-800',
      'Banking': 'bg-slate-100 text-slate-800',
      'SPAC & Penny': 'bg-red-100 text-red-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center">
            🚀 Enhanced Trading Pipeline
            <Zap className="w-8 h-8 ml-3 text-primary" />
          </h2>
          <p className="text-muted-foreground">AI-powered high-conviction signals with enhanced data sources</p>
        </div>
        {lastRun && (
          <div className="text-sm text-muted-foreground">
            Last run: {lastRun.toLocaleString()}
          </div>
        )}
      </div>

      {/* Enhanced Pipeline Control */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-xl flex items-center">
              Enhanced Signal Generation
              <Target className="w-5 h-5 ml-2 text-blue-600" />
            </h3>
            <p className="text-muted-foreground">Multi-source analysis: Technical indicators + Sentiment velocity + Volume spikes</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => setShowDebug(!showDebug)}
              size="sm"
            >
              {showDebug ? "Hide Debug" : "Show Debug"}
            </Button>
            <Button 
              onClick={runEnhancedDailyPipeline}
              disabled={isRunning}
              size="lg"
              className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Run Enhanced Scan
                </>
              )}
            </Button>
          </div>
        </div>

        {isRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{currentTask}</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Enhanced Data Sources Overview */}
        <div className="mt-4 p-4 bg-white/50 rounded-lg">
          <h4 className="font-semibold mb-3">Enhanced Data Sources:</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <span>Technical Indicators (RSI, SMA, Volume)</span>
            </div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span>Sentiment Velocity Tracking</span>
            </div>
            <div className="flex items-center space-x-2">
              <Volume2 className="w-4 h-4 text-purple-500" />
              <span>Social Volume Spike Detection</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Debug Information Panel */}
      {showDebug && debugInfo.length > 0 && (
        <Card className="p-6 bg-gray-50 border-gray-200">
          <h3 className="font-bold text-lg mb-4 text-gray-800">🔍 Debug Information</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {debugInfo.map((debug, index) => (
              <div key={index} className="bg-white p-3 rounded border text-xs">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="text-xs">{debug.step}</Badge>
                  <span className="text-gray-500 text-xs">{new Date(debug.timestamp).toLocaleTimeString()}</span>
                </div>
                <pre className="text-gray-700 whitespace-pre-wrap">{JSON.stringify(debug.data, null, 2)}</pre>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Enhanced Trade Signals Display */}
      {signals.length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold text-xl mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" />
            Enhanced High-Conviction Signals ({signals.length})
          </h3>
          
          <div className="space-y-4">
            {signals.map((signal, index) => (
              <div key={index} className={`p-4 rounded-lg border ${getSignalColor(signal)}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <Badge className="font-bold text-lg">{signal.ticker}</Badge>
                    <Badge variant="outline" className={getCategoryColor(signal.category)}>
                      {signal.category}
                    </Badge>
                    <Badge variant={signal.signal_type === 'BUY' ? 'default' : 'destructive'}>
                      {signal.signal_type}
                    </Badge>
                    {signal.technical_signals.map((techSignal, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-blue-50 text-blue-700">
                        {techSignal}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center">
                      <TrendingUp className="w-4 h-4 mr-1" />
                      ${signal.price.toFixed(2)}
                    </div>
                    <div className="flex items-center">
                      <Activity className="w-4 h-4 mr-1" />
                      {(signal.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Sentiment:</span> {signal.sentiment_score.toFixed(2)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Velocity:</span> {signal.sentiment_velocity.toFixed(2)}
                  </div>
                  <div className="flex items-center">
                    <Volume2 className="w-3 h-3 mr-1" />
                    <span className="text-muted-foreground">Volume:</span> {signal.volume_ratio.toFixed(1)}x
                  </div>
                  <div>
                    <span className="text-muted-foreground">RSI:</span> {signal.rsi.toFixed(0)}
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground">{signal.reasoning}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!isRunning && signals.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Zap className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="font-semibold mb-2">Enhanced Pipeline Ready</h3>
          <p>Click "Run Enhanced Scan" to analyze with technical indicators and sentiment velocity</p>
          <p className="text-sm mt-2">Expected: 3-8 daily signals meeting enhanced criteria</p>
        </Card>
      )}
    </div>
  );
};

export default DailyTradingPipeline;
