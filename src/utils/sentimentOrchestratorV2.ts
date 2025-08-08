// Enhanced sentiment orchestrator implementing the 3-stage strategy
import { SentimentBatchProcessor, DEFAULT_BATCH_CONFIG, BatchResult } from './sentimentBatchProcessor';
import { aggregateSentiment, AggregatedSentiment } from './sentimentAggregator';
import { supabase } from '@/integrations/supabase/client';

export interface OrchestrationResult {
  totalSymbols: number;
  processedSymbols: number;
  coverage: number;
  batchResults: BatchResult[];
  sentimentResults: Map<string, AggregatedSentiment>;
  processingTimeMs: number;
  qualityMetrics: {
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    synthetic: number;
  };
}

export interface OrchestrationConfig {
  enableBatchProcessing: boolean;
  enableRedundancy: boolean;
  enableMultiTimescale: boolean;
  analysisLookbackHours: number; // Used when Stage 1 is skipped
  maxAnalysisLookbackHours: number; // Fallback window when data is sparse
  qualityGate: {
    minSources: number;
    minConfidence: number;
    allowSynthetic: boolean;
  };
}

export class SentimentOrchestratorV2 {
  private batchProcessor: SentimentBatchProcessor;
  private supabaseClient;
  private config: OrchestrationConfig;

  constructor(config: OrchestrationConfig) {
    this.config = config;
    this.batchProcessor = new SentimentBatchProcessor(DEFAULT_BATCH_CONFIG);
    this.supabaseClient = supabase;
  }

  /**
   * Main orchestration method implementing all 3 stages
   */
  async orchestrateSentimentCollection(symbols: string[]): Promise<OrchestrationResult> {
    const startTime = Date.now();
    console.log(`Starting orchestrated sentiment collection for ${symbols.length} symbols`);

    try {
      // Stage 1: Batch processing with staggered requests
      const batchResults = await this.executeBatchProcessing(symbols);
      
      // Stage 2 & 3: Get aggregated sentiment with redundancy and multi-timescale
      const sentimentResults = await this.aggregateWithEnhancements(symbols);
      
      // Calculate quality metrics
      const qualityMetrics = this.calculateQualityMetrics(sentimentResults);
      
      const totalProcessed = Array.from(sentimentResults.keys()).length;
      const coverage = totalProcessed / symbols.length;
      
      const result: OrchestrationResult = {
        totalSymbols: symbols.length,
        processedSymbols: totalProcessed,
        coverage,
        batchResults,
        sentimentResults,
        processingTimeMs: Date.now() - startTime,
        qualityMetrics
      };

      console.log(`Orchestration complete: ${coverage * 100}% coverage, ${qualityMetrics.highConfidence} high-confidence results`);
      return result;

    } catch (error) {
      console.error('Sentiment orchestration failed:', error);
      throw error;
    }
  }

  /**
   * Stage 1: Execute batch processing strategy
   */
  private async executeBatchProcessing(symbols: string[]): Promise<BatchResult[]> {
    if (!this.config.enableBatchProcessing) {
      console.log('Batch processing disabled, using legacy mode');
      return [];
    }

    console.log('Executing Stage 1: Batch processing with rate limit management');
    
    const batches = this.batchProcessor.createOptimizedBatches(symbols);
    const batchResults: BatchResult[] = [];

    console.log(`Created ${batches.length} optimized batches`);

    for (const batch of batches) {
      try {
        // Wait for the scheduled time
        const delay = Math.max(0, batch.timestamp - Date.now());
        if (delay > 0) {
          console.log(`Waiting ${delay}ms before processing batch ${batch.batchId}`);
          await this.sleep(delay);
        }

        const result = await this.batchProcessor.processBatchWithRedundancy(batch);
        batchResults.push(result);
        
        console.log(`Batch ${batch.batchId} completed: ${result.coverage * 100}% coverage`);
        
      } catch (error) {
        console.error(`Batch ${batch.batchId} failed:`, error);
        batchResults.push({
          batchId: batch.batchId,
          processedSymbols: [],
          failedSymbols: batch.symbols,
          coverage: 0,
          processingTimeMs: 0
        });
      }
    }

    return batchResults;
  }

  /**
   * Stage 2 & 3: Enhanced aggregation with redundancy and multi-timescale
   */
  private async aggregateWithEnhancements(symbols: string[]): Promise<Map<string, AggregatedSentiment>> {
    console.log('Executing Stage 2&3: Enhanced aggregation with redundancy');
    
    const results = new Map<string, AggregatedSentiment>();
    
    for (const symbol of symbols) {
      try {
        const enhancedSentiment = await this.getEnhancedSentiment(symbol);
        if (enhancedSentiment && this.passesQualityGate(enhancedSentiment)) {
          results.set(symbol, enhancedSentiment);
        }
      } catch (error) {
        console.error(`Enhanced aggregation failed for ${symbol}:`, error);
      }
    }

    return results;
  }

  /**
   * Get enhanced sentiment with all strategies applied
   */
  private async getEnhancedSentiment(symbol: string): Promise<AggregatedSentiment | null> {
    try {
// Get sentiment data using adaptive lookback (wider when Stage 1 is off)
const primaryLookbackHours = this.config.enableBatchProcessing ? 2 : (this.config.analysisLookbackHours ?? 24);
const maxLookbackHours = this.config.maxAnalysisLookbackHours ?? 168; // 7 days
const fromISO = (hrs: number) => new Date(Date.now() - hrs * 60 * 60 * 1000).toISOString();

// Prefer data_timestamp for freshness
let { data } = await this.supabaseClient
  .from('sentiment_history')
  .select('*')
  .eq('symbol', symbol)
  .gte('data_timestamp', fromISO(primaryLookbackHours))
  .order('data_timestamp', { ascending: false });

// Fallback: widen lookback when Stage 1 is off and no data found
if ((!data || data.length === 0) && !this.config.enableBatchProcessing && maxLookbackHours > primaryLookbackHours) {
  const widened = await this.supabaseClient
    .from('sentiment_history')
    .select('*')
    .eq('symbol', symbol)
    .gte('data_timestamp', fromISO(maxLookbackHours))
    .order('data_timestamp', { ascending: false });
  data = widened.data ?? null;
}

if (!data || data.length === 0) {
  console.log(`No data in last ${!this.config.enableBatchProcessing ? maxLookbackHours : primaryLookbackHours}h for ${symbol}`);
  return null;
}

      // Group by source and get latest values
      const sourceData = this.groupBySourceLatest(data);
      
      // Apply multi-timescale smoothing if enabled
      let processedData = sourceData;
      if (this.config.enableMultiTimescale) {
        processedData = await this.applyMultiTimescaleSmoothing(symbol, sourceData);
      }

      // Create aggregated sentiment
      const aggregated = aggregateSentiment(
        processedData.reddit?.sentiment_score,
        processedData.stocktwits?.sentiment_score,
        processedData.news?.sentiment_score,
        processedData.google_trends?.sentiment_score,
        processedData.youtube?.sentiment_score,
        processedData.twitter?.sentiment_score,
        processedData.reddit?.confidence_score || 0.7,
        processedData.stocktwits?.confidence_score || 0.8,
        processedData.news?.confidence_score || 0.9,
        processedData.twitter?.confidence_score || 0.8
      );

      // Enhance with metadata about data quality
      return {
        ...aggregated,
        sources: Object.keys(processedData),
        coverage: Object.keys(processedData).length / 6, // 6 total sources
        availability: {
          reddit: !!processedData.reddit,
          stocktwits: !!processedData.stocktwits,
          news: !!processedData.news,
          google_trends: !!processedData.google_trends,
          youtube: !!processedData.youtube,
          twitter: !!processedData.twitter
        }
      };

    } catch (error) {
      console.error(`Enhanced sentiment failed for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Apply multi-timescale smoothing to source data
   */
  private async applyMultiTimescaleSmoothing(symbol: string, sourceData: any): Promise<any> {
    const smoothedData = { ...sourceData };

    for (const [source, data] of Object.entries(sourceData)) {
      if (!data) continue;

      try {
        // Get historical data for this source
        const { data: historicalData } = await this.supabaseClient
          .from('sentiment_history')
          .select('sentiment_score, confidence_score, created_at')
          .eq('symbol', symbol)
          .eq('source', source)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(10);

        if (historicalData && historicalData.length >= 3) {
          // Apply exponential moving average
          const smoothedSentiment = this.calculateEMA(
            historicalData.map(d => d.sentiment_score),
            0.3 // Alpha for smoothing
          );

          const smoothedConfidence = this.calculateEMA(
            historicalData.map(d => d.confidence_score),
            0.3
          );

          smoothedData[source] = {
            ...(data as any),
            sentiment_score: smoothedSentiment,
            confidence_score: smoothedConfidence * 1.1, // Bonus for stability
            metadata: {
              ...(data as any).metadata || {},
              smoothed: true,
              historical_points: historicalData.length
            }
          };
        }
      } catch (error) {
        console.error(`Multi-timescale smoothing failed for ${symbol}:${source}`, error);
      }
    }

    return smoothedData;
  }

  /**
   * Group sentiment data by source, keeping latest values
   */
  private groupBySourceLatest(data: any[]): { [source: string]: any } {
    const grouped: { [source: string]: any } = {};
    
// Sort by data_timestamp (fallback to created_at) descending, then group by source
const sorted = data.sort((a, b) => {
  const ta = new Date((a as any).data_timestamp || (a as any).created_at).getTime();
  const tb = new Date((b as any).data_timestamp || (b as any).created_at).getTime();
  return tb - ta;
});
    
    for (const item of sorted) {
      if (!grouped[item.source]) {
        grouped[item.source] = item;
      }
    }
    
    return grouped;
  }

  /**
   * Calculate exponential moving average
   */
  private calculateEMA(values: number[], alpha: number): number {
    if (values.length === 0) return 0;
    
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
      ema = alpha * values[i] + (1 - alpha) * ema;
    }
    
    return ema;
  }

  /**
   * Check if sentiment passes quality gate
   */
  private passesQualityGate(sentiment: AggregatedSentiment): boolean {
    const { minSources, minConfidence, allowSynthetic } = this.config.qualityGate;
    
    // Check minimum sources
    if (sentiment.sources.length < minSources) {
      return false;
    }
    
    // Check minimum confidence
    if (sentiment.confidence < minConfidence) {
      return false;
    }
    
    // Check synthetic data allowance
    if (!allowSynthetic) {
      const syntheticSources = ['multiscale_fallback', 'trends_derived', 'peer_proxy'];
      const hasSynthetic = sentiment.sources.some(source => syntheticSources.includes(source));
      if (hasSynthetic) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Calculate quality metrics for the results
   */
  private calculateQualityMetrics(results: Map<string, AggregatedSentiment>) {
    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;
    let synthetic = 0;

    for (const sentiment of results.values()) {
      const syntheticSources = ['multiscale_fallback', 'trends_derived', 'peer_proxy'];
      const hasSynthetic = sentiment.sources.some(source => syntheticSources.includes(source));
      
      if (hasSynthetic) {
        synthetic++;
      } else if (sentiment.confidence >= 0.7) {
        highConfidence++;
      } else if (sentiment.confidence >= 0.4) {
        mediumConfidence++;
      } else {
        lowConfidence++;
      }
    }

    return {
      highConfidence,
      mediumConfidence,
      lowConfidence,
      synthetic
    };
  }

  /**
   * Update orchestration configuration
   */
  updateConfig(newConfig: Partial<OrchestrationConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default orchestration configuration
export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  enableBatchProcessing: true,
  enableRedundancy: true,
  enableMultiTimescale: true,
analysisLookbackHours: 24,
  maxAnalysisLookbackHours: 168,
  qualityGate: {
    minSources: 2,
    minConfidence: 0.3,
    allowSynthetic: false
  }
};