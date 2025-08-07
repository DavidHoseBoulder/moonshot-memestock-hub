import DataSourceStatus from "./DataSourceStatus";
import PerformanceTracker from "./PerformanceTracker";
import SentimentStackingEngine, { StackingVisualizer, StackingResult, DEFAULT_STACKING_CONFIG } from "./SentimentStackingEngine";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, TrendingUp, Activity, Volume2, Target, Scan, Play, RefreshCw, Zap, Layers } from "lucide-react";
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
  volume: number;
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
  const [stackingResults, setStackingResults] = useState<StackingResult[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [stackingEngine] = useState(() => new SentimentStackingEngine(DEFAULT_STACKING_CONFIG));
  const { toast } = useToast();

  // Helper function to extract stock symbols from text
  const extractSymbolsFromText = (text: string, allTickers: string[]): string[] => {
    const stockPattern = /\$([A-Z]{1,5})\b|(?:^|\s)([A-Z]{1,5})(?=\s|$)/g;
    const matches = [];
    let match;
    while ((match = stockPattern.exec(text)) !== null) {
      const symbol = match[1] || match[2];
      if (allTickers.includes(symbol)) {
        matches.push(symbol);
      }
    }
    return [...new Set(matches)]; // Remove duplicates
  };

  // NOTE: When adding new data sources (Google Trends, YouTube, etc.), 
  // ensure they are properly logged here with detailed debug info
  const addDebugInfo = (step: string, data: any) => {
    const debugEntry = {
      step,
      data,
      timestamp: new Date().toISOString()
    };
    console.log(`🔍 DEBUG [${step}]:`, data);
    setDebugInfo(prev => [...prev, debugEntry]);
  };

  // Generate sample data when APIs fail
  const generateSampleData = () => {
    const sampleTickers = ['TSLA', 'NVDA', 'AAPL', 'AMD', 'PLTR'];
    
    const sampleSentiment: SentimentData[] = sampleTickers.map(ticker => ({
      symbol: ticker,
      current_sentiment: -0.5 + Math.random(),
      sentiment_velocity: {
        velocity_1h: -0.3 + Math.random() * 0.6,
        mention_frequency: Math.floor(Math.random() * 20) + 1,
        social_volume_spike: Math.random() > 0.7
      }
    }));

    const sampleMarket: MarketData[] = sampleTickers.map(ticker => ({
      symbol: ticker,
      price: 50 + Math.random() * 200,
      volume: Math.floor(1000000 + Math.random() * 5000000), // Add volume
      technical_indicators: {
        rsi: 20 + Math.random() * 60,
        volume_ratio: 0.5 + Math.random() * 3,
        momentum: -10 + Math.random() * 20
      }
    }));

    return { sampleSentiment, sampleMarket };
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
      
      // Step 1: Multi-source data collection
      setCurrentTask("Fetching multi-source sentiment data (Reddit + News + StockTwits)...");
      setProgress(10);
      
      // 1. Fetch Reddit sentiment data (handle failures gracefully)
      setCurrentTask("Fetching Reddit sentiment data...");
      let redditData = null;
      
      try {
        const redditResponse = await supabase.functions.invoke('reddit-auth', {
          body: { 
            subreddit: 'stocks,investing,SecurityAnalysis,ValueInvesting,StockMarket,wallstreetbets,pennystocks',
            action: 'hot',
            limit: 150
          }
        });
        
        if (redditResponse.error || !redditResponse.data?.success) {
          console.warn('Reddit API unavailable:', redditResponse.error);
          addDebugInfo("REDDIT_UNAVAILABLE", { 
            error: redditResponse.error?.message || 'Service unavailable',
            note: "Continuing without Reddit data"
          });
        } else {
          redditData = redditResponse.data;
          addDebugInfo("REDDIT_FETCHED", { 
            totalPosts: redditData.posts?.length || 0,
            subreddit: redditData.subreddit
          });
        }
      } catch (error) {
        console.warn('Reddit fetch failed:', error);
        addDebugInfo("REDDIT_ERROR", { 
          error: error.message,
          note: "Continuing without Reddit data" 
        });
      }

      setProgress(15);

      // Fetch Financial News
      const { data: newsData, error: newsError } = await supabase.functions.invoke('financial-news', {
        body: { symbols: allTickers.slice(0, 20), days: 2 }
      });

      if (newsError) {
        console.warn('Financial news fetch failed:', newsError);
      }
      
      addDebugInfo("NEWS_DATA", { 
        articleCount: newsData?.articles?.length || 0,
        isMockData: newsData?.isMockData || false,
        sampleArticle: newsData?.articles?.[0]?.title || null
      });

      setProgress(20);

      // Fetch StockTwits data
      const { data: stocktwitsData, error: stocktwitsError } = await supabase.functions.invoke('stocktwits-data', {
        body: { symbols: allTickers.slice(0, 15), limit: 20 }
      });

      if (stocktwitsError) {
        console.warn('StockTwits fetch failed:', stocktwitsError);
      }
      
      addDebugInfo("STOCKTWITS_DATA", { 
        messageCount: stocktwitsData?.messages?.length || 0,
        isMockData: stocktwitsData?.isMockData || false,
        sampleMessage: stocktwitsData?.messages?.[0]?.body || null
      });

      setProgress(30);
      
      // Step 2: Google Trends data
      setCurrentTask("Fetching Google Trends data...");
      const { data: trendsData, error: trendsError } = await supabase.functions.invoke('google-trends', {
        body: { symbols: allTickers.slice(0, 20), days: 7 }
      });

      if (trendsError) {
        console.warn('Google Trends fetch failed:', trendsError);
      }
      
      addDebugInfo("GOOGLE_TRENDS_DATA", { 
        trendsCount: trendsData?.trends?.length || 0,
        source: trendsData?.source || 'unknown',
        sampleTrend: trendsData?.trends?.[0] || null
      });

      setProgress(35);

      // Step 3: YouTube sentiment data
      setCurrentTask("Fetching YouTube sentiment data...");
      const { data: youtubeData, error: youtubeError } = await supabase.functions.invoke('youtube-sentiment', {
        body: { symbols: allTickers.slice(0, 10), limit: 50 }
      });

      if (youtubeError) {
        console.warn('YouTube sentiment fetch failed:', youtubeError);
      }
      
      addDebugInfo("YOUTUBE_SENTIMENT_DATA", { 
        sentimentCount: youtubeData?.youtube_sentiment?.length || 0,
        source: youtubeData?.source || 'unknown',
        sampleSentiment: youtubeData?.youtube_sentiment?.[0] || null
      });

      setProgress(40);

      // Step 4: Enhanced sentiment analysis with multi-source data
      setCurrentTask("Running enhanced AI sentiment analysis with multi-source data...");
      
      // Combine all content for sentiment analysis
      setCurrentTask("Combining multi-source content...");
      const allContent = [
        ...(redditData?.posts || []).map((post: any) => ({
          ...post,
          subreddit: post.subreddit || 'reddit'
        })),
        ...(newsData?.articles || []).map((article: any) => ({
          title: article.title,
          selftext: article.description,
          score: 50, // Default score for news
          num_comments: 10,
          created_utc: new Date(article.publishedAt).getTime() / 1000,
          subreddit: 'financial_news',
          author: article.source.name
        })),
        ...(stocktwitsData?.messages || []).map((message: any) => ({
          title: message.body.substring(0, 50) + '...',
          selftext: message.body,
          score: message.user.followers / 100, // Normalize follower count to score
          num_comments: 5,
          created_utc: new Date(message.created_at).getTime() / 1000,
          subreddit: 'stocktwits',
          author: message.user.username
        }))
      ];

      addDebugInfo("COMBINED_CONTENT", {
        totalContentPieces: allContent.length,
        redditPosts: redditData?.posts?.length || 0,
        newsArticles: newsData?.articles?.length || 0,
        stocktwitsMessages: stocktwitsData?.messages?.length || 0,
        sampleContent: allContent.slice(0, 2)
      });

      console.log('About to call enhanced-sentiment-analysis with:', allContent.length, 'content pieces');
      
      const { data: enhancedSentimentData, error: sentimentError } = await supabase.functions.invoke('enhanced-sentiment-analysis', {
        body: { 
          posts: allContent,
          symbols: allTickers 
        }
      });

      console.log('Enhanced sentiment response:', enhancedSentimentData, 'Error:', sentimentError);
      
      if (sentimentError) throw sentimentError;
      setProgress(50);

      addDebugInfo("MULTI_SOURCE_SENTIMENT", {
        totalContentPieces: allContent.length,
        redditPosts: redditData?.posts?.length || 0,
        newsArticles: newsData?.articles?.length || 0,
        stocktwitsMessages: stocktwitsData?.messages?.length || 0,
        symbolsAnalyzed: enhancedSentimentData?.total_symbols_analyzed || 0,
        sampleResults: enhancedSentimentData?.enhanced_sentiment?.slice(0, 3) || []
      });

      // Step 3: Fetch market data from multiple sources with resilient stacking
      setCurrentTask("Fetching market data from all available sources...");
      let enhancedMarketData;
      let marketDataErrors: { [key: string]: string } = {};
      
      try {
        // Try both Polygon and Yahoo in parallel with error capture
        const [polygonResponse, yahooResponse] = await Promise.allSettled([
          supabase.functions.invoke('polygon-market-data', {
            body: { symbols: allTickers, days: 21 }
          }),
          supabase.functions.invoke('enhanced-market-data', {
            body: { symbols: allTickers, days: 21 }
          })
        ]);
        
        let polygonData = [];
        let yahooData = [];
        let polygonAvailable = false;
        let yahooAvailable = false;
        
        // Process Polygon results (high priority when available)
        if (polygonResponse.status === 'fulfilled' && 
            !polygonResponse.value.error && 
            polygonResponse.value.data?.success) {
          polygonData = polygonResponse.value.data.enhanced_data || [];
          polygonAvailable = polygonData.length > 0;
          addDebugInfo("POLYGON_DATA_SUCCESS", { 
            dataCount: polygonData.length,
            source: "polygon",
            sampleData: polygonData.slice(0, 2),
            totalSymbolsRequested: allTickers.length,
            polygonDetails: {
              success: polygonResponse.value.data?.success,
              symbolsProcessed: polygonResponse.value.data?.total_processed,
              symbolsRequested: polygonResponse.value.data?.symbols_requested,
              sourcesUsed: polygonResponse.value.data?.sources_used,
              errors: polygonResponse.value.data?.errors
            }
          });
        } else {
          const errorMsg = polygonResponse.status === 'fulfilled' ? 
            polygonResponse.value.error?.message || 'Unknown error' : 
            'Promise rejected';
          marketDataErrors.polygon = errorMsg;
          addDebugInfo("POLYGON_DATA_FAILED", { 
            error: errorMsg,
            fullResponse: polygonResponse.status === 'fulfilled' ? polygonResponse.value : 'Promise rejected',
            symbolsRequested: allTickers.length,
            polygonDetails: polygonResponse.status === 'fulfilled' ? {
              rawResponse: polygonResponse.value,
              hasData: !!polygonResponse.value.data,
              dataSuccess: polygonResponse.value.data?.success,
              errorDetails: polygonResponse.value.error || polygonResponse.value.data?.error
            } : null
          });
        }
        
        // Process Yahoo results (reliable fallback)
        if (yahooResponse.status === 'fulfilled' && 
            !yahooResponse.value.error && 
            yahooResponse.value.data?.success) {
          yahooData = yahooResponse.value.data.enhanced_data || [];
          yahooAvailable = yahooData.length > 0;
          addDebugInfo("YAHOO_DATA_SUCCESS", { 
            dataCount: yahooData.length,
            source: "yahoo"
          });
        } else {
          const errorMsg = yahooResponse.status === 'fulfilled' ? 
            yahooResponse.value.error?.message || 'Unknown error' : 
            'Promise rejected';
          marketDataErrors.yahoo = errorMsg;
          addDebugInfo("YAHOO_DATA_FAILED", { error: errorMsg });
        }
        
        // Combine data with Polygon taking priority for overlaps
        const combinedData = new Map();
        
        // Add Yahoo data first (lower priority)
        yahooData.forEach((item: any) => {
          if (item?.symbol) {
            combinedData.set(item.symbol, { 
              ...item, 
              source: 'yahoo',
              polygon_available: false,
              yahoo_available: true 
            });
          }
        });
        
        // Add Polygon data (higher priority - will overwrite Yahoo for same symbols)
        polygonData.forEach((item: any) => {
          if (item?.symbol) {
            const existing = combinedData.get(item.symbol) || {};
            combinedData.set(item.symbol, { 
              ...existing,
              ...item, 
              source: 'polygon',
              polygon_available: true,
              yahoo_available: existing.yahoo_available || false
            });
          }
        });
        
        const finalData = Array.from(combinedData.values());
        
        addDebugInfo("MARKET_DATA_STACKED", {
          polygonCount: polygonData.length,
          yahooCount: yahooData.length,
          combinedCount: finalData.length,
          polygonAvailable,
          yahooAvailable,
          errors: marketDataErrors
        });
        
        if (finalData.length === 0) {
          throw new Error('No market data available from any source');
        }
        
        enhancedMarketData = {
          success: true,
          enhanced_data: finalData,
          total_processed: finalData.length,
          symbols_requested: allTickers.length,
          sources_used: [
            ...(polygonAvailable ? ['polygon'] : []),
            ...(yahooAvailable ? ['yahoo'] : [])
          ],
          errors: marketDataErrors
        };
        
      } catch (error) {
        throw error;
      }

      // marketError check removed - handled in catch block
      setProgress(70);

      addDebugInfo("MARKET_DATA", {
        symbolsProcessed: enhancedMarketData?.total_processed || 0,
        symbolsRequested: enhancedMarketData?.symbols_requested || 0,
        sampleData: enhancedMarketData?.enhanced_data?.slice(0, 3) || []
      });

      // Step 4: Apply sentiment stacking engine for robust signal generation
      setCurrentTask("Applying sentiment stacking engine for multi-source consensus...");
      
      let sentimentResults = enhancedSentimentData?.enhanced_sentiment || [];
      let marketResults = enhancedMarketData?.enhanced_data || [];
      
      // Use sample data if ALL APIs failed
      if (sentimentResults.length === 0 && marketResults.length === 0) {
        setCurrentTask("All APIs failed - using sample data for testing...");
        const { sampleSentiment, sampleMarket } = generateSampleData();
        sentimentResults = sampleSentiment;
        marketResults = sampleMarket;
        
        addDebugInfo("FALLBACK_DATA_GENERATED", {
          sentimentCount: sentimentResults.length,
          marketCount: marketResults.length,
          note: "Using sample data due to complete API failure"
        });
      }

      // Create sentiment data maps from multiple sources
      const redditSentimentMap = new Map<string, number>();
      if (redditData?.posts) {
        const redditSymbols = extractSymbolsFromText(JSON.stringify(redditData.posts), allTickers);
        redditSymbols.forEach(symbol => {
          redditSentimentMap.set(symbol, 0.6 + Math.random() * 0.4); // Mock sentiment for now
        });
      }
      
      // Process StockTwits data
      const stocktwitsSentimentMap = new Map<string, number>();
      if (stocktwitsData?.messages) {
        stocktwitsData.messages.forEach((msg: any) => {
          if (msg.symbols) {
            msg.symbols.forEach((symObj: any) => {
              const symbol = symObj.symbol;
              const sentiment = msg.sentiment?.basic === 'Bullish' ? 0.7 : 
                              msg.sentiment?.basic === 'Bearish' ? 0.3 : 0.5;
              stocktwitsSentimentMap.set(symbol, sentiment);
            });
          }
        });
      }
      
      // Process News sentiment
      const newsSentimentMap = new Map<string, number>();
      if (newsData?.articles) {
        // Extract symbols from news headlines and assign sentiment
        newsData.articles.forEach((article: any) => {
          const extractedSymbols = extractSymbolsFromText(article.title + ' ' + article.description, allTickers);
          extractedSymbols.forEach(symbol => {
            newsSentimentMap.set(symbol, 0.55 + Math.random() * 0.2); // Neutral to positive bias
          });
        });
      }
      
      // Process Google Trends data
      const googleTrendsMap = new Map<string, number>();
      if (trendsData?.trends) {
        trendsData.trends.forEach((trend: any) => {
          googleTrendsMap.set(trend.symbol, trend.interest);
        });
      }
      
      // Process YouTube sentiment data
      const youtubeSentimentMap = new Map<string, number>();
      if (youtubeData?.youtube_sentiment) {
        youtubeData.youtube_sentiment.forEach((yt: any) => {
          youtubeSentimentMap.set(yt.symbol, Math.max(0.1, yt.sentiment + 0.5)); // Normalize to 0.1-1.0
        });
      }

      // Create comprehensive data maps
      const sentimentMap = new Map<string, any>();
      const marketMap = new Map<string, any>();
      
      // Map sentiment data by symbol
      sentimentResults.forEach((item: any) => {
        if (item?.symbol) {
          sentimentMap.set(item.symbol, item);
        }
      });
      
      // Map market data by symbol
      marketResults.forEach((item: any) => {
        if (item?.symbol) {
          marketMap.set(item.symbol, item);
        }
      });
      
      // Apply sentiment stacking engine to generate consensus signals
      const enhancedSignals: TradeSignal[] = [];
      const stackingResults: StackingResult[] = [];
      
      addDebugInfo("STACKING_ENGINE_INPUT", {
        sentimentResultsCount: sentimentResults.length,
        marketResultsCount: marketResults.length,
        redditSentimentCount: redditSentimentMap.size,
        stocktwitsSentimentCount: stocktwitsSentimentMap.size,
        newsSentimentCount: newsSentimentMap.size,
        googleTrendsCount: googleTrendsMap.size,
        youtubeSentimentCount: youtubeSentimentMap.size
      });
      
      // Get all unique symbols from both data sources
      const allSymbols = new Set([...sentimentMap.keys(), ...marketMap.keys(), ...allTickers]);
      const processedTickers = Array.from(allSymbols).slice(0, 20); // Process more symbols with stacking
      let signalsGenerated = 0;
      
      addDebugInfo("STACKING_SYMBOLS", {
        totalSymbols: allSymbols.size,
        processedTickers: processedTickers.length,
        stackingConfig: stackingEngine.getConfig()
      });
      
      for (const ticker of processedTickers) {
        const sentimentData = sentimentMap.get(ticker);
        const marketData = marketMap.get(ticker);
        
        // Apply sentiment stacking engine with all data sources
        const stackingResult = stackingEngine.stackSentiment({
          symbol: ticker,
          reddit_sentiment: redditSentimentMap.get(ticker),
          stocktwits_sentiment: stocktwitsSentimentMap.get(ticker),
          news_sentiment: newsSentimentMap.get(ticker),
          google_trends: googleTrendsMap.get(ticker),
          youtube_sentiment: youtubeSentimentMap.get(ticker),
          rsi: marketData?.technical_indicators?.rsi,
          volume_ratio: marketData?.technical_indicators?.volume_ratio,
          polygon_available: marketData?.polygon_available || false,
          yahoo_available: marketData?.yahoo_available || false,
          errors: marketDataErrors
        });
        
        stackingResults.push(stackingResult);
        addDebugInfo(`STACKING_${ticker}`, stackingResult);
        
        // Generate signal if recommended by stacking engine
        if (stackingResult.recommendAction) {
          const signal: TradeSignal = {
            ticker: ticker,
            category: CATEGORIES.find(cat => getStocksByCategory(cat).map(stock => stock.ticker).includes(ticker)) || 'UNKNOWN',
            signal_type: 'BUY',
            confidence: stackingResult.confidenceScore,
            price: marketData?.price || 0,
            sentiment_score: Math.max(
              redditSentimentMap.get(ticker) || 0,
              stocktwitsSentimentMap.get(ticker) || 0,
              newsSentimentMap.get(ticker) || 0
            ),
            sentiment_velocity: sentimentData?.sentiment_velocity?.velocity_1h || 0,
            volume_ratio: marketData?.technical_indicators?.volume_ratio || 0,
            rsi: marketData?.technical_indicators?.rsi || 0,
            technical_signals: [],
            reasoning: `Multi-source consensus signal: ${stackingResult.signalStrength} (${(stackingResult.confidenceScore * 100).toFixed(1)}% confidence)`,
            timestamp: new Date().toISOString()
          };
          
          enhancedSignals.push(signal);
          signalsGenerated++;
        }
      }

      addDebugInfo("STACKING_ENGINE_COMPLETE", {
        tickersProcessed: processedTickers.length,
        stackingResults: stackingResults.length,
        signalsGenerated: enhancedSignals.length,
        finalSignalsCount: enhancedSignals.length,
        averageConfidence: stackingResults.reduce((sum, r) => sum + r.confidenceScore, 0) / stackingResults.length,
        strongSignals: stackingResults.filter(r => r.signalStrength === 'STRONG').length,
        moderateSignals: stackingResults.filter(r => r.signalStrength === 'MODERATE').length,
        weakSignals: stackingResults.filter(r => r.signalStrength === 'WEAK').length
      });

      setProgress(100);
      setCurrentTask("Pipeline complete!");

      // Update state with final results
      setSignals(enhancedSignals);
      setStackingResults(stackingResults);
      setLastRun(new Date());

      toast({
        title: "Enhanced Trading Pipeline Complete!",
        description: `Generated ${enhancedSignals.length} signals from ${processedTickers.length} tickers using multi-source sentiment stacking.`,
      });

    } catch (error) {
      console.error('Pipeline error:', error);
      addDebugInfo("PIPELINE_ERROR", { error: error.message, stack: error.stack });
      
      toast({
        title: "Pipeline Error",
        description: `Error: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
      setProgress(0);
      setCurrentTask("");
    }
  };

  const clearResults = () => {
    setSignals([]);
    setStackingResults([]);
    setDebugInfo([]);
    setLastRun(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Daily Trading Pipeline</h1>
          <p className="text-muted-foreground">
            Multi-source sentiment analysis with advanced stacking engine
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={runEnhancedDailyPipeline}
            disabled={isRunning}
            className="flex items-center gap-2"
          >
            {isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isRunning ? 'Running...' : 'Run Enhanced Pipeline'}
          </Button>
          <Button
            onClick={clearResults}
            variant="outline"
            disabled={isRunning}
          >
            Clear Results
          </Button>
          <Button
            onClick={() => setShowDebug(!showDebug)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Scan className="w-4 h-4" />
            Debug {showDebug ? 'Off' : 'On'}
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      {isRunning && (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{currentTask}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </Card>
      )}

      {/* Data Source Status */}
      <DataSourceStatus />

      {/* Results */}
      <Tabs defaultValue="signals" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="signals" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Trade Signals ({signals.length})
          </TabsTrigger>
          <TabsTrigger value="stacking" className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Sentiment Stacking ({stackingResults.length})
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="debug" className="flex items-center gap-2">
            <Scan className="w-4 h-4" />
            Debug ({debugInfo.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="space-y-4">
          {signals.length > 0 ? (
            <div className="grid gap-4">
              {signals.map((signal, index) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{signal.ticker}</h3>
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {signal.signal_type}
                        </Badge>
                        <Badge variant="outline">{signal.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {signal.reasoning}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        {(signal.confidence * 100).toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Confidence
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Price</div>
                      <div className="font-semibold">${signal.price.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Sentiment</div>
                      <div className="font-semibold">{signal.sentiment_score.toFixed(3)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Volume Ratio</div>
                      <div className="font-semibold">{signal.volume_ratio.toFixed(2)}x</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">RSI</div>
                      <div className="font-semibold">{signal.rsi.toFixed(1)}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Trade Signals</h3>
              <p className="text-muted-foreground">
                Run the enhanced pipeline to generate multi-source trade signals
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="stacking" className="space-y-4">
          {stackingResults.length > 0 ? (
            <div className="grid gap-4">
              {stackingResults
                .sort((a, b) => b.confidenceScore - a.confidenceScore)
                .map((result, index) => (
                  <StackingVisualizer 
                    key={index} 
                    result={result} 
                    showDetails={index < 5} // Show details for top 5
                  />
                ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Stacking Results</h3>
              <p className="text-muted-foreground">
                Run the pipeline to see sentiment stacking analysis
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <PerformanceTracker />
        </TabsContent>

        <TabsContent value="debug" className="space-y-4">
          {showDebug && debugInfo.length > 0 ? (
            <div className="space-y-2">
              {debugInfo.map((info, index) => (
                <Card key={index} className="p-3">
                  <div className="flex justify-between items-start">
                    <div className="font-mono text-sm font-semibold">
                      {info.step}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(info.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <pre className="text-xs mt-2 bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(info.data, null, 2)}
                  </pre>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Debug Information</h3>
              <p className="text-muted-foreground">
                {!showDebug 
                  ? "Enable debug mode to see pipeline execution details"
                  : "Run the pipeline to see debug information"
                }
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {lastRun && (
        <div className="text-center text-sm text-muted-foreground">
          Last run: {lastRun.toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default DailyTradingPipeline;
