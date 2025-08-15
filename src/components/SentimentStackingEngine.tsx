import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";

// Data source interfaces
export interface DataSource {
  name: string;
  available: boolean;
  score?: number;
  threshold: number;
  weight: number;
  passed: boolean;
  errorMessage?: string;
}

export interface StackingConfig {
  sentiment_reddit: { threshold: number; weight: number };
  sentiment_stocktwits: { threshold: number; weight: number };
  sentiment_news: { threshold: number; weight: number };
  rsi_oversold: { threshold: number; weight: number };
  rsi_overbought: { threshold: number; weight: number };
  volume_spike: { threshold: number; weight: number };
  market_data_polygon: { threshold: number; weight: number };
  market_data_yahoo: { threshold: number; weight: number };
  // Future sources
  google_trends: { threshold: number; weight: number };
  youtube_sentiment: { threshold: number; weight: number };
}

export interface StackingResult {
  symbol: string;
  sources: DataSource[];
  totalVotes: number;
  maxPossibleVotes: number;
  confidenceScore: number;
  signalStrength: 'WEAK' | 'MODERATE' | 'STRONG';
  recommendAction: boolean;
  passedCoverageGate: boolean;
  votingBreakdown: {
    sentiment: number;
    technical: number;
    market_data: number;
    future_sources: number;
  };
  coverageGate: {
    sentimentScore: number;
    technicalScore: number;
    minSentimentThreshold: number;
    minTechnicalThreshold: number;
    minConfidenceThreshold: number;
    reason?: string;
  };
  debugInfo?: {
    availableSources: number;
    sentimentSources: number;
    technicalSources: number;
    degradedMode: boolean;
    strongSentiment: number;
    volumeBoost: boolean;
    rsiExtreme: boolean;
  };
}

// Default configuration with conservative thresholds
export const DEFAULT_STACKING_CONFIG: StackingConfig = {
  // Sentiment sources (normalized -1 to 1)
  sentiment_reddit: { threshold: 0.3, weight: 1.0 },
  sentiment_stocktwits: { threshold: 0.25, weight: 1.0 },
  sentiment_news: { threshold: 0.2, weight: 0.8 },
  
  // Technical indicators
  rsi_oversold: { threshold: 30, weight: 1.2 }, // RSI < 30
  rsi_overbought: { threshold: 70, weight: 1.2 }, // RSI > 70
  volume_spike: { threshold: 1.5, weight: 0.8 }, // Volume > 1.5x average
  
  // Market data availability (binary)
  market_data_polygon: { threshold: 1, weight: 0.5 }, // Available = 1
  market_data_yahoo: { threshold: 1, weight: 0.5 }, // Available = 1
  
  // Additional sources (now active)
  google_trends: { threshold: 0.2, weight: 0.8 }, // Trends interest > 0.2
  youtube_sentiment: { threshold: 0.1, weight: 0.9 } // YouTube sentiment > 0.1
};

export class SentimentStackingEngine {
  private config: StackingConfig;
  
  // Coverage gate thresholds - Require meaningful sentiment data
  private static readonly MIN_SENTIMENT_SCORE = 0.2;      // Require actual sentiment signal
  private static readonly MIN_TECHNICAL_SCORE = 0.3;      // Technical confirmation
  private static readonly MIN_CONFIDENCE = 50.0;          // Reasonable confidence floor

  constructor(config: StackingConfig = DEFAULT_STACKING_CONFIG) {
    this.config = config;
  }

  /**
   * Coverage gate to ensure quality recommendations with actual sentiment backing
   */
  private coverageGate(result: {
    sentimentScore: number;
    technicalScore: number;
    confidence: number;
  }): { passed: boolean; reason?: string } {
    const hasSentiment = result.sentimentScore >= SentimentStackingEngine.MIN_SENTIMENT_SCORE;
    const hasTechnical = result.technicalScore >= SentimentStackingEngine.MIN_TECHNICAL_SCORE;
    const meetsConfidence = result.confidence >= SentimentStackingEngine.MIN_CONFIDENCE;

    // Require both meaningful sentiment AND technical confirmation for BUY signals
    if (!hasSentiment) {
      return { passed: false, reason: 'No meaningful sentiment data available' };
    }
    if (!hasTechnical) {
      return { passed: false, reason: 'Insufficient technical confirmation' };
    }
    if (!meetsConfidence) {
      return { passed: false, reason: 'Below minimum confidence threshold' };
    }

    return { passed: true, reason: 'Passed coverage gate with quality data' };
  }

  // Evaluate a single data source against its threshold
  private evaluateSource(
    name: string, 
    value: number | undefined, 
    available: boolean,
    errorMessage?: string
  ): DataSource {
    const sourceConfig = this.config[name as keyof StackingConfig];
    
    if (!available || value === undefined) {
      return {
        name,
        available: false,
        threshold: sourceConfig.threshold,
        weight: sourceConfig.weight,
        passed: false,
        errorMessage
      };
    }

    // Special handling for RSI overbought (reverse logic)
    const passed = name === 'rsi_overbought' 
      ? value > sourceConfig.threshold 
      : value >= sourceConfig.threshold;

    return {
      name,
      available: true,
      score: value,
      threshold: sourceConfig.threshold,
      weight: sourceConfig.weight,
      passed,
    };
  }

  // Stack all sentiment sources for a symbol
  stackSentiment(data: {
    symbol: string;
    reddit_sentiment?: number;
    stocktwits_sentiment?: number;
    news_sentiment?: number;
    rsi?: number;
    technical_indicators?: {
      rsi?: number;
      volume_ratio?: number;
    };
    volume_ratio?: number;
    polygon_available?: boolean;
    yahoo_available?: boolean;
    google_trends?: number;
    youtube_sentiment?: number;
    errors?: { [key: string]: string };
  }): StackingResult {
    
    // Extract technical indicators with fallbacks
    const actualRSI = data.technical_indicators?.rsi ?? data.rsi;
    const actualVolumeRatio = data.technical_indicators?.volume_ratio ?? data.volume_ratio;
    
    const sources: DataSource[] = [
      // Sentiment sources - only include if they have meaningful values
      this.evaluateSource('sentiment_reddit', data.reddit_sentiment, 
        data.reddit_sentiment !== undefined && Math.abs(data.reddit_sentiment) > 0.01, data.errors?.reddit),
      this.evaluateSource('sentiment_stocktwits', data.stocktwits_sentiment, 
        data.stocktwits_sentiment !== undefined && Math.abs(data.stocktwits_sentiment) > 0.01, data.errors?.stocktwits),
      this.evaluateSource('sentiment_news', data.news_sentiment, 
        data.news_sentiment !== undefined && Math.abs(data.news_sentiment) > 0.01, data.errors?.news),
      
      // Technical indicators - use extracted values
      this.evaluateSource('rsi_oversold', actualRSI, actualRSI !== undefined && actualRSI < 35, data.errors?.market_data),
      this.evaluateSource('rsi_overbought', actualRSI, actualRSI !== undefined && actualRSI > 65, data.errors?.market_data),
      this.evaluateSource('volume_spike', actualVolumeRatio, actualVolumeRatio !== undefined, data.errors?.market_data),
      
      // Market data availability
      this.evaluateSource('market_data_polygon', data.polygon_available ? 1 : 0, true, data.errors?.polygon),
      this.evaluateSource('market_data_yahoo', data.yahoo_available ? 1 : 0, true, data.errors?.yahoo),
      
      // Future sources (only count as available if they have meaningful data)
      this.evaluateSource('google_trends', data.google_trends, 
        data.google_trends !== undefined && data.google_trends > 0.15, data.errors?.google_trends),
      this.evaluateSource('youtube_sentiment', data.youtube_sentiment, 
        data.youtube_sentiment !== undefined && Math.abs(data.youtube_sentiment) > 0.05 && Math.abs(data.youtube_sentiment) < 0.95, data.errors?.youtube)
    ];

    // Calculate weighted votes
    const totalVotes = sources
      .filter(source => source.passed)
      .reduce((sum, source) => sum + source.weight, 0);
    
    // For max possible votes, only count actually available sources to avoid unfair penalties
    const availableSources = sources.filter(source => source.available);
    const maxPossibleVotes = availableSources.reduce((sum, source) => sum + source.weight, 0);

    // Calculate confidence score (0-1) - don't penalize for unavailable sources
    const confidenceScore = maxPossibleVotes > 0 ? totalVotes / maxPossibleVotes : 0;

    // ADAPTIVE SCORING LOGIC - Check how many sources are available
    const availableSourcesCount = availableSources.length;
    const sentimentSources = sources.slice(0, 3).filter(s => s.available).length;
    const technicalSources = sources.slice(3, 6).filter(s => s.available).length;
    
    // Determine signal strength with adaptive thresholds based on available sources
    let signalStrength: 'WEAK' | 'MODERATE' | 'STRONG';
    if (availableSourcesCount >= 3) {
      // Strong data availability - use confidence + votes
      if (confidenceScore >= 0.65 && totalVotes >= 2.0) signalStrength = 'STRONG';
      else if (confidenceScore >= 0.5 && totalVotes >= 1.5) signalStrength = 'MODERATE';
      else signalStrength = 'WEAK';
    } else {
      // Limited data - be more flexible but still quality-focused
      if (confidenceScore >= 0.6 && totalVotes >= 1.2) signalStrength = 'STRONG';
      else if (confidenceScore >= 0.4 && totalVotes >= 0.8) signalStrength = 'MODERATE';
      else signalStrength = 'WEAK';
    }

    // ENHANCED RECOMMENDATION LOGIC - Quality over quantity
    let recommendAction = false;
    
    // Base requirements: minimum confidence and sources
    const hasMultipleSources = availableSourcesCount >= 2;
    const hasValidTechnicalData = actualRSI !== undefined && actualRSI > 0 && 
                                  actualVolumeRatio !== undefined && actualVolumeRatio > 0;
    const hasQualitySentiment = sentimentSources >= 1;
    
    // Adaptive recommendation logic based on available data quality
    if (availableSourcesCount >= 3) {
      // Good data availability - standard requirements
      recommendAction = (
        confidenceScore >= 0.45 && // Minimum confidence
        totalVotes >= 1.5 && // Meaningful vote count
        hasMultipleSources && // Multiple source requirement
        (hasQualitySentiment || hasValidTechnicalData) // Quality data requirement
      );
    } else {
      // Limited data - more flexible but still quality-focused
      recommendAction = (
        confidenceScore >= 0.4 && // Lower confidence threshold
        totalVotes >= 1.0 && // Lower vote requirement
        (hasQualitySentiment || hasValidTechnicalData) // Still need quality data
      );
    }

    // Boost signals for strong sentiment with technical confirmation
    const strongSentiment = Math.max(
      data.reddit_sentiment || -1,
      data.stocktwits_sentiment || -1,
      data.news_sentiment || -1
    );
    
    // Apply boosts for strong signals
    if (strongSentiment > 0.5 && (actualVolumeRatio || 0) > 1.2) {
      recommendAction = true;
      signalStrength = signalStrength === 'WEAK' ? 'MODERATE' : signalStrength;
    }
    
    // RSI extreme conditions with volume boost
    if (actualRSI !== undefined && ((actualRSI < 25 && strongSentiment > 0.3) || 
        (actualRSI > 75 && (actualVolumeRatio || 0) > 1.5))) {
      recommendAction = true;
      if (signalStrength === 'WEAK') signalStrength = 'MODERATE';
    }

    // Voting breakdown by category
    const votingBreakdown = {
      sentiment: sources.slice(0, 3).filter(s => s.passed).reduce((sum, s) => sum + s.weight, 0),
      technical: sources.slice(3, 6).filter(s => s.passed).reduce((sum, s) => sum + s.weight, 0),
      market_data: sources.slice(6, 8).filter(s => s.passed).reduce((sum, s) => sum + s.weight, 0),
      future_sources: sources.slice(8).filter(s => s.passed).reduce((sum, s) => sum + s.weight, 0)
    };

    // Apply coverage gate to filter out low-quality recommendations
    const gateCheck = this.coverageGate({
      sentimentScore: votingBreakdown.sentiment,
      technicalScore: votingBreakdown.technical + votingBreakdown.market_data,
      confidence: confidenceScore * 100
    });

    // Override recommendation if it doesn't pass coverage gate
    const finalRecommendAction = recommendAction && gateCheck.passed;

    // Enhanced debugging info with quality metrics
    const debugInfo = {
      availableSources: availableSourcesCount,
      sentimentSources,
      technicalSources,
      degradedMode: availableSourcesCount <= 3,
      strongSentiment,
      volumeBoost: (actualVolumeRatio || 0) > 1.2,
      rsiExtreme: actualRSI !== undefined && (actualRSI < 25 || actualRSI > 75),
      hasValidTechnicalData: hasValidTechnicalData,
      hasQualitySentiment: hasQualitySentiment,
      actualRSI,
      actualVolumeRatio,
      dataQuality: {
        priceAvailable: data.polygon_available || data.yahoo_available,
        rsiValid: actualRSI !== undefined && actualRSI > 0,
        volumeValid: actualVolumeRatio !== undefined && actualVolumeRatio > 0,
        sentimentCount: sentimentSources,
        technicalCount: technicalSources
      }
    };

    return {
      symbol: data.symbol,
      sources,
      totalVotes,
      maxPossibleVotes,
      confidenceScore,
      signalStrength,
      recommendAction: finalRecommendAction,
      passedCoverageGate: gateCheck.passed,
      votingBreakdown,
      coverageGate: {
        sentimentScore: votingBreakdown.sentiment,
        technicalScore: votingBreakdown.technical + votingBreakdown.market_data,
        minSentimentThreshold: SentimentStackingEngine.MIN_SENTIMENT_SCORE,
        minTechnicalThreshold: SentimentStackingEngine.MIN_TECHNICAL_SCORE,
        minConfidenceThreshold: SentimentStackingEngine.MIN_CONFIDENCE,
        reason: gateCheck.reason
      },
      debugInfo // Add debug info to help understand decisions
    };
  }

  // Update configuration
  updateConfig(newConfig: Partial<StackingConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  // Get current configuration
  getConfig(): StackingConfig {
    return { ...this.config };
  }
}

// React component to visualize stacking results
interface StackingVisualizerProps {
  result: StackingResult;
  showDetails?: boolean;
}

export const StackingVisualizer: React.FC<StackingVisualizerProps> = ({ 
  result, 
  showDetails = false 
}) => {
  const getSignalColor = (strength: string) => {
    switch (strength) {
      case 'STRONG': return 'bg-green-100 text-green-800 border-green-200';
      case 'MODERATE': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'WEAK': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">{result.symbol} Sentiment Stack</h4>
        <Badge className={getSignalColor(result.signalStrength)}>
          {result.signalStrength}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Confidence Score</span>
          <span>{(result.confidenceScore * 100).toFixed(1)}%</span>
        </div>
        <Progress value={result.confidenceScore * 100} className="h-2" />
        
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Votes: {result.totalVotes.toFixed(1)} / {result.maxPossibleVotes.toFixed(1)}</span>
          <span>{result.recommendAction ? '✅ Recommended' : '❌ Not Recommended'}</span>
        </div>
        
        {!result.passedCoverageGate && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-800">
            <strong>Coverage Gate:</strong> {result.coverageGate.reason}
          </div>
        )}
      </div>

      {showDetails && (
        <div className="mt-4 space-y-3">
          <h5 className="font-medium text-sm">Voting Breakdown</h5>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span>Sentiment:</span>
              <span>{result.votingBreakdown.sentiment.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span>Technical:</span>
              <span>{result.votingBreakdown.technical.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span>Market Data:</span>
              <span>{result.votingBreakdown.market_data.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span>Future Sources:</span>
              <span>{result.votingBreakdown.future_sources.toFixed(1)}</span>
            </div>
          </div>

          <div className="bg-muted rounded-md p-2 space-y-1 text-xs">
            <h6 className="font-medium text-foreground">Coverage Gate Status</h6>
            <div className="flex justify-between">
              <span className="text-foreground">Sentiment Score:</span>
              <span className={result.coverageGate.sentimentScore >= result.coverageGate.minSentimentThreshold ? 'text-green-600' : 'text-red-600'}>
                {result.coverageGate.sentimentScore.toFixed(1)} (≥{result.coverageGate.minSentimentThreshold})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground">Technical Score:</span>
              <span className={result.coverageGate.technicalScore >= result.coverageGate.minTechnicalThreshold ? 'text-green-600' : 'text-red-600'}>
                {result.coverageGate.technicalScore.toFixed(1)} (≥{result.coverageGate.minTechnicalThreshold})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground">Confidence:</span>
              <span className={(result.confidenceScore * 100) >= result.coverageGate.minConfidenceThreshold ? 'text-green-600' : 'text-red-600'}>
                {(result.confidenceScore * 100).toFixed(1)}% (≥{result.coverageGate.minConfidenceThreshold}%)
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Passed Gate:</span>
              <span className={result.passedCoverageGate ? 'text-green-600' : 'text-red-600'}>
                {result.passedCoverageGate ? '✅ Yes' : '❌ No'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <h6 className="font-medium text-xs">Source Details</h6>
            {result.sources.map((source, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1">
                  {source.passed ? (
                    <CheckCircle className="w-3 h-3 text-green-600" />
                  ) : source.available ? (
                    <XCircle className="w-3 h-3 text-red-600" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-gray-400" />
                  )}
                  {source.name.replace('_', ' ')}
                </span>
                <span className="text-muted-foreground">
                  {source.available ? (
                    source.score !== undefined ? source.score.toFixed(2) : 'N/A'
                  ) : (
                    'Unavailable'
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

export default SentimentStackingEngine;