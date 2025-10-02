import { aggregateSentiment } from "@/utils/sentimentAggregator";
import { calculateRSI, estimateRSIFromMomentum } from "@/utils/technicalIndicators";

export interface ProcessedStockData {
  symbol: string;
  price: number | null;
  rsi: number | null;
  volumeRatio: number | null;
  volumeSpike: boolean;
  sentimentScore: number | null;
  sentimentSources: string[];
  sentimentCoverage: number;
  sentimentAvailability: {
    reddit: boolean;
    stocktwits: boolean;
    news: boolean;
    google_trends: boolean;
    youtube: boolean;
  };
  dataQuality: {
    hasPrice: boolean;
    hasRSI: boolean;
    hasVolume: boolean;
    hasSentiment: boolean;
    qualityScore: number;
  };
}

/**
 * Process and enhance stock data with better sentiment aggregation and RSI fallbacks
 */
export function processStockData(
  symbol: string,
  marketData: any,
  redditSentiment: Map<string, number>,
  stocktwitsSentiment: Map<string, number | { score: number; confidence: number; stat_score?: number }>,
  newsSentiment: Map<string, number>,
  googleTrends: Map<string, number>,
  youtubeSentiment: Map<string, number>
): ProcessedStockData {
  
  // Price processing
  const price = marketData?.price > 0 ? marketData.price : null;
  
  // Enhanced RSI calculation with fallbacks
  let rsi: number | null = null;
  if (marketData?.technical_indicators?.rsi && marketData.technical_indicators.rsi > 0) {
    rsi = Math.min(100, Math.max(0, marketData.technical_indicators.rsi));
  } else if (marketData?.technical_indicators?.momentum && marketData?.technical_indicators?.volatility) {
    // Fallback RSI estimation from momentum and volatility
    rsi = estimateRSIFromMomentum(
      marketData.technical_indicators.momentum,
      marketData.technical_indicators.volatility
    );
  }
  
  // Volume processing with enhanced spike detection
  const volumeRatio = marketData?.technical_indicators?.volume_ratio || null;
  let volumeSpike = false;
  
  if (volumeRatio !== null) {
    // Dynamic volume spike thresholds based on stock type
    const memeStocks = ['GME', 'AMC', 'BB', 'NOK', 'KOSS', 'EXPR', 'WISH', 'CLOV', 'SNDL'];
    const largeCapStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA'];
    
    let threshold = 1.4; // Base threshold
    if (memeStocks.includes(symbol)) {
      threshold = 1.8; // Higher threshold for volatile meme stocks
    } else if (largeCapStocks.includes(symbol)) {
      threshold = 1.2; // Lower threshold for large caps
    }
    
    volumeSpike = volumeRatio > threshold;
  }
  
  // Enhanced sentiment aggregation with StockTwits support
  const stocktwitsData = stocktwitsSentiment.get(symbol);
  const stocktwitsScore = typeof stocktwitsData === 'number' 
    ? stocktwitsData 
    : stocktwitsData?.score;
  const stocktwitsConfidence = typeof stocktwitsData === 'object' 
    ? stocktwitsData.confidence 
    : 0.8;
    
  const sentimentAgg = aggregateSentiment(
    redditSentiment.get(symbol),
    stocktwitsScore,
    newsSentiment.get(symbol),
    googleTrends.get(symbol),
    youtubeSentiment.get(symbol),
    undefined, // twitter
    0.7, // reddit confidence
    stocktwitsConfidence
  );
  
  // Data quality assessment
  const hasPrice = price !== null && price > 0;
  const hasRSI = rsi !== null && rsi > 0;
  const hasVolume = volumeRatio !== null && volumeRatio > 0;
  const hasSentiment = sentimentAgg.sources.length > 0;
  
  const qualityScore = [hasPrice, hasRSI, hasVolume, hasSentiment].filter(Boolean).length / 4;
  
  return {
    symbol,
    price,
    rsi,
    volumeRatio,
    volumeSpike,
    sentimentScore: sentimentAgg.overall,
    sentimentSources: sentimentAgg.sources,
    sentimentCoverage: sentimentAgg.coverage,
    sentimentAvailability: sentimentAgg.availability,
    dataQuality: {
      hasPrice,
      hasRSI,
      hasVolume,
      hasSentiment,
      qualityScore
    }
  };
}

/**
 * Generate a data quality report for all processed stocks
 */
export function generateDataQualityReport(processedData: ProcessedStockData[]): {
  overall: {
    totalStocks: number;
    qualityStocks: number; // >= 75% quality
    averageQuality: number;
  };
  sentiment: {
    redditCoverage: number;
    stocktwitsCoverage: number;
    newsCoverage: number;
    googleTrendsCoverage: number;
    youtubeCoverage: number;
    averageCoverage: number;
  };
  technical: {
    priceAvailable: number;
    rsiAvailable: number;
    volumeAvailable: number;
  };
  recommendations: string[];
} {
  const total = processedData.length;
  
  if (total === 0) {
    return {
      overall: { totalStocks: 0, qualityStocks: 0, averageQuality: 0 },
      sentiment: { redditCoverage: 0, stocktwitsCoverage: 0, newsCoverage: 0, googleTrendsCoverage: 0, youtubeCoverage: 0, averageCoverage: 0 },
      technical: { priceAvailable: 0, rsiAvailable: 0, volumeAvailable: 0 },
      recommendations: ['No data available for analysis']
    };
  }
  
  const qualityStocks = processedData.filter(d => d.dataQuality.qualityScore >= 0.75).length;
  const averageQuality = processedData.reduce((sum, d) => sum + d.dataQuality.qualityScore, 0) / total;
  
  const redditCoverage = processedData.filter(d => d.sentimentAvailability.reddit).length / total;
  const stocktwitsCoverage = processedData.filter(d => d.sentimentAvailability.stocktwits).length / total;
  const newsCoverage = processedData.filter(d => d.sentimentAvailability.news).length / total;
  const googleTrendsCoverage = processedData.filter(d => d.sentimentAvailability.google_trends).length / total;
  const youtubeCoverage = processedData.filter(d => d.sentimentAvailability.youtube).length / total;
  const averageCoverage = (redditCoverage + stocktwitsCoverage + newsCoverage + googleTrendsCoverage + youtubeCoverage) / 5;
  
  const priceAvailable = processedData.filter(d => d.dataQuality.hasPrice).length / total;
  const rsiAvailable = processedData.filter(d => d.dataQuality.hasRSI).length / total;
  const volumeAvailable = processedData.filter(d => d.dataQuality.hasVolume).length / total;
  
  const recommendations: string[] = [];
  
  if (redditCoverage < 0.3) recommendations.push('Fix Reddit API connection - currently very low coverage');
  if (stocktwitsCoverage < 0.5) recommendations.push('Improve StockTwits data collection');
  if (newsCoverage < 0.4) recommendations.push('Enhance news sentiment processing');
  if (googleTrendsCoverage < 0.6) recommendations.push('Fix Google Trends data collection');
  if (youtubeCoverage < 0.2) recommendations.push('YouTube sentiment needs improvement');
  if (rsiAvailable < 0.7) recommendations.push('Implement RSI fallback calculations for more stocks');
  if (averageQuality < 0.6) recommendations.push('Overall data quality is below target - focus on core data sources');
  
  return {
    overall: { totalStocks: total, qualityStocks, averageQuality },
    sentiment: { redditCoverage, stocktwitsCoverage, newsCoverage, googleTrendsCoverage, youtubeCoverage, averageCoverage },
    technical: { priceAvailable, rsiAvailable, volumeAvailable },
    recommendations
  };
}