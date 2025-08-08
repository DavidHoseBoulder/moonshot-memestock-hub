-- Clean up synthetic and duplicate data across all sentiment sources

-- 1. Remove StockTwits entries that are all 0 sentiment with 0.7 confidence (clearly synthetic pattern)
DELETE FROM sentiment_history 
WHERE source = 'stocktwits' 
AND sentiment_score = 0 
AND confidence_score = 0.7;

-- 2. Remove YouTube entries with 0 sentiment and 0 confidence (no actual data)
DELETE FROM sentiment_history 
WHERE source = 'youtube' 
AND sentiment_score = 0 
AND confidence_score = 0;

-- 3. Remove duplicate news entries using created_at instead of id for grouping
WITH duplicates AS (
    SELECT symbol, sentiment_score, confidence_score, metadata->>'sample_headlines' as headlines,
           created_at,
           ROW_NUMBER() OVER (
               PARTITION BY symbol, sentiment_score, confidence_score, metadata->>'sample_headlines' 
               ORDER BY created_at
           ) as rn
    FROM sentiment_history 
    WHERE source = 'news'
)
DELETE FROM sentiment_history 
WHERE source = 'news' 
AND created_at IN (
    SELECT created_at FROM duplicates WHERE rn > 1
);

-- 4. Remove remaining synthetic Google Trends data with round number scores
DELETE FROM sentiment_history 
WHERE source = 'google_trends' 
AND sentiment_score IN (0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95)
AND confidence_score = 0.5;