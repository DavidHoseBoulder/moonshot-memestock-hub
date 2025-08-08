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

-- 3. Remove duplicate news entries (same exact headlines repeated multiple times)
DELETE FROM sentiment_history a
WHERE source = 'news'
AND id NOT IN (
    SELECT MIN(id)
    FROM sentiment_history b
    WHERE b.source = 'news'
    AND b.symbol = a.symbol
    AND b.sentiment_score = a.sentiment_score
    AND b.confidence_score = a.confidence_score
    AND b.metadata->>'sample_headlines' = a.metadata->>'sample_headlines'
    GROUP BY b.symbol, b.sentiment_score, b.confidence_score, b.metadata->>'sample_headlines'
);

-- 4. Remove remaining synthetic Google Trends data with round number scores
DELETE FROM sentiment_history 
WHERE source = 'google_trends' 
AND sentiment_score IN (0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95)
AND confidence_score = 0.5;