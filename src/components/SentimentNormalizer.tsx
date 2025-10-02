// Sentiment normalization utilities for consistent 0-1 scaling

export interface RawSentimentData {
  reddit?: {
    sentiment: number; // Can be -1 to 1 or 0 to 1 depending on source
    confidence: number;
    posts_count: number;
  };
  stocktwits?: {
    bullish_ratio?: number; // Usually 0-1
    total_messages: number;
    sentiment_score?: number; // -1 to 1 from sentiment_history
    stat_score?: number; // -1 to 1 follower-weighted
    confidence_score?: number; // from sentiment_history
    follower_sum?: number;
  };
  news?: {
    sentiment: number; // Often -1 to 1
    articles_count: number;
    relevance_score?: number;
  };
  youtube?: {
    sentiment: number; // -1 to 1
    comment_count: number;
    engagement_score?: number;
  };
}

export interface NormalizedSentiment {
  reddit_sentiment?: number; // 0-1 scale
  stocktwits_sentiment?: number; // 0-1 scale  
  news_sentiment?: number; // 0-1 scale
  youtube_sentiment?: number; // 0-1 scale
  sentiment_velocity?: number; // Change from previous period
  confidence_weights: {
    reddit: number;
    stocktwits: number;
    news: number;
    youtube: number;
  };
}

export class SentimentNormalizer {
  // Convert various sentiment scales to 0-1
  private normalizeToZeroOne(value: number, sourceType: 'bipolar' | 'unipolar' = 'bipolar'): number {
    if (sourceType === 'bipolar') {
      // Convert -1 to 1 range to 0 to 1
      return Math.max(0, Math.min(1, (value + 1) / 2));
    }
    // Already 0-1, just clamp
    return Math.max(0, Math.min(1, value));
  }

  // Calculate confidence weight based on data quality
  private calculateConfidenceWeight(
    baseScore: number,
    volume: number,
    minVolume: number = 5
  ): number {
    if (volume < minVolume) return 0; // Insufficient data
    
    // Logarithmic scaling for volume confidence
    const volumeWeight = Math.min(1, Math.log10(volume / minVolume + 1));
    return baseScore * volumeWeight;
  }

  normalize(rawData: RawSentimentData, previousSentiment?: NormalizedSentiment): NormalizedSentiment {
    const result: NormalizedSentiment = {
      confidence_weights: {
        reddit: 0,
        stocktwits: 0,
        news: 0,
        youtube: 0
      }
    };

    // Reddit normalization
    if (rawData.reddit && rawData.reddit.posts_count >= 3) {
      result.reddit_sentiment = this.normalizeToZeroOne(rawData.reddit.sentiment, 'bipolar');
      result.confidence_weights.reddit = this.calculateConfidenceWeight(
        rawData.reddit.confidence,
        rawData.reddit.posts_count,
        3
      );
    }

    // StockTwits normalization - prioritize follower-weighted stat_score from sentiment_history
    if (rawData.stocktwits && rawData.stocktwits.total_messages >= 5) {
      // Priority: stat_score (follower-weighted) > sentiment_score > bullish_ratio
      let sentimentValue: number;
      
      if (rawData.stocktwits.stat_score !== undefined && rawData.stocktwits.stat_score !== null) {
        // stat_score is already -1 to 1, normalize to 0-1
        sentimentValue = this.normalizeToZeroOne(rawData.stocktwits.stat_score, 'bipolar');
      } else if (rawData.stocktwits.sentiment_score !== undefined && rawData.stocktwits.sentiment_score !== null) {
        sentimentValue = this.normalizeToZeroOne(rawData.stocktwits.sentiment_score, 'bipolar');
      } else if (rawData.stocktwits.bullish_ratio !== undefined && rawData.stocktwits.bullish_ratio !== null) {
        sentimentValue = rawData.stocktwits.bullish_ratio;
      } else {
        return; // Skip if no sentiment data available
      }
      
      result.stocktwits_sentiment = sentimentValue;
      
      // Use confidence_score from sentiment_history, or calculate from message volume
      const baseConfidence = rawData.stocktwits.confidence_score ?? 0.8;
      result.confidence_weights.stocktwits = this.calculateConfidenceWeight(
        baseConfidence,
        rawData.stocktwits.total_messages,
        5
      );
    }

    // News normalization
    if (rawData.news && rawData.news.articles_count >= 2) {
      result.news_sentiment = this.normalizeToZeroOne(rawData.news.sentiment, 'bipolar');
      result.confidence_weights.news = this.calculateConfidenceWeight(
        rawData.news.relevance_score || 0.7,
        rawData.news.articles_count,
        2
      );
    }

    // YouTube normalization
    if (rawData.youtube && rawData.youtube.comment_count >= 10) {
      result.youtube_sentiment = this.normalizeToZeroOne(rawData.youtube.sentiment, 'bipolar');
      result.confidence_weights.youtube = this.calculateConfidenceWeight(
        rawData.youtube.engagement_score || 0.6,
        rawData.youtube.comment_count,
        10
      );
    }

    // Calculate sentiment velocity if previous data exists
    if (previousSentiment) {
      const currentAvg = this.calculateWeightedAverage(result);
      const previousAvg = this.calculateWeightedAverage(previousSentiment);
      
      if (currentAvg !== null && previousAvg !== null) {
        result.sentiment_velocity = currentAvg - previousAvg;
      }
    }

    return result;
  }

  // Calculate weighted average sentiment score
  calculateWeightedAverage(sentiment: NormalizedSentiment): number | null {
    let totalScore = 0;
    let totalWeight = 0;

    if (sentiment.reddit_sentiment !== undefined) {
      totalScore += sentiment.reddit_sentiment * sentiment.confidence_weights.reddit;
      totalWeight += sentiment.confidence_weights.reddit;
    }

    if (sentiment.stocktwits_sentiment !== undefined) {
      totalScore += sentiment.stocktwits_sentiment * sentiment.confidence_weights.stocktwits;
      totalWeight += sentiment.confidence_weights.stocktwits;
    }

    if (sentiment.news_sentiment !== undefined) {
      totalScore += sentiment.news_sentiment * sentiment.confidence_weights.news;
      totalWeight += sentiment.confidence_weights.news;
    }

    if (sentiment.youtube_sentiment !== undefined) {
      totalScore += sentiment.youtube_sentiment * sentiment.confidence_weights.youtube;
      totalWeight += sentiment.confidence_weights.youtube;
    }

    return totalWeight > 0 ? totalScore / totalWeight : null;
  }

  // Check if sentiment data meets minimum quality thresholds
  meetsQualityThreshold(sentiment: NormalizedSentiment, minSources: number = 2): boolean {
    const activeSourcesCount = [
      sentiment.reddit_sentiment,
      sentiment.stocktwits_sentiment,
      sentiment.news_sentiment,
      sentiment.youtube_sentiment
    ].filter(s => s !== undefined).length;

    const totalConfidence = Object.values(sentiment.confidence_weights).reduce((a, b) => a + b, 0);

    return activeSourcesCount >= minSources && totalConfidence >= 0.3;
  }
}

export default SentimentNormalizer;