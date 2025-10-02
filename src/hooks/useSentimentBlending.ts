import { useState } from 'react';

export interface BlendingWeights {
  reddit: number;
  stocktwits: number;
}

export interface BlendedSentiment {
  reddit_score: number | null;
  stocktwits_score: number | null;
  blended_score: number | null;
  reddit_confidence: number;
  stocktwits_confidence: number;
  blended_confidence: number;
}

const PRESET_WEIGHTS = {
  'reddit-only': { reddit: 1.0, stocktwits: 0.0 },
  '60-40': { reddit: 0.6, stocktwits: 0.4 },
  '50-50': { reddit: 0.5, stocktwits: 0.5 },
  '40-60': { reddit: 0.4, stocktwits: 0.6 },
  'stocktwits-only': { reddit: 0.0, stocktwits: 1.0 },
} as const;

export type WeightPreset = keyof typeof PRESET_WEIGHTS;

export const useSentimentBlending = (initialPreset: WeightPreset = '60-40') => {
  const [weights, setWeights] = useState<BlendingWeights>(PRESET_WEIGHTS[initialPreset]);
  const [preset, setPreset] = useState<WeightPreset>(initialPreset);

  const applyPreset = (newPreset: WeightPreset) => {
    setPreset(newPreset);
    setWeights(PRESET_WEIGHTS[newPreset]);
  };

  const setCustomWeights = (newWeights: BlendingWeights) => {
    // Normalize to sum to 1.0
    const total = newWeights.reddit + newWeights.stocktwits;
    if (total > 0) {
      setWeights({
        reddit: newWeights.reddit / total,
        stocktwits: newWeights.stocktwits / total,
      });
    }
    setPreset('60-40'); // Reset preset indicator when custom
  };

  const blendSentiment = (
    redditScore: number | null,
    stocktwitsScore: number | null,
    redditConfidence: number = 0.7,
    stocktwitsConfidence: number = 0.8
  ): BlendedSentiment => {
    let blendedScore: number | null = null;
    let blendedConfidence = 0;

    const hasReddit = redditScore !== null && redditScore !== undefined;
    const hasStocktwits = stocktwitsScore !== null && stocktwitsScore !== undefined;

    if (hasReddit && hasStocktwits) {
      // Both sources available - blend with weights
      blendedScore = (redditScore * weights.reddit) + (stocktwitsScore * weights.stocktwits);
      blendedConfidence = (redditConfidence * weights.reddit) + (stocktwitsConfidence * weights.stocktwits);
    } else if (hasReddit) {
      // Only Reddit available
      blendedScore = redditScore;
      blendedConfidence = redditConfidence;
    } else if (hasStocktwits) {
      // Only StockTwits available
      blendedScore = stocktwitsScore;
      blendedConfidence = stocktwitsConfidence;
    }

    return {
      reddit_score: redditScore,
      stocktwits_score: stocktwitsScore,
      blended_score: blendedScore,
      reddit_confidence: hasReddit ? redditConfidence : 0,
      stocktwits_confidence: hasStocktwits ? stocktwitsConfidence : 0,
      blended_confidence: blendedConfidence,
    };
  };

  return {
    weights,
    preset,
    applyPreset,
    setCustomWeights,
    blendSentiment,
    presets: Object.keys(PRESET_WEIGHTS) as WeightPreset[],
  };
};
