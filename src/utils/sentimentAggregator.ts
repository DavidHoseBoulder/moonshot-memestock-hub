// Enhanced sentiment aggregation utilities

export interface SentimentSource {
  name: string;
  sentiment: number; // -1 to 1 range
  confidence: number; // 0 to 1 range
  weight: number; // Relative importance
  available: boolean;
}

export interface AggregatedSentiment {
  overall: number; // -1 to 1 range
  confidence: number; // 0 to 1 range
  sources: string[];
  availability: {
    reddit: boolean;
    stocktwits: boolean;
    news: boolean;
    google_trends: boolean;
    youtube: boolean;
  };
  coverage: number; // 0 to 1 - percentage of sources available
}

/**
 * Aggregate sentiment from multiple sources with intelligent weighting
 */
export function aggregateSentiment(
  reddit?: number,
  stocktwits?: number,
  news?: number,
  googleTrends?: number,
  youtube?: number,
  redditConfidence: number = 0.7,
  stocktwitsConfidence: number = 0.8,
  newsConfidence: number = 0.9
): AggregatedSentiment {
  
  const sources: SentimentSource[] = [
    {
      name: 'reddit',
      sentiment: reddit || 0,
      confidence: redditConfidence,
      weight: 1.3, // Reddit gets good weight for retail sentiment
      available: reddit !== undefined && reddit !== null
    },
    {
      name: 'stocktwits',
      sentiment: stocktwits || 0,
      confidence: stocktwitsConfidence,
      weight: 1.5, // StockTwits is valuable for trading sentiment
      available: stocktwits !== undefined && stocktwits !== null
    },
    {
      name: 'news',
      sentiment: news || 0,
      confidence: newsConfidence,
      weight: 1.2, // News sentiment for fundamental trends
      available: news !== undefined && news !== null
    },
    {
      name: 'google_trends',
      sentiment: googleTrends ? (googleTrends - 0.5) * 1.5 : 0, // Convert 0-1 to -0.75 to 0.75
      confidence: 0.6, // Google Trends is indirect sentiment
      weight: 0.8,
      available: googleTrends !== undefined && googleTrends !== null && googleTrends > 0
    },
    {
      name: 'youtube',
      sentiment: youtube || 0,
      confidence: 0.7,
      weight: 0.9,
      available: youtube !== undefined && youtube !== null
    }
  ];

  const availableSources = sources.filter(s => s.available);
  
  if (availableSources.length === 0) {
    return {
      overall: 0,
      confidence: 0,
      sources: [],
      availability: {
        reddit: false,
        stocktwits: false,
        news: false,
        google_trends: false,
        youtube: false
      },
      coverage: 0
    };
  }

  // Calculate weighted sentiment
  let weightedSum = 0;
  let totalWeight = 0;
  let confidenceSum = 0;

  availableSources.forEach(source => {
    const effectiveWeight = source.weight * source.confidence;
    weightedSum += source.sentiment * effectiveWeight;
    totalWeight += effectiveWeight;
    confidenceSum += source.confidence;
  });

  const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const avgConfidence = confidenceSum / availableSources.length;
  
  // Coverage penalty - fewer sources means lower confidence
  const coveragePenalty = availableSources.length / sources.length;
  const adjustedConfidence = avgConfidence * coveragePenalty;

  return {
    overall: Math.max(-1, Math.min(1, overall)), // Ensure bounds
    confidence: adjustedConfidence,
    sources: availableSources.map(s => s.name),
    availability: {
      reddit: sources[0].available,
      stocktwits: sources[1].available,
      news: sources[2].available,
      google_trends: sources[3].available,
      youtube: sources[4].available
    },
    coverage: coveragePenalty
  };
}

/**
 * Convert sentiment score to readable label
 */
export function getSentimentLabel(sentiment: number): string {
  if (sentiment > 0.3) return 'Bullish';
  if (sentiment > 0.1) return 'Slightly Bullish';
  if (sentiment < -0.3) return 'Bearish';
  if (sentiment < -0.1) return 'Slightly Bearish';
  return 'Neutral';
}

/**
 * Calculate sentiment velocity (rate of change)
 */
export function calculateSentimentVelocity(
  current: number,
  previous: number,
  timeframe: number = 1
): number {
  if (previous === 0) return 0;
  return (current - previous) / timeframe;
}

/**
 * Normalize sentiment from different scales to -1 to 1
 */
export function normalizeSentiment(value: number, sourceType: 'percentage' | 'score' | 'binary'): number {
  switch (sourceType) {
    case 'percentage': // 0-100 scale
      return (value - 50) / 50;
    case 'score': // Already -1 to 1
      return Math.max(-1, Math.min(1, value));
    case 'binary': // 0 or 1
      return value === 1 ? 0.5 : -0.5;
    default:
      return 0;
  }
}