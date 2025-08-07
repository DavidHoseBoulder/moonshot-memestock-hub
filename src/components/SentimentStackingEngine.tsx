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
  votingBreakdown: {
    sentiment: number;
    technical: number;
    market_data: number;
    future_sources: number;
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
  
  // Future sources (prepared but not active)
  google_trends: { threshold: 50, weight: 1.0 }, // Trends score > 50
  youtube_sentiment: { threshold: 0.3, weight: 0.9 } // YouTube sentiment > 0.3
};

export class SentimentStackingEngine {
  private config: StackingConfig;
  
  constructor(config: StackingConfig = DEFAULT_STACKING_CONFIG) {
    this.config = config;
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
    volume_ratio?: number;
    polygon_available?: boolean;
    yahoo_available?: boolean;
    google_trends?: number;
    youtube_sentiment?: number;
    errors?: { [key: string]: string };
  }): StackingResult {
    
    const sources: DataSource[] = [
      // Sentiment sources
      this.evaluateSource('sentiment_reddit', data.reddit_sentiment, data.reddit_sentiment !== undefined, data.errors?.reddit),
      this.evaluateSource('sentiment_stocktwits', data.stocktwits_sentiment, data.stocktwits_sentiment !== undefined, data.errors?.stocktwits),
      this.evaluateSource('sentiment_news', data.news_sentiment, data.news_sentiment !== undefined, data.errors?.news),
      
      // Technical indicators
      this.evaluateSource('rsi_oversold', data.rsi, data.rsi !== undefined && data.rsi < 35, data.errors?.market_data),
      this.evaluateSource('rsi_overbought', data.rsi, data.rsi !== undefined && data.rsi > 65, data.errors?.market_data),
      this.evaluateSource('volume_spike', data.volume_ratio, data.volume_ratio !== undefined, data.errors?.market_data),
      
      // Market data availability
      this.evaluateSource('market_data_polygon', data.polygon_available ? 1 : 0, true, data.errors?.polygon),
      this.evaluateSource('market_data_yahoo', data.yahoo_available ? 1 : 0, true, data.errors?.yahoo),
      
      // Future sources (will be 0 until implemented)
      this.evaluateSource('google_trends', data.google_trends, data.google_trends !== undefined, data.errors?.google_trends),
      this.evaluateSource('youtube_sentiment', data.youtube_sentiment, data.youtube_sentiment !== undefined, data.errors?.youtube)
    ];

    // Calculate weighted votes
    const totalVotes = sources
      .filter(source => source.passed)
      .reduce((sum, source) => sum + source.weight, 0);
    
    const maxPossibleVotes = sources
      .filter(source => source.available)
      .reduce((sum, source) => sum + source.weight, 0);

    // Calculate confidence score (0-1)
    const confidenceScore = maxPossibleVotes > 0 ? totalVotes / maxPossibleVotes : 0;

    // Determine signal strength
    let signalStrength: 'WEAK' | 'MODERATE' | 'STRONG';
    if (confidenceScore >= 0.7) signalStrength = 'STRONG';
    else if (confidenceScore >= 0.4) signalStrength = 'MODERATE';
    else signalStrength = 'WEAK';

    // Recommend action based on minimum threshold
    const recommendAction = confidenceScore >= 0.4 && totalVotes >= 2.0;

    // Voting breakdown by category
    const votingBreakdown = {
      sentiment: sources.slice(0, 3).filter(s => s.passed).reduce((sum, s) => sum + s.weight, 0),
      technical: sources.slice(3, 6).filter(s => s.passed).reduce((sum, s) => sum + s.weight, 0),
      market_data: sources.slice(6, 8).filter(s => s.passed).reduce((sum, s) => sum + s.weight, 0),
      future_sources: sources.slice(8).filter(s => s.passed).reduce((sum, s) => sum + s.weight, 0)
    };

    return {
      symbol: data.symbol,
      sources,
      totalVotes,
      maxPossibleVotes,
      confidenceScore,
      signalStrength,
      recommendAction,
      votingBreakdown
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