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
      
      // Apply sentiment stacking engine to generate consensus signals
      const enhancedSignals: TradeSignal[] = [];
      const stackingResults: StackingResult[] = [];
      
      addDebugInfo("STACKING_ENGINE_INPUT", {
        sentimentResultsCount: sentimentResults.length,
        marketResultsCount: marketResults.length,
        sentimentSample: sentimentResults.slice(0, 2),
        marketSample: marketResults.slice(0, 2)
      });
      
      // Create comprehensive data maps
      const sentimentMap = new Map<string, any>();
      const marketMap = new Map<string, any>();
      
      sentimentResults.forEach((item: any) => {
        if (item && item.symbol) {
          sentimentMap.set(item.symbol, item);
        }
      });
      
      marketResults.forEach((item: any) => {
        if (item && item.symbol) {
          marketMap.set(item.symbol, item);
        }
      });

      addDebugInfo("DATA_MAPS", {
        sentimentMapSize: sentimentMap.size,
        marketMapSize: marketMap.size,
        sentimentKeys: Array.from(sentimentMap.keys()).slice(0, 10),
        marketKeys: Array.from(marketMap.keys()).slice(0, 10)
      });

      // Get all unique symbols from both data sources
      const allSymbols = new Set([...sentimentMap.keys(), ...marketMap.keys()]);
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
        
        // Prepare stacking data - extract sentiment from multiple sources
        const redditSentiment = sentimentData?.sources?.reddit?.sentiment;
        const stocktwitsSentiment = sentimentData?.sources?.stocktwits?.sentiment;
        const newsSentiment = sentimentData?.sources?.news?.sentiment;
        
        // Get market data with availability flags
        const rsi = marketData?.technical_indicators?.rsi;
        const volumeRatio = marketData?.technical_indicators?.volume_ratio;
        const polygonAvailable = marketData?.polygon_available || false;
        const yahooAvailable = marketData?.yahoo_available || false;
        
        // Apply sentiment stacking engine
        const stackingResult = stackingEngine.stackSentiment({
          symbol: ticker,
          reddit_sentiment: redditSentiment,
          stocktwits_sentiment: stocktwitsSentiment,
          news_sentiment: newsSentiment,
          rsi: rsi,
          volume_ratio: volumeRatio,
          polygon_available: polygonAvailable,
          yahoo_available: yahooAvailable,
          errors: {
            ...enhancedMarketData?.errors,
            reddit: sentimentData?.sources?.reddit?.error,
            stocktwits: sentimentData?.sources?.stocktwits?.error,
            news: sentimentData?.sources?.news?.error
          }
        });
        
        stackingResults.push(stackingResult);
        
        addDebugInfo(`STACKING_${ticker}`, {
          totalVotes: stackingResult.totalVotes,
          maxVotes: stackingResult.maxPossibleVotes,
          confidence: stackingResult.confidenceScore,
          strength: stackingResult.signalStrength,
          recommend: stackingResult.recommendAction,
          breakdown: stackingResult.votingBreakdown,
          debugInfo: stackingResult.debugInfo,
          inputData: {
            redditSentiment,
            stocktwitsSentiment, 
            newsSentiment,
            rsi,
            volumeRatio,
            polygonAvailable,
            yahooAvailable
          },
          sourcesPassed: stackingResult.sources.filter(s => s.passed).map(s => s.name),
          sourcesFailed: stackingResult.sources.filter(s => s.available && !s.passed).map(s => ({
            name: s.name,
            score: s.score,
            threshold: s.threshold,
            reason: `Score ${s.score?.toFixed(2)} below threshold ${s.threshold}`
          })),
          sourcesUnavailable: stackingResult.sources.filter(s => !s.available).map(s => ({
            name: s.name,
            error: s.errorMessage || 'No data'
          }))
        });
        
        // Only generate signals for recommended actions
        if (!stackingResult.recommendAction || !marketData) continue;
        
        // Use stacking engine results for signal generation
        const sentiment_score = redditSentiment || stocktwitsSentiment || newsSentiment || 0;
        const sentiment_velocity = sentimentData?.sentiment_velocity?.velocity_1h || 0;
        const volume_spike = sentimentData?.sentiment_velocity?.social_volume_spike || false;
        
        const momentum = marketData?.technical_indicators?.momentum || 0;
        
        // Determine signal type based on stacking consensus
        let signal_type: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
        let confidence = stackingResult.confidenceScore;
        let reasoning = '';
        let technical_signals: string[] = [];

        // Enhanced reasoning based on voting breakdown
        const sentimentVotes = stackingResult.votingBreakdown.sentiment;
        const technicalVotes = stackingResult.votingBreakdown.technical;
        const dataVotes = stackingResult.votingBreakdown.market_data;
        
        // Determine signal direction from winning sources
        const bullishSources = stackingResult.sources.filter(s => 
          s.passed && ['sentiment_reddit', 'sentiment_stocktwits', 'sentiment_news', 'rsi_oversold', 'volume_spike'].includes(s.name)
        );
        const bearishSources = stackingResult.sources.filter(s => 
          s.passed && ['rsi_overbought'].includes(s.name)
        );
        
        if (bullishSources.length > bearishSources.length && sentiment_score >= 0) {
          signal_type = 'BUY';
          technical_signals = bullishSources.map(s => s.name.toUpperCase());
          reasoning = `Multi-source consensus: ${bullishSources.length} bullish signals. Sentiment: ${sentiment_score.toFixed(2)}, RSI: ${rsi?.toFixed(0) || 'N/A'}, Volume: ${volumeRatio?.toFixed(1) || 'N/A'}x. Sources: ${stackingResult.sources.filter(s => s.passed).map(s => s.name).join(', ')}`;
        } else if (bearishSources.length > 0 && sentiment_score < 0) {
          signal_type = 'SELL';
          technical_signals = bearishSources.map(s => s.name.toUpperCase());
          reasoning = `Multi-source consensus: ${bearishSources.length} bearish signals. Sentiment: ${sentiment_score.toFixed(2)}, RSI: ${rsi?.toFixed(0) || 'N/A'}. Sources: ${stackingResult.sources.filter(s => s.passed).map(s => s.name).join(', ')}`;
        } else {
          // Mixed signals - use confidence to determine strength
          signal_type = sentiment_score >= 0 ? 'BUY' : 'SELL';
          technical_signals.push('MIXED_SIGNALS');
          reasoning = `Mixed signals with ${stackingResult.totalVotes.toFixed(1)} total votes. Primary sentiment: ${sentiment_score.toFixed(2)}. Confidence: ${(confidence * 100).toFixed(1)}%`;
        }

        // Use stacking confidence as signal confidence
        if (confidence >= 0.3) { // Lower threshold due to stacking validation
          const stock = STOCK_UNIVERSE.find(s => s.ticker === ticker);
          enhancedSignals.push({
            ticker,
            category: stock?.category || 'Unknown',
            signal_type,
            confidence,
            price: marketData?.price || 50 + Math.random() * 200,
            sentiment_score,
            sentiment_velocity,
            volume_ratio: volumeRatio,
            rsi,
            technical_signals,
            reasoning,
            timestamp: new Date().toISOString()
          });
          signalsGenerated++;
        }
      }

      addDebugInfo("STACKING_ENGINE_COMPLETE", {
        tickersProcessed: processedTickers.length,
        stackingResults: stackingResults.length,
        signalsGenerated,
        finalSignalsCount: enhancedSignals.length,
        averageConfidence: stackingResults.reduce((sum, r) => sum + r.confidenceScore, 0) / stackingResults.length,
        strongSignals: stackingResults.filter(r => r.signalStrength === 'STRONG').length,
        moderateSignals: stackingResults.filter(r => r.signalStrength === 'MODERATE').length,
        weakSignals: stackingResults.filter(r => r.signalStrength === 'WEAK').length
      });

      setSignals(enhancedSignals);
      setStackingResults(stackingResults);

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
        title: enhancedSignals.length > 0 ? "Sentiment Stacking Engine Complete! 🧱" : "Pipeline Complete - No Signals Found",
        description: `Generated ${enhancedSignals.length} signals from ${stackingResults.length} symbols using multi-source consensus. Strong: ${stackingResults.filter(r => r.signalStrength === 'STRONG').length}, Moderate: ${stackingResults.filter(r => r.signalStrength === 'MODERATE').length}`,
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pipeline">Signal Generation</TabsTrigger>
          <TabsTrigger value="stacking">Stacking Results</TabsTrigger>
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
        
        <TabsContent value="stacking">
          <div className="space-y-6">
            <h3 className="font-bold text-xl flex items-center">
              <Layers className="w-5 h-5 mr-2 text-blue-600" />
              Sentiment Stacking Results ({stackingResults.length})
            </h3>
            
            {stackingResults.length > 0 ? (
              <div className="grid gap-4">
                {stackingResults.map((result, index) => (
                  <StackingVisualizer 
                    key={index} 
                    result={result} 
                    showDetails={true} 
                  />
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                <Layers className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="font-semibold mb-2">No Stacking Results</h3>
                <p>Run the pipeline to see detailed sentiment stacking analysis</p>
              </Card>
            )}
          </div>
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
