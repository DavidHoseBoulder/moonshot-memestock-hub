// Stage 1: Batch sentiment sourcing strategy
import { supabase } from '@/integrations/supabase/client';

export interface BatchProcessingConfig {
  maxBatchSize: number;
  staggerDelayMs: number;
  rateLimitWindow: number; // minutes
  enableRedundancy: boolean;
  timescaleWeights: {
    hour1: number;
    hour6: number;
    hour24: number;
  };
}

export interface SentimentBatch {
  symbols: string[];
  sources: string[];
  timestamp: number;
  batchId: string;
}

export interface BatchResult {
  batchId: string;
  processedSymbols: string[];
  failedSymbols: string[];
  coverage: number;
  processingTimeMs: number;
}

export class SentimentBatchProcessor {
  private config: BatchProcessingConfig;
  private supabaseClient;
  private activeBatches: Map<string, SentimentBatch>;
  private lastApiCall: Map<string, number>;

  constructor(config: BatchProcessingConfig) {
    this.config = config;
    this.activeBatches = new Map();
    this.lastApiCall = new Map();
    
    // Use the existing configured Supabase client
    this.supabaseClient = supabase;
  }

  /**
   * Stage 1: Create optimized batches with staggered processing
   */
  createOptimizedBatches(symbols: string[]): SentimentBatch[] {
    const batches: SentimentBatch[] = [];
    const prioritizedSymbols = this.prioritizeSymbolsByCategory(symbols);
    
    for (let i = 0; i < prioritizedSymbols.length; i += this.config.maxBatchSize) {
      const batchSymbols = prioritizedSymbols.slice(i, i + this.config.maxBatchSize);
      const batch: SentimentBatch = {
        symbols: batchSymbols,
        sources: ['reddit', 'stocktwits', 'twitter', 'google_trends', 'news'],
        timestamp: Date.now() + (i / this.config.maxBatchSize) * this.config.staggerDelayMs,
        batchId: `batch_${Date.now()}_${i}`
      };
      batches.push(batch);
    }
    
    return batches;
  }

  /**
   * Stage 2: Process batch with redundancy and fallbacks
   */
  async processBatchWithRedundancy(batch: SentimentBatch): Promise<BatchResult> {
    const startTime = Date.now();
    const processedSymbols: string[] = [];
    const failedSymbols: string[] = [];

    console.log(`Processing batch ${batch.batchId} with ${batch.symbols.length} symbols`);

    try {
      // Get existing data first to minimize API calls
      const existingData = await this.getRecentSentimentData(batch.symbols);
      
      // Identify symbols needing fresh data
      const symbolsNeedingData = batch.symbols.filter(symbol => 
        !this.hasRecentData(existingData, symbol)
      );

      // Process in smaller sub-batches to avoid rate limits
      const subBatches = this.createSubBatches(symbolsNeedingData, 10);
      
      for (const subBatch of subBatches) {
        await this.processSubBatchWithFallbacks(subBatch, processedSymbols, failedSymbols);
        
        // Stagger requests to avoid rate limits
        if (subBatches.indexOf(subBatch) < subBatches.length - 1) {
          await this.sleep(this.config.staggerDelayMs);
        }
      }

      // Apply Stage 2 redundancy for failed symbols
      if (this.config.enableRedundancy && failedSymbols.length > 0) {
        await this.applyRedundancyStrategy(failedSymbols, processedSymbols);
      }

    } catch (error) {
      console.error(`Batch ${batch.batchId} failed:`, error);
      failedSymbols.push(...batch.symbols);
    }

    const processingTime = Date.now() - startTime;
    const coverage = processedSymbols.length / batch.symbols.length;

    return {
      batchId: batch.batchId,
      processedSymbols,
      failedSymbols,
      coverage,
      processingTimeMs: processingTime
    };
  }

  /**
   * Stage 2: Apply redundancy strategy for failed symbols
   */
  private async applyRedundancyStrategy(failedSymbols: string[], processedSymbols: string[]) {
    console.log(`Applying redundancy for ${failedSymbols.length} failed symbols`);
    
    for (const symbol of failedSymbols) {
      try {
        // Strategy 1: Use cached data from different timeframes
        const multiscaleData = await this.getMultiTimescaleSentiment(symbol);
        if (multiscaleData) {
          await this.storeSyntheticSentiment(symbol, multiscaleData, 'multiscale_fallback');
          processedSymbols.push(symbol);
          continue;
        }

        // Strategy 2: Derive from Google Trends if available
        const trendsData = await this.deriveSentimentFromTrends(symbol);
        if (trendsData) {
          await this.storeSyntheticSentiment(symbol, trendsData, 'trends_derived');
          processedSymbols.push(symbol);
          continue;
        }

        // Strategy 3: Use sector/peer sentiment as proxy
        const peerSentiment = await this.getPeerSentimentProxy(symbol);
        if (peerSentiment) {
          await this.storeSyntheticSentiment(symbol, peerSentiment, 'peer_proxy');
          processedSymbols.push(symbol);
        }

      } catch (error) {
        console.error(`Redundancy failed for ${symbol}:`, error);
      }
    }
  }

  /**
   * Stage 3: Multi-timescale sentiment smoothing
   */
  async getMultiTimescaleSentiment(symbol: string): Promise<any | null> {
    try {
      const now = new Date();
      const timeframes = [
        { hours: 1, weight: this.config.timescaleWeights.hour1 },
        { hours: 6, weight: this.config.timescaleWeights.hour6 },
        { hours: 24, weight: this.config.timescaleWeights.hour24 }
      ];

      const sentimentScores: Array<{ sentiment: number; confidence: number; weight: number }> = [];

      for (const timeframe of timeframes) {
        const startTime = new Date(now.getTime() - timeframe.hours * 60 * 60 * 1000);
        
        const { data } = await this.supabaseClient
          .from('sentiment_history')
          .select('sentiment_score, confidence_score')
          .eq('symbol', symbol)
          .gte('created_at', startTime.toISOString())
          .not('source', 'in', '(multiscale_fallback,trends_derived,peer_proxy)'); // Exclude synthetic

        if (data && data.length > 0) {
          const avgSentiment = data.reduce((sum, item) => sum + item.sentiment_score, 0) / data.length;
          const avgConfidence = data.reduce((sum, item) => sum + item.confidence_score, 0) / data.length;
          
          sentimentScores.push({
            sentiment: avgSentiment,
            confidence: avgConfidence,
            weight: timeframe.weight
          });
        }
      }

      if (sentimentScores.length >= 2) {
        // Weighted average across timescales
        const totalWeight = sentimentScores.reduce((sum, s) => sum + s.weight * s.confidence, 0);
        const weightedSentiment = sentimentScores.reduce((sum, s) => 
          sum + (s.sentiment * s.weight * s.confidence), 0) / totalWeight;
        const avgConfidence = sentimentScores.reduce((sum, s) => sum + s.confidence, 0) / sentimentScores.length;

        return {
          sentiment_score: weightedSentiment,
          confidence_score: avgConfidence * 0.8, // Penalty for being synthetic
          metadata: {
            type: 'multiscale_average',
            timescales_used: sentimentScores.length,
            source_timeframes: timeframes.filter((_, i) => i < sentimentScores.length)
          }
        };
      }

      return null;
    } catch (error) {
      console.error(`Multi-timescale sentiment failed for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Derive sentiment from Google Trends momentum
   */
  private async deriveSentimentFromTrends(symbol: string): Promise<any | null> {
    try {
      const { data } = await this.supabaseClient
        .from('sentiment_history')
        .select('sentiment_score, created_at')
        .eq('symbol', symbol)
        .eq('source', 'google_trends')
        .order('created_at', { ascending: false })
        .limit(5);

      if (data && data.length >= 3) {
        // Calculate trend momentum
        const scores = data.map(d => d.sentiment_score);
        const recent = scores.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
        const older = scores.slice(2).reduce((a, b) => a + b, 0) / (scores.length - 2);
        
        const momentum = recent - older;
        const sentiment = Math.max(-0.5, Math.min(0.5, momentum * 2)); // Convert to sentiment range
        
        return {
          sentiment_score: sentiment,
          confidence_score: 0.4, // Lower confidence for derived data
          metadata: {
            type: 'trends_derived',
            momentum,
            recent_avg: recent,
            historical_avg: older
          }
        };
      }

      return null;
    } catch (error) {
      console.error(`Trends derivation failed for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get peer sentiment as proxy
   */
  private async getPeerSentimentProxy(symbol: string): Promise<any | null> {
    try {
      // This would need sector mapping - simplified for now
      const sectorPeers = this.getSectorPeers(symbol);
      
      if (sectorPeers.length > 0) {
        const { data } = await this.supabaseClient
          .from('sentiment_history')
          .select('sentiment_score, confidence_score')
          .in('symbol', sectorPeers)
          .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // Last 2 hours
          .not('source', 'in', '(peer_proxy)'); // Avoid circular proxies

        if (data && data.length >= 3) {
          const avgSentiment = data.reduce((sum, item) => sum + item.sentiment_score, 0) / data.length;
          const avgConfidence = data.reduce((sum, item) => sum + item.confidence_score, 0) / data.length;
          
          return {
            sentiment_score: avgSentiment,
            confidence_score: avgConfidence * 0.3, // Heavy penalty for peer proxy
            metadata: {
              type: 'peer_proxy',
              peers_used: sectorPeers,
              peer_count: data.length
            }
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Peer proxy failed for ${symbol}:`, error);
      return null;
    }
  }

  // Helper methods
  private prioritizeSymbolsByCategory(symbols: string[]): string[] {
    // Import the existing prioritization logic or implement here
    const priorities = {
      'TSLA': 1, 'AAPL': 1, 'NVDA': 1, 'MSFT': 1,
      'GME': 2, 'AMC': 2, 'BBBY': 2,
      'SPY': 3, 'QQQ': 3
    };
    
    return symbols.sort((a, b) => (priorities[a] || 999) - (priorities[b] || 999));
  }

  private async getRecentSentimentData(symbols: string[]) {
    const { data } = await this.supabaseClient
      .from('sentiment_history')
      .select('symbol, source, created_at')
      .in('symbol', symbols)
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
    
    return data || [];
  }

  private hasRecentData(existingData: any[], symbol: string): boolean {
    const symbolData = existingData.filter(d => d.symbol === symbol);
    return symbolData.length >= 2; // Require at least 2 sources
  }

  private createSubBatches(symbols: string[], size: number): string[][] {
    const batches = [];
    for (let i = 0; i < symbols.length; i += size) {
      batches.push(symbols.slice(i, i + size));
    }
    return batches;
  }

  private async processSubBatchWithFallbacks(
    symbols: string[], 
    processed: string[], 
    failed: string[]
  ) {
    // Process symbols with primary sources first
    // This would integrate with existing edge functions
    try {
      // Call existing edge functions in batch mode
      await this.callBatchAPI('reddit-auth', symbols);
      await this.callBatchAPI('stocktwits-data', symbols);
      await this.callBatchAPI('twitter-sentiment', symbols);
      
      processed.push(...symbols);
    } catch (error) {
      console.error('Sub-batch processing failed:', error);
      failed.push(...symbols);
    }
  }

  private async callBatchAPI(functionName: string, symbols: string[]) {
    // Batch API calls to edge functions
    return this.supabaseClient.functions.invoke(functionName, {
      body: { symbols, limit: symbols.length }
    });
  }

  private async storeSyntheticSentiment(symbol: string, data: any, source: string) {
    await this.supabaseClient
      .from('sentiment_history')
      .insert({
        symbol,
        source,
        sentiment_score: data.sentiment_score,
        confidence_score: data.confidence_score,
        metadata: data.metadata,
        created_at: new Date().toISOString()
      });
  }

  private getSectorPeers(symbol: string): string[] {
    // Simplified sector mapping - would be more comprehensive in production
    const sectorMap = {
      'TSLA': ['RIVN', 'LCID', 'NIO'],
      'AAPL': ['MSFT', 'GOOGL', 'META'],
      'GME': ['AMC', 'BBBY', 'KOSS'],
      'NVDA': ['AMD', 'INTC', 'QCOM']
    };
    
    return sectorMap[symbol] || [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default configuration
export const DEFAULT_BATCH_CONFIG: BatchProcessingConfig = {
  maxBatchSize: 25,
  staggerDelayMs: 2000,
  rateLimitWindow: 15,
  enableRedundancy: true,
  timescaleWeights: {
    hour1: 0.5,
    hour6: 0.3,
    hour24: 0.2
  }
};