import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  '30-70': { reddit: 0.3, stocktwits: 0.7 },
  'stocktwits-only': { reddit: 0.0, stocktwits: 1.0 },
} as const;

export type WeightPreset = keyof typeof PRESET_WEIGHTS;

// Helper to find closest preset match for given weights
const findClosestPreset = (weights: BlendingWeights): WeightPreset => {
  let closestPreset: WeightPreset = '30-70';
  let minDistance = Infinity;
  
  Object.entries(PRESET_WEIGHTS).forEach(([presetName, presetWeights]) => {
    const distance = Math.abs(presetWeights.reddit - weights.reddit) + 
                     Math.abs(presetWeights.stocktwits - weights.stocktwits);
    if (distance < minDistance) {
      minDistance = distance;
      closestPreset = presetName as WeightPreset;
    }
  });
  
  return closestPreset;
};

export const useSentimentBlending = (initialPreset: WeightPreset = '30-70') => {
  const [weights, setWeights] = useState<BlendingWeights>(PRESET_WEIGHTS[initialPreset]);
  const [preset, setPreset] = useState<WeightPreset>(initialPreset);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch sentiment_blend from active reddit_heuristics on mount
  useEffect(() => {
    const fetchHeuristicsWeights = async () => {
      try {
        const { data, error } = await supabase
          .from('reddit_heuristics')
          .select('sentiment_blend')
          .eq('is_active', true)
          .order('effective_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn('⚠️ Error fetching reddit_heuristics:', error);
          return;
        }

        if (data) {
          const blend = (data as any).sentiment_blend;
          // Check if blend has reddit/stocktwits properties
          if (blend && typeof blend === 'object' && 
              typeof blend.reddit === 'number' && 
              typeof blend.stocktwits === 'number') {
            console.log('📊 Loaded sentiment_blend from reddit_heuristics:', blend);
            const total = blend.reddit + blend.stocktwits;
            if (total > 0) {
              const normalizedWeights = {
                reddit: blend.reddit / total,
                stocktwits: blend.stocktwits / total,
              };
              setWeights(normalizedWeights);
              setPreset(findClosestPreset(normalizedWeights));
            }
          } else {
            console.log('📊 sentiment_blend format invalid, using fallback 30-70');
          }
        } else {
          console.log('📊 No sentiment_blend in reddit_heuristics, using fallback 30-70');
        }
      } catch (err) {
        console.error('❌ Exception fetching reddit_heuristics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHeuristicsWeights();
  }, []);

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
    isLoading,
  };
};
