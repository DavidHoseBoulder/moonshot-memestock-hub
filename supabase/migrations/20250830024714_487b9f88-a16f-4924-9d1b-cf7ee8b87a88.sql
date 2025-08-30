-- Create reddit_daily_sentiment_v1 view that aggregates Reddit sentiment by day, symbol, and doc_type
CREATE OR REPLACE VIEW reddit_daily_sentiment_v1 AS
WITH daily_sentiment AS (
  SELECT 
    DATE(m.created_utc) as day,
    m.symbol,
    m.doc_type,
    COUNT(*) as n_scored,
    COUNT(CASE WHEN s.overall_score > 0 THEN 1 END) as n_pos,
    COUNT(CASE WHEN s.overall_score = 0 THEN 1 END) as n_neu,
    COUNT(CASE WHEN s.overall_score < 0 THEN 1 END) as n_neg,
    AVG(s.overall_score) as avg_score,
    AVG(s.confidence) as avg_confidence
  FROM reddit_mentions m
  INNER JOIN reddit_sentiment s ON m.mention_id = s.mention_id
  WHERE s.overall_score IS NOT NULL 
    AND s.confidence IS NOT NULL
    AND m.doc_type IN ('post', 'comment')
  GROUP BY DATE(m.created_utc), m.symbol, m.doc_type
),
-- Add 'all' aggregation (combining posts and comments)
all_sentiment AS (
  SELECT 
    day,
    symbol,
    'all' as doc_type,
    SUM(n_scored) as n_scored,
    SUM(n_pos) as n_pos,
    SUM(n_neu) as n_neu,
    SUM(n_neg) as n_neg,
    AVG(avg_score) as avg_score,
    AVG(avg_confidence) as avg_confidence
  FROM daily_sentiment
  GROUP BY day, symbol
)
-- Union all results
SELECT * FROM daily_sentiment
UNION ALL
SELECT * FROM all_sentiment
ORDER BY day DESC, symbol, doc_type;