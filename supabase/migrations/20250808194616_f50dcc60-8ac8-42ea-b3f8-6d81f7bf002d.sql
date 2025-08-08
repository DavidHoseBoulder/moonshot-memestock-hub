-- Clean up any synthetic/mock data from sentiment_history table
-- Remove entries with suspiciously repetitive or obviously synthetic data patterns

-- Delete Google Trends entries that are likely synthetic (all have same pattern)
DELETE FROM sentiment_history 
WHERE source = 'google_trends' 
AND created_at < NOW() - INTERVAL '1 hour'
AND sentiment_score IN (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0);

-- Remove any Twitter entries with exactly 0 sentiment and 0 confidence (placeholder entries)
DELETE FROM sentiment_history 
WHERE source = 'twitter' 
AND sentiment_score = 0 
AND confidence_score = 0;