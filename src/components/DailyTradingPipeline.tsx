import DataSourceStatus from "./DataSourceStatus";
import PerformanceTracker from "./PerformanceTracker";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      
      // Step 2: Enhanced sentiment analysis with multi-source data
      setCurrentTask("Running enhanced AI sentiment analysis with multi-source data...");
      
      // 4. Combine all content for sentiment analysis
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

      // Step 3: Fetch from both market data sources in parallel for comprehensive coverage
      setCurrentTask("Fetching market data from multiple sources (Polygon + Yahoo)...");
      let enhancedMarketData;
      let marketError;
      
      try {
        // Fetch from both sources simultaneously
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
        
        // Process Polygon results
        if (polygonResponse.status === 'fulfilled' && 
            !polygonResponse.value.error && 
            polygonResponse.value.data?.success) {
          polygonData = polygonResponse.value.data.enhanced_data || [];
          addDebugInfo("POLYGON_DATA_SUCCESS", { 
            dataCount: polygonData.length,
            source: "polygon"
          });
        } else {
          addDebugInfo("POLYGON_DATA_FAILED", { 
            error: polygonResponse.status === 'fulfilled' ? 
              polygonResponse.value.error?.message : 
              'Promise rejected'
          });
        }
        
        // Process Yahoo results
        if (yahooResponse.status === 'fulfilled' && 
            !yahooResponse.value.error && 
            yahooResponse.value.data?.success) {
          yahooData = yahooResponse.value.data.enhanced_data || [];
          addDebugInfo("YAHOO_DATA_SUCCESS", { 
            dataCount: yahooData.length,
            source: "yahoo"
          });
        } else {
          addDebugInfo("YAHOO_DATA_FAILED", { 
            error: yahooResponse.status === 'fulfilled' ? 
              yahooResponse.value.error?.message : 
              'Promise rejected'
          });
        }
        
        // Merge data with Polygon taking priority for conflicts
        const mergedData = new Map();
        
        // Add Yahoo data first (lower priority)
        yahooData.forEach((item: any) => {
          if (item?.symbol) {
            mergedData.set(item.symbol, { ...item, source: 'yahoo' });
          }
        });
        
        // Add Polygon data (higher priority - will overwrite Yahoo)
        polygonData.forEach((item: any) => {
          if (item?.symbol) {
            mergedData.set(item.symbol, { ...item, source: 'polygon' });
          }
        });
        
        const combinedData = Array.from(mergedData.values());
        
        addDebugInfo("MERGED_MARKET_DATA", {
          polygonCount: polygonData.length,
          yahooCount: yahooData.length,
          mergedCount: combinedData.length,
          polygonSymbols: polygonData.map((d: any) => d.symbol).slice(0, 5),
          yahooSymbols: yahooData.map((d: any) => d.symbol).slice(0, 5),
          mergedSymbols: combinedData.map(d => d.symbol).slice(0, 5),
          sourceCoverage: {
            polygonOnly: polygonData.filter((p: any) => !yahooData.find((y: any) => y.symbol === p.symbol)).length,
            yahooOnly: yahooData.filter((y: any) => !polygonData.find((p: any) => p.symbol === y.symbol)).length,
            both: polygonData.filter((p: any) => yahooData.find((y: any) => y.symbol === p.symbol)).length
          }
        });
        
        if (combinedData.length === 0) {
          throw new Error('No market data available from any source');
        }
        
        enhancedMarketData = {
          success: true,
          enhanced_data: combinedData,
          total_processed: combinedData.length,
          symbols_requested: allTickers.length,
          sources_used: ['polygon', 'yahoo']
        };
        
      } catch (error) {
        marketError = error;
      }

      if (marketError) throw marketError;
      setProgress(70);

      addDebugInfo("MARKET_DATA", {
        symbolsProcessed: enhancedMarketData?.total_processed || 0,
        symbolsRequested: enhancedMarketData?.symbols_requested || 0,
        sampleData: enhancedMarketData?.enhanced_data?.slice(0, 3) || []
      });

      // Step 4: Generate enhanced trade signals with fallback data
      setCurrentTask("Generating high-conviction signals with enhanced multi-source data...");
      
      let sentimentResults = enhancedSentimentData?.enhanced_sentiment || [];
      let marketResults = enhancedMarketData?.enhanced_data || [];
      
      // Use sample data if APIs failed
      if (sentimentResults.length === 0 && marketResults.length === 0) {
        setCurrentTask("APIs failed - using sample data for testing...");
        const { sampleSentiment, sampleMarket } = generateSampleData();
        sentimentResults = sampleSentiment;
        marketResults = sampleMarket;
        
        addDebugInfo("FALLBACK_DATA_GENERATED", {
          sentimentCount: sentimentResults.length,
          marketCount: marketResults.length,
          note: "Using sample data due to API failures"
        });
      }
      
      // Process the enhanced data to generate signals
      const enhancedSignals: TradeSignal[] = [];
      
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

      // Generate signals only for symbols with valid market data
      // Realistic validation for legitimate market data
      const validMarketSymbols = Array.from(marketMap.entries())
        .filter(([symbol, data]) => {
          // Basic validation for real market data
          const rsi = data?.technical_indicators?.rsi;
          const volume_ratio = data?.technical_indicators?.volume_ratio;
          const momentum = data?.technical_indicators?.momentum;
          
          const hasValidRSI = rsi && rsi > 0 && rsi <= 100; // Valid RSI range
          const hasValidPrice = data?.price && data.price > 0;
          const hasValidVolume = data?.volume && data.volume > 0;
          const hasValidVolumeRatio = volume_ratio && volume_ratio > 0; // Positive volume ratio
          const hasValidMomentum = momentum !== undefined; // Momentum can be 0, negative, or positive
          
          // All conditions must pass for valid data
          const isValid = hasValidRSI && hasValidPrice && hasValidVolume && 
                          hasValidVolumeRatio && hasValidMomentum;
          
          if (!isValid) {
            addDebugInfo(`FILTERED_OUT_${symbol}`, {
              reason: "Insufficient/default market data",
              rsi: rsi,
              price: data?.price,
              volume: data?.volume,
              volume_ratio: volume_ratio,
              momentum: momentum,
              checks: {
                hasValidRSI,
                hasValidPrice, 
                hasValidVolume,
                hasValidVolumeRatio,
                hasValidMomentum
              }
            });
            return false;
          }
          return true;
        })
        .map(([symbol, _]) => symbol);

      // Only process symbols with valid market data
      const processedTickers = validMarketSymbols.slice(0, 15); // Reduced to focus on quality
      let signalsGenerated = 0;
      
      addDebugInfo("FILTERED_SYMBOLS", {
        totalSymbols: Array.from(new Set([...sentimentMap.keys(), ...marketMap.keys()])).length,
        validMarketSymbols: validMarketSymbols.length,
        processedTickers: processedTickers.length,
        filteredSymbols: processedTickers
      });
      
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
        
        // Skip if no market data (should be filtered out above, but double-check)
        if (!marketData) continue;
        
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
        // Moderate signals - lower confidence threshold for testing
        else if (Math.abs(sentiment_score) > 0.3 || Math.abs(sentiment_velocity) > 0.1) {
          if (sentiment_score > 0.3) {
            signal_type = 'BUY';
            confidence = 0.5 + sentiment_score * 0.3;
            technical_signals.push('MODERATE_BULLISH');
            reasoning = `Moderate bullish sentiment (${sentiment_score.toFixed(2)}) with RSI ${rsi.toFixed(0)}. Volume: ${volume_ratio.toFixed(1)}x`;
          } else if (sentiment_score < -0.3) {
            signal_type = 'SELL';
            confidence = 0.5 + Math.abs(sentiment_score) * 0.3;
            technical_signals.push('MODERATE_BEARISH');
            reasoning = `Moderate bearish sentiment (${sentiment_score.toFixed(2)}) with RSI ${rsi.toFixed(0)}. Momentum: ${momentum.toFixed(1)}`;
          }
        }

        // Include signals with confidence >= 0.5 (lowered for testing)
        if (confidence >= 0.5) {
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
        finalSignalsCount: enhancedSignals.length,
        usedMultiSourceData: allContent.length > 1
      });

      setSignals(enhancedSignals);

      // Store signals in database for performance tracking
      if (enhancedSignals.length > 0) {
        try {
          const pipelineRunId = crypto.randomUUID();
          const signalsToStore = enhancedSignals.map(signal => ({
            ticker: signal.ticker,
            category: signal.category,
            signal_type: signal.signal_type,
            confidence: signal.confidence,
            price: signal.price,
            sentiment_score: signal.sentiment_score,
            sentiment_velocity: signal.sentiment_velocity,
            volume_ratio: signal.volume_ratio,
            rsi: signal.rsi,
            technical_signals: signal.technical_signals,
            reasoning: signal.reasoning,
            entry_price: signal.price, // Use current price as entry price
            outcome: 'PENDING', // New signals start as pending
            pipeline_run_id: pipelineRunId,
            data_sources_used: ['financial_news', 'stocktwits', 'polygon', 'yahoo'] // Based on what we're using
          }));

          const { error: insertError } = await supabase
            .from('trading_signals')
            .insert(signalsToStore);

          if (insertError) {
            console.error('Error storing signals in database:', insertError);
          } else {
            console.log(`Stored ${signalsToStore.length} signals in database with pipeline run ID: ${pipelineRunId}`);
            addDebugInfo("SIGNALS_STORED", {
              count: signalsToStore.length,
              pipelineRunId: pipelineRunId
            });
          }
        } catch (error) {
          console.error('Failed to store signals:', error);
        }
      }

      setProgress(100);
      setCurrentTask("Enhanced multi-source pipeline complete!");
      setLastRun(new Date());

      toast({
        title: enhancedSignals.length > 0 ? "Enhanced Multi-Source Pipeline Complete! 🚀" : "Pipeline Complete - No Signals Found",
        description: `Found ${enhancedSignals.length} signals using ${allContent.length} data sources (Reddit: ${redditData?.posts?.length || 'unavailable'}, News: ${newsData?.articles?.length || 0}, StockTwits: ${stocktwitsData?.messages?.length || 0})`,
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
          <p className="text-muted-foreground">Multi-source AI-powered signals: Reddit + Financial News + StockTwits</p>
        </div>
        {lastRun && (
          <div className="text-sm text-muted-foreground">
            Last run: {lastRun.toLocaleString()}
          </div>
        )}
      </div>

      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pipeline">Signal Generation</TabsTrigger>
          <TabsTrigger value="performance">Performance Tracking</TabsTrigger>
          <TabsTrigger value="data-sources">Data Sources</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pipeline" className="space-y-6">
          {/* Data Source Status */}
          <DataSourceStatus />


      {/* Enhanced Pipeline Control */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-xl flex items-center">
              Multi-Source Signal Generation
              <Target className="w-5 h-5 ml-2 text-blue-600" />
            </h3>
            <p className="text-muted-foreground">Enhanced analysis: Reddit + Financial News + StockTwits + Technical Indicators</p>
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
                  Run Multi-Source Scan
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
          <h4 className="font-semibold mb-3">Multi-Source Data Pipeline:</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <span>Reddit Communities</span>
            </div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span>Financial News APIs</span>
            </div>
            <div className="flex items-center space-x-2">
              <Volume2 className="w-4 h-4 text-purple-500" />
              <span>StockTwits Social</span>
            </div>
            <div className="flex items-center space-x-2">
              <Scan className="w-4 h-4 text-orange-500" />
              <span>Technical Indicators</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Debug Information Panel */}
      {showDebug && debugInfo.length > 0 && (
        <Card className="p-6 bg-muted/50 border-border">
          <h3 className="font-bold text-lg mb-4 text-foreground">🔍 Debug Information</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {debugInfo.map((debug, index) => (
              <div key={index} className="bg-card p-3 rounded border border-border text-xs">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="text-xs">{debug.step}</Badge>
                  <span className="text-muted-foreground text-xs">{new Date(debug.timestamp).toLocaleTimeString()}</span>
                </div>
                <pre className="text-foreground whitespace-pre-wrap font-mono">{JSON.stringify(debug.data, null, 2)}</pre>
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
            Enhanced Multi-Source Signals ({signals.length})
          </h3>
          
          <div className="space-y-4">
            {signals.map((signal, index) => {
              const isWeakSignal = signal.confidence < 70;
              const warning = isWeakSignal ? 
                (signal.confidence < 60 ? "⚠️ WEAK SIGNAL - Not recommended for trading" :
                 "⚠️ MODERATE SIGNAL - Consider additional analysis") : null;
              
              return (
                <div key={index} className={`p-4 rounded-lg border ${getSignalColor(signal)} ${isWeakSignal ? 'opacity-75' : ''}`}>
                  {warning && (
                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-xs font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {warning}
                    </div>
                  )}
                  
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
                        <span className={signal.confidence >= 70 ? 'text-green-600 font-medium' : 
                                       signal.confidence >= 60 ? 'text-yellow-600' : 'text-red-600'}>
                          {(signal.confidence * 100).toFixed(0)}%
                        </span>
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
                    <div>
                      <span className="text-muted-foreground">Volume:</span> {signal.volume_ratio.toFixed(1)}x
                    </div>
                    <div>
                      <span className="text-muted-foreground">RSI:</span> {signal.rsi.toFixed(0)}
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground mb-3">
                    <strong>Analysis:</strong> {signal.reasoning}
                  </div>
                  
                  {/* Only show trade button for high-confidence signals */}
                  {signal.confidence >= 70 && (
                    <div className="flex justify-between items-center">
                      <div className="flex space-x-2">
                        <Button
                          variant={signal.signal_type === 'BUY' ? 'default' : 'destructive'}
                          size="sm"
                          className="text-xs px-3 py-1"
                        >
                          {signal.signal_type === 'BUY' ? '📈 Execute Buy' : '📉 Execute Sell'}
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs px-3 py-1">
                          📊 View Chart
                        </Button>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        Entry: ${signal.price.toFixed(2)}
                      </Badge>
                    </div>
                  )}
                  
                  {/* Show reason why no trade button for weak signals */}
                  {signal.confidence < 70 && (
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-gray-500 italic">
                        Trading disabled - confidence below 70% threshold
                      </div>
                      <Badge variant="outline" className="text-xs text-red-600">
                        Not Tradeable
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!isRunning && signals.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Zap className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="font-semibold mb-2">Multi-Source Pipeline Ready</h3>
          <p>Click "Run Multi-Source Scan" to analyze with Reddit + News + StockTwits data</p>
          <p className="text-sm mt-2">Expected: Higher signal quality with multiple data sources</p>
        </Card>
      )}
        </TabsContent>
        
        <TabsContent value="performance">
          <PerformanceTracker />
        </TabsContent>
        
        <TabsContent value="data-sources">
          <DataSourceStatus />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DailyTradingPipeline;
