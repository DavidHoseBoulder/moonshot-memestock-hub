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
import { CATEGORIES, getStocksByCategory } from "@/data/stockUniverse";
import { DEFAULT_CONFIGS } from "@/data/subredditUniverse";
import { supabase } from "@/integrations/supabase/client";
import { calculateRSI, estimateRSIFromMomentum } from "@/utils/technicalIndicators";
import { aggregateSentiment, getSentimentLabel } from "@/utils/sentimentAggregator";

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

  // Removed sample data generation - will handle empty data states properly

  // Load active tickers from Supabase ticker_universe
  const fetchActiveTickers = async (): Promise<string[]> => {
    try {
      const { data, error } = await (supabase as any)
        .from('ticker_universe')
        .select('symbol')
        .eq('active', true)
        .order('priority', { ascending: true })
        .order('symbol', { ascending: true });
      if (error) {
        addDebugInfo('TICKER_LOAD_ERROR', { error: error.message });
        return [];
      }
      return (data || []).map((r: any) => String(r.symbol).toUpperCase());
    } catch (e: any) {
      addDebugInfo('TICKER_LOAD_EXCEPTION', { error: e.message });
      return [];
    }
  };

  const runEnhancedDailyPipeline = async () => {
    setIsRunning(true);
    setProgress(0);
    setSignals([]);
    setDebugInfo([]);
    
    try {
      const allTickers = await fetchActiveTickers();
      console.log('Running ENHANCED pipeline for tickers:', allTickers.slice(0, 5), '... and', Math.max(0, allTickers.length - 5), 'more');
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
            subreddit: DEFAULT_CONFIGS.core.join(','),
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

      setProgress(95);

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

      // Step 4: Twitter sentiment data
      setCurrentTask("Fetching Twitter sentiment data...");
      const { data: twitterData, error: twitterError } = await supabase.functions.invoke('twitter-sentiment', {
        body: { symbols: allTickers.slice(0, 10) }
      });

      if (twitterError) {
        console.warn('Twitter sentiment fetch failed:', twitterError);
      }
      
      addDebugInfo("TWITTER_SENTIMENT_DATA", { 
        sentimentCount: twitterData?.sentiment_data?.length || 0,
        source: twitterData?.source || 'twitter',
        fromDatabase: twitterData?.fromDatabase || 0,
        fromAPI: twitterData?.fromAPI || 0,
        note: twitterData?.note || null
      });

      setProgress(45);

      // Step 5: Enhanced sentiment analysis with multi-source data
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
        })),
        ...(twitterData?.sentiment_data || []).map((tweet: any) => ({
          title: tweet.topTweets?.[0]?.text?.substring(0, 50) + '...' || 'Twitter Sentiment',
          selftext: tweet.topTweets?.map((t: any) => t.text).join(' ') || '',
          score: tweet.totalEngagement || 10,
          num_comments: tweet.tweetCount || 5,
          created_utc: Date.now() / 1000,
          subreddit: 'twitter',
          author: 'twitter_user'
        }))
      ];

      addDebugInfo("COMBINED_CONTENT", {
        totalContentPieces: allContent.length,
        redditPosts: redditData?.posts?.length || 0,
        newsArticles: newsData?.articles?.length || 0,
        stocktwitsMessages: stocktwitsData?.messages?.length || 0,
        youtubeComments: youtubeData?.youtube_sentiment?.length || 0,
        twitterTweets: twitterData?.sentiment_data?.length || 0,
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
      setProgress(55);

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
        // Try both Polygon and Yahoo in parallel with enhanced error capture
        console.log('🚀 Starting parallel market data fetch...');
        const [polygonResponse, yahooResponse] = await Promise.allSettled([
          supabase.functions.invoke('polygon-market-data', {
            body: { symbols: allTickers.slice(0, 5), days: 21 } // Limit for testing
          }).catch(error => {
            console.error('❌ Polygon function invocation error:', error);
            return { error: { message: `Polygon invocation failed: ${error.message}` }, data: null };
          }),
          supabase.functions.invoke('enhanced-market-data', {
            body: { symbols: allTickers, days: 21 }
          }).catch(error => {
            console.error('❌ Enhanced market data invocation error:', error);
            return { error: { message: `Enhanced market data failed: ${error.message}` }, data: null };
          })
        ]);
        
        console.log('📊 Market data responses received:', {
          polygonStatus: polygonResponse.status,
          yahooStatus: yahooResponse.status,
          polygonSuccess: polygonResponse.status === 'fulfilled' && !polygonResponse.value.error,
          yahooSuccess: yahooResponse.status === 'fulfilled' && !yahooResponse.value.error
        });
        
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
      
      // Handle empty data state properly
      if (sentimentResults.length === 0 && marketResults.length === 0) {
        setCurrentTask("No data available from any sources");
        addDebugInfo("NO_DATA_AVAILABLE", {
          note: "All API sources returned empty data"
        });
        return;
      }

      // Create sentiment data maps from multiple sources
      const redditSentimentMap = new Map<string, number>();
      if (redditData?.posts) {
        const redditSymbols = extractSymbolsFromText(JSON.stringify(redditData.posts), allTickers);
        redditSymbols.forEach(symbol => {
          // Use actual sentiment analysis instead of random values
          // For now, set neutral sentiment - will implement proper analysis
          redditSentimentMap.set(symbol, 0.5);
        });
      }
      
      // Fetch pre-calculated StockTwits sentiment from v_stocktwits_daily_signals
      const stocktwitsSentimentMap = new Map<string, number>();
      const stocktwitsConfidenceMap = new Map<string, number>();
      
      try {
        const today = new Date().toISOString().split('T')[0];
        const { data: stocktwitsSignals, error: stocktwitsError } = await supabase
          .from('v_stocktwits_daily_signals')
          .select('symbol, stocktwits_stat_score, confidence_score, total_messages, follower_sum')
          .eq('trade_date', today) as { 
            data: Array<{
              symbol: string;
              stocktwits_stat_score: number | null;
              confidence_score: number | null;
              total_messages: number | null;
              follower_sum: number | null;
            }> | null;
            error: any;
          };
        
        if (stocktwitsError) {
          console.warn('Failed to fetch StockTwits signals:', stocktwitsError);
          addDebugInfo("STOCKTWITS_SIGNALS_ERROR", { error: stocktwitsError.message });
        } else if (stocktwitsSignals && stocktwitsSignals.length > 0) {
          stocktwitsSignals.forEach((signal: any) => {
            if (signal.symbol && signal.stocktwits_stat_score !== null) {
              // stocktwits_stat_score is -1 to 1, normalize to 0-1 for internal use
              const normalizedScore = (signal.stocktwits_stat_score + 1) / 2;
              stocktwitsSentimentMap.set(signal.symbol, normalizedScore);
              
              // Use confidence_score from view or calculate from message count
              const confidence = signal.confidence_score || 
                Math.min(1.0, (signal.total_messages || 0) / 10);
              stocktwitsConfidenceMap.set(signal.symbol, confidence);
              
              // Store in sentiment history
              supabase.from('sentiment_history').insert({
                symbol: signal.symbol,
                source: 'stocktwits',
                sentiment_score: normalizedScore,
                raw_sentiment: signal.stocktwits_stat_score,
                confidence_score: confidence,
                data_timestamp: new Date().toISOString(),
                metadata: {
                  stat_score: signal.stocktwits_stat_score,
                  message_count: signal.total_messages,
                  follower_sum: signal.follower_sum
                },
                content_snippet: `StockTwits stat_score: ${signal.stocktwits_stat_score?.toFixed(2)} from ${signal.total_messages} messages`,
                volume_indicator: signal.total_messages,
                engagement_score: confidence
              }).then(({ error }) => {
                if (error && !error.message?.includes('duplicate key')) {
                  console.warn('Error storing StockTwits sentiment:', error);
                }
              });
            }
          });
          
          addDebugInfo("STOCKTWITS_SIGNALS_LOADED", {
            symbolsLoaded: stocktwitsSignals.length,
            sampleSignal: stocktwitsSignals[0]
          });
        }
      } catch (error) {
        console.warn('Error fetching StockTwits signals:', error);
        addDebugInfo("STOCKTWITS_SIGNALS_EXCEPTION", { error: String(error) });
      }
      
      // Process News sentiment with better analysis
      const newsSentimentMap = new Map<string, number>();
      const newsConfidenceMap = new Map<string, number>();
      
      if (newsData?.articles) {
        const symbolArticles = new Map<string, any[]>();
        
        newsData.articles.forEach((article: any) => {
          const extractedSymbols = extractSymbolsFromText(article.title + ' ' + article.description, allTickers);
          extractedSymbols.forEach(symbol => {
            if (!symbolArticles.has(symbol)) {
              symbolArticles.set(symbol, []);
            }
            symbolArticles.get(symbol)!.push(article);
          });
        });
        
        for (const [symbol, articles] of symbolArticles.entries()) {
          // Analyze sentiment based on keywords in headlines and descriptions
          let totalSentiment = 0;
          for (const article of articles) {
            const text = (article.title + ' ' + article.description).toLowerCase();
            let sentiment = 0.5; // neutral
            
            // Positive indicators
            if (text.match(/\b(surge|rally|gain|rise|jump|boost|strong|beat|exceed|positive|upgrade|buy)\b/g)) {
              sentiment += 0.2;
            }
            if (text.match(/\b(record|milestone|breakthrough|partnership|acquisition|growth)\b/g)) {
              sentiment += 0.15;
            }
            
            // Negative indicators  
            if (text.match(/\b(drop|fall|decline|crash|loss|weak|miss|cut|downgrade|sell|concern)\b/g)) {
              sentiment -= 0.2;
            }
            if (text.match(/\b(lawsuit|investigation|scandal|fraud|bankruptcy|layoffs)\b/g)) {
              sentiment -= 0.25;
            }
            
            totalSentiment += Math.max(0.1, Math.min(0.9, sentiment));
          }
          
          const avgSentiment = totalSentiment / articles.length;
          const confidence = Math.min(1.0, articles.length / 3); // More articles = higher confidence
          
          newsSentimentMap.set(symbol, avgSentiment);
          newsConfidenceMap.set(symbol, confidence);
          
          // Store in sentiment history
          try {
            await supabase.from('sentiment_history').insert({
              symbol,
              source: 'news',
              sentiment_score: avgSentiment,
              raw_sentiment: avgSentiment,
              confidence_score: confidence,
              data_timestamp: new Date().toISOString(),
              metadata: {
                content_id: `news_${symbol}_${Date.now()}`,
                article_count: articles.length,
                sample_headlines: articles.slice(0, 3).map(a => a.title)
              },
              content_snippet: articles[0]?.title || 'News sentiment analysis',
              volume_indicator: articles.length,
              engagement_score: confidence
            });
          } catch (error) {
            if (!error.message?.includes('duplicate key')) {
              console.warn('Error storing news sentiment data:', error);
            }
          }
        }
      }
      
      // Process Google Trends data and store in history
      const googleTrendsMap = new Map<string, number>();
      if (trendsData?.trends) {
        for (const trend of trendsData.trends) {
          googleTrendsMap.set(trend.symbol, trend.interest);
          
          // Store in sentiment history
          try {
            await supabase.from('sentiment_history').insert({
              symbol: trend.symbol,
              source: 'google_trends',
              sentiment_score: trend.interest, // Google Trends is already 0-1
              raw_sentiment: trend.interest,
              confidence_score: 0.8, // Google Trends is quite reliable
              data_timestamp: new Date().toISOString(),
              metadata: {
                content_id: `trends_${trend.symbol}_${Date.now()}`,
                search_volume: trend.interest
              },
              content_snippet: `Google Trends interest: ${trend.interest}`,
              volume_indicator: 1,
              engagement_score: trend.interest
            });
          } catch (error) {
            // Ignore duplicate key errors, log others
            if (!error.message?.includes('duplicate key')) {
              console.warn('Error storing Google Trends data:', error);
            }
          }
        }
      }
      
      // Process YouTube sentiment data with better validation and store in history
      const youtubeSentimentMap = new Map<string, number>();
      const youtubeConfidenceMap = new Map<string, number>();
      
      if (youtubeData?.youtube_sentiment) {
        for (const yt of youtubeData.youtube_sentiment) {
          // Only include YouTube data if it has meaningful sentiment and comment count
          if (yt.comment_count && yt.comment_count > 2 && typeof yt.sentiment === 'number') {
            const normalizedSentiment = Math.max(0.1, Math.min(0.9, yt.sentiment + 0.5));
            const confidence = Math.min(1.0, yt.comment_count / 10); // More comments = higher confidence
            
            youtubeSentimentMap.set(yt.symbol, normalizedSentiment);
            youtubeConfidenceMap.set(yt.symbol, confidence);
            
            // Store in sentiment history
            try {
              await supabase.from('sentiment_history').insert({
                symbol: yt.symbol,
                source: 'youtube',
                sentiment_score: normalizedSentiment,
                raw_sentiment: yt.sentiment,
                confidence_score: confidence,
                data_timestamp: new Date().toISOString(),
                metadata: {
                  content_id: `youtube_${yt.symbol}_${Date.now()}`,
                  comment_count: yt.comment_count,
                  avg_likes: yt.avg_likes || 0
                },
                content_snippet: `YouTube sentiment from ${yt.comment_count} comments`,
                volume_indicator: yt.comment_count,
                engagement_score: (yt.avg_likes || 0) / Math.max(1, yt.comment_count)
              });
            } catch (error) {
              if (!error.message?.includes('duplicate key')) {
                console.warn('Error storing YouTube sentiment data:', error);
              }
            }
          }
        }
      }

      // Create comprehensive data maps
      const sentimentMap = new Map<string, any>();
      
      // Map sentiment data by symbol
      sentimentResults.forEach((item: any) => {
        if (item?.symbol) {
          sentimentMap.set(item.symbol, item);
        }
      });
      
      // Map market data by symbol with intelligent data merging
      const marketDataMap = new Map<string, any>();
      
      // First pass: collect all market data by symbol
      marketResults.forEach((item: any) => {
        if (item?.symbol) {
          const existing = marketDataMap.get(item.symbol) || {};
          
          // Prioritize valid price data (Polygon > Yahoo > existing)
          const newPrice = typeof item.price === 'number' && item.price > 0 ? item.price : 0;
          const currentPrice = existing.price || 0;
          const bestPrice = newPrice > 0 ? newPrice : currentPrice;
          
          // Prioritize valid RSI data
          const newRsi = item.technical_indicators?.rsi;
          const currentRsi = existing.technical_indicators?.rsi;
          const bestRsi = (newRsi && newRsi > 0 && newRsi <= 100) ? newRsi : currentRsi;
          
          // Prioritize valid volume ratio
          const newVolumeRatio = item.technical_indicators?.volume_ratio;
          const currentVolumeRatio = existing.technical_indicators?.volume_ratio;
          const bestVolumeRatio = (newVolumeRatio && newVolumeRatio > 0) ? newVolumeRatio : currentVolumeRatio;
          
          const mergedItem = {
            symbol: item.symbol,
            price: bestPrice,
            volume: Math.max(item.volume || 0, existing.volume || 0),
            technical_indicators: {
              rsi: bestRsi && bestRsi > 0 ? Math.min(100, Math.max(0, bestRsi)) : undefined,
              volume_ratio: bestVolumeRatio && bestVolumeRatio > 0 ? bestVolumeRatio : undefined,
              momentum: item.technical_indicators?.momentum || existing.technical_indicators?.momentum || 0
            },
            yahoo_available: item.yahoo_available === true || existing.yahoo_available === true,
            polygon_available: item.polygon_available === true || existing.polygon_available === true,
            source: item.polygon_available ? 'polygon' : 'yahoo',
            data_quality: {
              has_price: bestPrice > 0,
              has_rsi: bestRsi && bestRsi > 0,
              has_volume: bestVolumeRatio && bestVolumeRatio > 0,
              quality_score: 0 // Will be calculated below
            }
          };
          
          mergedItem.data_quality.quality_score = [
            mergedItem.data_quality.has_price,
            mergedItem.data_quality.has_rsi,
            mergedItem.data_quality.has_volume
          ].filter(Boolean).length / 3;
          
          marketDataMap.set(item.symbol, mergedItem);
          
          // Enhanced logging for data quality issues
          if (mergedItem.data_quality.quality_score < 0.67) {
            console.warn(`⚠️ Data quality issues for ${item.symbol}: Quality=${(mergedItem.data_quality.quality_score * 100).toFixed(0)}%, Price=$${mergedItem.price}, RSI=${mergedItem.technical_indicators.rsi || 'N/A'}, Volume=${mergedItem.technical_indicators.volume_ratio?.toFixed(2) || 'N/A'}x, Source=${mergedItem.source}`);
          } else {
            console.log(`✅ Quality data for ${item.symbol}: Price=$${mergedItem.price}, RSI=${mergedItem.technical_indicators.rsi?.toFixed(1) || 'N/A'}, Volume=${mergedItem.technical_indicators.volume_ratio?.toFixed(2) || 'N/A'}x, Source=${mergedItem.source}`);
          }
        }
      });
      
      // Use the merged market data
      const marketMap = marketDataMap;
      
      // Apply sentiment stacking engine to generate consensus signals
      const enhancedSignals: TradeSignal[] = [];
      const stackingResults: StackingResult[] = [];
      
      // Enhanced logging for data quality with sentiment coverage monitoring
      const logDataQuality = (data: any[], step: string) => {
        const priceIssues = data.filter(d => !d.price || d.price === 0).length;
        const sentimentIssues = data.filter(d => 
          (!d.reddit_sentiment || d.reddit_sentiment === 0) &&
          (!d.stocktwits_sentiment || d.stocktwits_sentiment === 0) &&
          (!d.news_sentiment || d.news_sentiment === 0)
        ).length;
        
        // Track data source availability
        const dataSourceStatus = {
          reddit: data.filter(d => d.reddit_sentiment && d.reddit_sentiment > 0).length,
          stocktwits: data.filter(d => d.stocktwits_sentiment && d.stocktwits_sentiment > 0).length,
          news: data.filter(d => d.news_sentiment && d.news_sentiment > 0).length,
          youtube: data.filter(d => d.youtube_sentiment && d.youtube_sentiment > 0).length,
          technical: data.filter(d => d.rsi && d.rsi > 0 && d.volume_ratio && d.volume_ratio > 0).length
        };
        
        console.log(`📊 ${step} Data Quality:`, {
          total: data.length,
          priceIssues,
          sentimentIssues,
          dataSourceCoverage: dataSourceStatus,
          qualityScore: ((data.length - priceIssues - sentimentIssues) / data.length * 100).toFixed(1) + '%'
        });
        
        // Alert on critical data gaps
        if (priceIssues > data.length * 0.3) {
          console.warn(`⚠️ Critical: ${priceIssues}/${data.length} tickers missing price data`);
        }
        if (sentimentIssues > data.length * 0.7) {
          console.warn(`⚠️ Critical: ${sentimentIssues}/${data.length} tickers missing sentiment data`);
        }
      };

      addDebugInfo("STACKING_ENGINE_INPUT", {
        sentimentResultsCount: sentimentResults.length,
        marketResultsCount: marketResults.length,
        redditSentimentCount: redditSentimentMap.size,
        stocktwitsSentimentCount: stocktwitsSentimentMap.size,
        newsSentimentCount: newsSentimentMap.size,
        googleTrendsCount: googleTrendsMap.size,
        youtubeSentimentCount: youtubeSentimentMap.size,
        marketDataQuality: {
          validPrices: Array.from(marketMap.values()).filter((item: any) => item.price > 0).length,
          validRSI: Array.from(marketMap.values()).filter((item: any) => item.technical_indicators?.rsi > 0).length,
          validVolume: Array.from(marketMap.values()).filter((item: any) => item.technical_indicators?.volume_ratio > 0).length,
          yahooAvailable: Array.from(marketMap.values()).filter((item: any) => item.yahoo_available).length,
          polygonAvailable: Array.from(marketMap.values()).filter((item: any) => item.polygon_available).length
        }
      });
      
      // Get all unique symbols from both data sources
      const allSymbols = new Set([...sentimentMap.keys(), ...marketMap.keys(), ...allTickers]);
      
      // Apply early filtering to reduce processing load and focus on quality data
      const earlyFilteredData = Array.from(allSymbols).filter(symbol => {
        const marketData = marketMap.get(symbol);
        const hasReddit = redditSentimentMap.has(symbol);
        const hasStocktwits = stocktwitsSentimentMap.has(symbol);
        const hasNews = newsSentimentMap.has(symbol);
        const hasYoutube = youtubeSentimentMap.has(symbol);
        const hasGoogleTrends = googleTrendsMap.has(symbol);
        
        // Basic data quality requirements
        const hasPrice = marketData?.price && marketData.price > 0;
        const hasVolume = marketData?.technical_indicators?.volume_ratio && marketData.technical_indicators.volume_ratio > 0.5;
        const hasRSI = marketData?.technical_indicators?.rsi && marketData.technical_indicators.rsi > 0;
        
        // Sentiment quality check - require at least one meaningful sentiment source
        const hasMeaningfulSentiment = hasReddit || hasStocktwits || hasNews || hasYoutube;
        
        // Technical quality check
        const hasValidTechnical = hasRSI || (hasVolume && marketData.technical_indicators.volume_ratio > 1.2);
        
        // At minimum: price + (sentiment OR strong technical signal OR Google trends activity)
        return hasPrice && (hasMeaningfulSentiment || hasValidTechnical || hasGoogleTrends);
      });

      const processedTickers = earlyFilteredData.slice(0, 20); // Process quality-filtered symbols
      let signalsGenerated = 0;
      
      addDebugInfo("STACKING_SYMBOLS", {
        totalSymbols: allSymbols.size,
        processedTickers: processedTickers.length,
        stackingConfig: stackingEngine.getConfig()
      });
      
      for (const ticker of processedTickers) {
        const sentimentData = sentimentMap.get(ticker);
        const marketData = marketMap.get(ticker);
        
        // Create comprehensive error tracking for debugging
        const marketDataErrors: { [key: string]: string } = {};
        if (!marketData?.yahoo_available && !marketData?.polygon_available) {
          marketDataErrors.market_data = 'No market data sources available';
        }
        if (!marketData?.technical_indicators?.rsi || marketData.technical_indicators.rsi <= 0) {
          marketDataErrors.rsi = 'Invalid or missing RSI data';
        }
        if (!marketData?.technical_indicators?.volume_ratio || marketData.technical_indicators.volume_ratio <= 0) {
          marketDataErrors.volume = 'Invalid or missing volume data';
        }
        
        // Apply sentiment stacking engine with enhanced data sources and error tracking
        const stackingResult = stackingEngine.stackSentiment({
          symbol: ticker,
          reddit_sentiment: redditSentimentMap.get(ticker),
          stocktwits_sentiment: stocktwitsSentimentMap.get(ticker),
          news_sentiment: newsSentimentMap.get(ticker),
          google_trends: googleTrendsMap.get(ticker),
          youtube_sentiment: youtubeSentimentMap.get(ticker),
          technical_indicators: marketData?.technical_indicators, // Pass full technical indicators object
          rsi: marketData?.technical_indicators?.rsi > 0 ? marketData.technical_indicators.rsi : undefined,
          volume_ratio: marketData?.technical_indicators?.volume_ratio > 0 ? marketData.technical_indicators.volume_ratio : undefined,
          polygon_available: marketData?.polygon_available || false,
          yahoo_available: marketData?.yahoo_available || false,
          errors: {
            ...marketDataErrors,
            reddit: !redditSentimentMap.get(ticker) ? 'No Reddit sentiment data' : undefined,
            stocktwits: !stocktwitsSentimentMap.get(ticker) ? 'No Stocktwits sentiment data' : undefined,
            news: !newsSentimentMap.get(ticker) ? 'No news sentiment data' : undefined,
            google_trends: !googleTrendsMap.get(ticker) ? 'No Google Trends data' : undefined,
            youtube: !youtubeSentimentMap.get(ticker) ? 'No YouTube sentiment data' : undefined
          }
        });
        
        stackingResults.push(stackingResult);
        addDebugInfo(`STACKING_${ticker}`, stackingResult);
        
        // Generate signal only for quality recommendations that pass coverage gate
        if (stackingResult.recommendAction && stackingResult.passedCoverageGate && stackingResult.confidenceScore >= 0.5) {
          // Enhanced category classification to fix "UNKNOWN" issues
          let category = 'UNKNOWN';
          const stockByCategory = CATEGORIES.find(cat => 
            getStocksByCategory(cat).map(stock => stock.ticker).includes(ticker)
          );
          
          if (stockByCategory) {
            category = stockByCategory;
          } else {
            // Enhanced category mapping for major tickers
            if (['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'].includes(ticker)) {
              category = 'MEGA_CAP_TECH';
            } else if (['NVDA', 'AMD', 'INTC', 'QCOM'].includes(ticker)) {
              category = 'SEMICONDUCTORS';  
            } else if (['SPY', 'QQQ', 'IWM', 'DIA', 'TQQQ', 'SQQQ'].includes(ticker)) {
              category = 'ETF_INDEX';
            } else if (['SHOP', 'SNAP', 'SPOT', 'UBER', 'LYFT', 'RBLX'].includes(ticker)) {
              category = 'TECH_GROWTH';
            } else if (['TLRY', 'MSOS', 'SNDL', 'CGC', 'ACB'].includes(ticker)) {
              category = 'CANNABIS';
            } else if (['DJT', 'DWAC'].includes(ticker)) {
              category = 'SPAC_POLITICAL';
            }
          }

          const signal: TradeSignal = {
            ticker: ticker,
            category: category,
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
            <div className="space-y-6">
              {/* Quality sentiment-backed recommendations */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Quality Sentiment-Backed Recommendations ({stackingResults.filter(result => result.recommendAction && result.passedCoverageGate).length})
                </h3>
                
                {stackingResults.filter(result => result.recommendAction && !result.passedCoverageGate).length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-center gap-2 text-amber-800 text-sm">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">Coverage Gate Active:</span>
                      <span>{stackingResults.filter(result => result.recommendAction && !result.passedCoverageGate).length} technical-only signals filtered out (no sentiment data)</span>
                    </div>
                  </div>
                )}

                {stackingResults.filter(result => result.recommendAction && result.passedCoverageGate).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p>No sentiment-backed recommendations found.</p>
                    <p className="text-sm">
                      {stackingResults.filter(result => result.recommendAction && !result.passedCoverageGate).length > 0 
                        ? `${stackingResults.filter(result => result.recommendAction && !result.passedCoverageGate).length} technical-only signals are available but lack sentiment confirmation`
                        : 'Waiting for quality sentiment signals...'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {stackingResults
                      .filter(result => result.recommendAction && result.passedCoverageGate)
                      .sort((a, b) => b.confidenceScore - a.confidenceScore)
                      .map((result, index) => (
                        <StackingVisualizer 
                          key={index} 
                          result={result} 
                          showDetails={true}
                        />
                      ))}
                  </div>
                )}
              </div>

              {/* Technical-Only Signals (Coverage Gate Filtered) */}
              {stackingResults.filter(result => result.recommendAction && !result.passedCoverageGate).length > 0 && (
                <div className="bg-gray-50 p-6 rounded-lg border border-amber-200">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    Technical-Only Signals (Filtered by Coverage Gate)
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    These signals have strong technical indicators but lack sentiment data confirmation.
                    They're filtered out to ensure recommendation quality.
                  </p>
                  <div className="grid gap-4">
                    {stackingResults
                      .filter(result => result.recommendAction && !result.passedCoverageGate)
                      .sort((a, b) => b.confidenceScore - a.confidenceScore)
                      .slice(0, 4)
                      .map((result, index) => (
                        <StackingVisualizer 
                          key={index} 
                          result={result} 
                          showDetails={true} 
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* All Other Analysis */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  All Stacking Analysis
                </h3>
                <div className="grid gap-4">
                  {stackingResults
                    .sort((a, b) => b.confidenceScore - a.confidenceScore)
                    .map((result, index) => (
                      <StackingVisualizer 
                        key={index} 
                        result={result} 
                        showDetails={index < 6} // Show details for top 6
                      />
                    ))}
                </div>
              </div>
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
          {debugInfo.length > 0 ? (
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
